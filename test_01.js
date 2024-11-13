require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const speech = require('@google-cloud/speech');
const textToSpeech = require('@google-cloud/text-to-speech');
const { GoogleAuth } = require('google-auth-library');
const { Transform } = require('stream');

const app = express();
expressWs(app);
app.use(bodyParser.json());
app.use(cors());
const PORT = 8888;

const speechClient = new speech.SpeechClient();
const ttsClient = new textToSpeech.TextToSpeechClient();

let audioBuffer = Buffer.alloc(0);
const responseCache = {};
const BASE_AUDIO_URL = `http://localhost:${PORT}/audio`;

// 음성 파일이 생성되었을 때 NCCO의 URL을 반환하는 함수
function createAnswerHandler(audioFilename) {
  const audioUrl = `${BASE_AUDIO_URL}/${audioFilename}`;
  const ncco = [
    {
      action: 'stream',
      streamUrl: [audioUrl],
      level: 1
    }
  ];
  return (req, res) => res.json(ncco);
}
app.use('/audio', express.static(path.join(__dirname, 'audio')));
const answerHandler = (req, res) => {
  const audioFile = `/audio/output-${Date.now()}.wav`;  // 예시로 현재 타임스탬프를 사용하여 동적으로 설정 가능
  const ncco = [
    {
      action: 'talk',
      text: '상담을 원하시면 말씀해주세요.'
    },
    {
      action: 'stream',
      streamUrl: [`http://<서버 IP>:8888${audioFile}`]  // 오디오 파일 URL을 동적으로 설정
    },
    {
      action: 'connect',
      endpoint: [
        {
          type: 'websocket',
          uri: 'wss://860f-222-112-27-104.ngrok-free.app/websocket',
          contentType: 'audio/l16;rate=16000'
        }
      ]
    }
  ];
  res.json(ncco);
};
async function synthesizeTextToSpeech(text) {
  const ttsClient = new textToSpeech.TextToSpeechClient();
  const outputDir = path.join(__dirname, 'audio');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const request = {
    input: { text },
    voice: { languageCode: 'ko-KR', ssmlGender: 'NEUTRAL' },
    audioConfig: { audioEncoding: 'LINEAR16' },
  };

  const [response] = await ttsClient.synthesizeSpeech(request);
  const outputFile = path.join(outputDir, `output-${Date.now()}.wav`);
  fs.writeFileSync(outputFile, response.audioContent, 'binary');

  return path.basename(outputFile);
}

app.post('/generate-answer', async (req, res) => {
  const text = req.body.text;
  const audioFilename = await synthesizeTextToSpeech(text);
  createAnswerHandler(audioFilename)(req, res);
});


app.get('/answer', answerHandler);
app.post('/answer', answerHandler);
app.post('/event', (req, res) => {
  console.log('Event received:', req.body);
  res.status(200).send('Event received');
});

app.ws('/websocket', (ws, req) => {
  console.log('WebSocket 연결이 수립되었습니다.');

  ws.on('message', (message) => {
    if (!(message instanceof Buffer)) {
      console.error('Invalid message format. Expected Buffer format.');
      return;
    }

    audioBuffer = Buffer.concat([audioBuffer, message]);

    if (audioBuffer.length > 16000 * 2) {
      processBufferedAudio(ws);
      audioBuffer = Buffer.alloc(0);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket 연결이 종료되었습니다.');
  });

  ws.on('error', (error) => {
    console.error('WebSocket 오류 발생:', error);
  });
});

let lastRecognizedText = ''; // 이전 인식된 텍스트를 저장할 변수

async function processBufferedAudio(ws) {
  try {
    const isSilent = checkIfSilent(audioBuffer);
    if (isSilent) {
      console.log('오디오가 무음입니다. 응답을 생략합니다.');
      return; // 응답 없이 함수 종료
    }

    const text = await transcribeSpeechToText(audioBuffer);

    if (!text || text === lastRecognizedText) {
      console.log('중복되거나 빈 텍스트 인식 - 응답 생략:', text);
      return;
    }

    // "여보세요"와 같은 단순 인사말은 응답하지 않도록 설정
    const ignoreResponses = ["여보세요", "오세요", "안녕하세요"];
    if (ignoreResponses.includes(text)) {
      console.log('인사말 인식 - 응답 생략');
      lastRecognizedText = text; // 마지막 인식된 텍스트로 저장
      return;
    }

    lastRecognizedText = text; // 마지막 인식된 텍스트 갱신
    console.log('텍스트로 변환된 고객 음성:', text);

    const responseText = await generateResponseFromPythonServer(text);
    console.log('LangChain에서 생성된 응답:', responseText);

    const audioUrl = await synthesizeTextToSpeech(responseText);
    console.log('생성된 음성 파일 경로:', audioUrl);

    ws.send(JSON.stringify({ audioUrl }));
  } catch (error) {
    console.error('WebSocket 처리 중 오류 발생:', error);
  }
}
async function transcribeSpeechToText(audioBuffer) {
  const audio = {
    content: audioBuffer.toString('base64'),
  };
  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: 'ko-KR',
  };
  const request = {
    audio: audio,
    config: config,
  };

  try {
    const [response] = await speechClient.recognize(request);
    return response.results.map(result => result.alternatives[0].transcript).join('\n');
  } catch (error) {
    console.error('STT 요청 중 오류 발생:', error);
    return '';
  }
}

function checkIfSilent(buffer) {
  const threshold = 40;
  let total = 0;
  for (let i = 0; i < buffer.length; i += 2) {
    const value = buffer.readInt16LE(i);
    total += Math.abs(value);
  }
  const average = total / (buffer.length / 2);
  return average < threshold;
}

async function generateResponseFromPythonServer(inputText) {
  try {
    console.log('Sending to Python server:', inputText);
    const response = await axios.post('http://localhost:5001/generate_response', { text: inputText },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );
    console.log('Received response from Python server:', response.data);
    return response.data.response;
  } catch (error) {
    console.error('LangChain 서버 오류:', error.message);
    return '응답을 생성할 수 없습니다.';
  }
}
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

