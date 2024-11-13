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
const { Transform } = require('stream');

const app = express();
expressWs(app);
app.use(bodyParser.json());
app.use(cors());

const PORT = 8888;

// Google Cloud STT, TTS 클라이언트 설정
const speechClient = new speech.SpeechClient();
const ttsClient = new textToSpeech.TextToSpeechClient();

// WebSocket 연결 상태를 주기적으로 확인
let ws;
let audioBuffer = Buffer.alloc(0); // 오디오 데이터 버퍼 초기화
let responseCache = {};
let silenceTimeout;

// Answer URL 엔드포인트 설정
const answerHandler = (req, res) => {
  const ncco = [
    {
      action: 'talk',
      text: '상담을 원하시면 말씀해주세요.'
    },
    {
      action: 'connect',
      endpoint: [
        {
          type: 'websocket',
          uri: 'wss://7aaf-222-112-27-104.ngrok-free.app/websocket', // 최신 ngrok URL 확인
          contentType: 'audio/l16;rate=16000'
        }
      ]
    }
  ];
  res.json(ncco);
};

app.get('/answer', answerHandler);
app.post('/answer', answerHandler);
app.post('/event', (req, res) => {
  console.log('Event received:', req.body);
  res.status(200).send('Event received');
});

// WebSocket 엔드포인트 설정
app.ws('/websocket', (wsConnection, req) => {
  ws = wsConnection;
  console.log('WebSocket 연결이 수립되었습니다.');

  ws.on('message', (message) => {
    if (!(message instanceof Buffer)) {
      console.error('Invalid message format. Expected Buffer format.');
      return;
    }

    audioBuffer = Buffer.concat([audioBuffer, message]);

    // 무음 타이머 재설정
    clearTimeout(silenceTimeout);
    silenceTimeout = setTimeout(() => {
      console.log('2초 이상 무음, 음성 처리 시작');
      processBufferedAudio(ws, audioBuffer); // 버퍼를 전달하여 처리
      audioBuffer = Buffer.alloc(0); // 버퍼 초기화
    }, 2000); // 2초 무음 감지
  });

  ws.on('close', () => {
    console.log('WebSocket 연결이 종료되었습니다.');
  });

  ws.on('error', (error) => {
    console.error('WebSocket 오류 발생:', error);
  });
});

// 무음 체크 함수
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

// 버퍼링된 오디오 처리 함수
async function processBufferedAudio(ws, audioBuffer) {
  try {
    console.log('버퍼 처리 중...');
    const isSilent = checkIfSilent(audioBuffer);
    if (isSilent) {
      console.log('오디오가 무음입니다.');
      ws.send(JSON.stringify({ audioUrl: '응답 없음' }));
      return;
    }

    const text = await transcribeSpeechToText(audioBuffer);
    if (!text) {
      console.log('STT 변환 실패: 변환된 텍스트가 비어 있습니다.');
      return;
    }

    console.log('텍스트로 변환된 고객 음성:', text);

    let responseText;
    if (responseCache[text]) {
      responseText = responseCache[text];
      console.log('캐시된 응답 사용:', responseText);
    } else {
      responseText = await generateResponseFromPythonServer(text);
      responseCache[text] = responseText;
      console.log('LangChain에서 생성된 응답:', responseText);
    }

    const audioUrl = await synthesizeTextToSpeech(responseText);
    if (!audioUrl) {
      console.log('음성 생성 실패');
      return;
    }

    console.log('생성된 음성 파일 경로:', audioUrl);
    const audioFileBuffer = fs.readFileSync(audioUrl);  // 오디오 파일을 읽어서 버퍼로 변환
    ws.send(audioFileBuffer);  // 음성 데이터를 WebSocket을 통해 전송
  } catch (error) {
    console.error('WebSocket 처리 중 오류 발생:', error);
  }
}

async function transcribeSpeechToText(audioBuffer) {
  const audio = { content: audioBuffer.toString('base64') };
  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: 'ko-KR',
    model: 'phone_call', // 전화 환경에 최적화된 모델
    useEnhanced: true // 향상된 모델 사용
  };
  const request = { audio: audio, config: config };

  try {
    const [response] = await speechClient.recognize(request);
    if (response.results.length === 0) {
      console.log('STT 변환 결과 없음');
      return '';
    }
    return response.results.map(result => result.alternatives[0].transcript).join('\n');
  } catch (error) {
    console.error('STT 요청 중 오류 발생:', error);
    return '';
  }
}

async function synthesizeTextToSpeech(text) {
  const outputDir = path.join(__dirname, 'audio');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const request = {
    input: { text: text },
    voice: { languageCode: 'ko-KR', ssmlGender: 'NEUTRAL' },
    audioConfig: { audioEncoding: 'LINEAR16' },
  };

  try {
    const [response] = await ttsClient.synthesizeSpeech(request);
    const outputFile = path.join(outputDir, `output-${Date.now()}.wav`);
    fs.writeFileSync(outputFile, response.audioContent, 'binary');
    return outputFile;
  } catch (error) {
    console.error('음성 합성 중 오류 발생:', error);
    return null;
  }
}

async function generateResponseFromPythonServer(inputText) {
  try {
    const response = await axios.post('http://localhost:5001/generate_response', { text: inputText });
    return response.data.response;
  } catch (error) {
    console.error('LangChain 서버 오류:', error.message);
    return '응답을 생성할 수 없습니다.';
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
