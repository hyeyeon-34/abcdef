require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const speech = require('@google-cloud/speech');
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const { Vonage } = require('@vonage/server-sdk');  // Vonage 클래스를 사용
const WebSocket = require('ws');

const app = express();
expressWs(app);
app.use(bodyParser.json());
app.use(cors());

const PORT = 8888;

// Google Cloud STT 설정
const speechClient = new speech.SpeechClient();
let currentCallUuid = null;

// Vonage 설정
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: fs.readFileSync(process.env.VONAGE_APPLICATION_PRIVATE_KEY_PATH)
});

app.post('/events', (req, res) => {
  console.log('Event received:', req.body);
  if (req.body.uuid) {
    currentCallUuid = req.body.uuid; // UUID 저장
    console.log("UUID saved:", currentCallUuid);
  }
  res.status(200).send('Event received');
});

// AWS Polly 설정
const polly = new PollyClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

let ws;  // WebSocket 객체 전역으로 설정
let audioBuffer = Buffer.alloc(0);
let responseCache = {};

// Answer URL 엔드포인트 설정
const answerHandler = (req, res) => {
  const ncco = [
    {
      "action": "talk",
      "language": "ko-KR",
      "text": "상담을 원하시면 말씀해주세요."
    },
    {
      "action": "connect",
      "endpoint": [
        {
          "type": "websocket",
          "uri": "wss://9bea-222-112-27-104.ngrok-free.app/websocket",
          "headers": {
            "Content-Type": "audio/l16;rate=16000"
          }
        }
      ]
    }
  ];
  res.json(ncco);
};

app.get('/answer', answerHandler);
app.post('/answer', answerHandler);

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

    if (audioBuffer.length > 16000 * 2) {
      console.log('처리 시작: 버퍼 길이', audioBuffer.length);
      processBufferedAudio(ws, audioBuffer);
      audioBuffer = Buffer.alloc(0); // 버퍼 초기화
    }
  });

  ws.on('close', () => {
    console.log('WebSocket 연결이 종료되었습니다.');
  });

  ws.on('error', (error) => {
    console.error('WebSocket 오류 발생:', error);
  });
});

async function processBufferedAudio(ws, audioBuffer) {
  try {
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

    // playAudioOnCall(audioUrl);  // 오디오 URL을 통해 호출에서 재생
  } catch (error) {
    console.error('오디오 처리 중 오류 발생:', error);
  }
}

async function transcribeSpeechToText(audioBuffer) {
  const audio = { content: audioBuffer.toString('base64') };
  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: 'ko-KR',
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

const ngrokUrl = 'https://9bea-222-112-27-104.ngrok-free.app'
// Google TTS 대신 Amazon Polly를 사용하는 TTS 함수
async function synthesizeTextToSpeech(text) {
  const outputDir = path.join(__dirname, 'audio');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const params = {
    Text: text,
    OutputFormat: 'mp3',
    VoiceId: 'Seoyeon',
    SampleRate: '16000'
  };

  try {
    const command = new SynthesizeSpeechCommand(params);
    const { AudioStream } = await polly.send(command);
    const outputFile = path.join(outputDir, `output-${Date.now()}.mp3`);
    const writeStream = fs.createWriteStream(outputFile);

    return new Promise((resolve, reject) => {
      AudioStream.pipe(writeStream);
      writeStream.on('finish', () => {
        console.log('음성 합성 완료:', outputFile);
        const externalUrl = `${ngrokUrl}/audio/${path.basename(outputFile)}`; // 외부 접근 가능한 URL 생성
        resolve(externalUrl);
      });
      writeStream.on('error', (error) => {
        console.error('음성 합성 중 오류 발생:', error);
        reject(null);
      });
    });
  } catch (error) {
    console.error('Amazon Polly TTS 요청 중 오류 발생:', error);
    return null;
  }
}

// Python 서버에서 응답 생성
async function generateResponseFromPythonServer(inputText) {
  try {
    const response = await axios.post('http://localhost:5001/generate_response', { text: inputText,
      call_uuid: currentCallUuid 
     });
    return response.data.response;
  } catch (error) {
    console.error('LangChain 서버 오류:', error.message);
    return '응답을 생성할 수 없습니다.';
  }
}

// Vonage NCCO를 사용해 전화에서 오디오 재생


app.get('/audio/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'audio', req.params.filename);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
