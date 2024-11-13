require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');

const app = express();
app.use(bodyParser.json());

// /webhooks/answer 엔드포인트: 전화가 오면 인사하고 도시 이름을 묻습니다.
app.get('/webhooks/answer', (req, res) => {
  const ncco = [
    {
      action: 'talk',
      text: 'Thank you for calling Weather Bot! Please say the name of the city you want the weather for.'
    },
    {
      action: 'input',
      eventUrl: [`${req.protocol}://${req.get('host')}/webhooks/asr`],
      type: ["speech"],
      speech: {
        language: "ko-KR",
        endOnSilence: 2  // 2초 이상 무음이면 인식 완료
      }
    },
    {
      action: 'talk',
      text: "Sorry, I don't hear you."
    }
  ];
  res.json(ncco);
});

// /webhooks/events 엔드포인트: 통화 상태 변경 시 이벤트를 로깅합니다.
app.post('/webhooks/events', (req, res) => {
  console.log('Event received:', req.body);
  res.sendStatus(200);
});

// /webhooks/asr 엔드포인트: 음성 인식 결과를 받아서 날씨 API에 요청
app.post('/webhooks/asr', (req, res) => {
  console.log('ASR webhook called:', req.body);

  // 사용자가 말한 도시 이름 추출
  if (req.body.speech && req.body.speech.results) {
    const city = req.body.speech.results[0].text;
    
    // Weatherstack API 호출
    const weatherApiUrl = `http://api.weatherstack.com/current?access_key=${process.env.WEATHERSTACK_API_KEY}&query=${city}`;
    http.get(weatherApiUrl, (weatherResponse) => {
      let data = '';

      // 응답 데이터 수신
      weatherResponse.on('data', (chunk) => {
        data += chunk;
      });

      // 응답이 완료되면 날씨 정보 제공
      weatherResponse.on('end', () => {
        const weather = JSON.parse(data);
        
        if (weather.current) {
          const location = weather.location.name;
          const description = weather.current.weather_descriptions[0];
          let temperature = weather.current.temperature;

          // 미국일 경우 온도를 화씨로 변환
          if (weather.location.country === 'United States of America') {
            temperature = Math.round((temperature * 9 / 5) + 32) + '°F';
          } else {
            temperature = temperature + '°C';
          }

          const ncco = [{
            action: 'talk',
            text: `Today in ${location}: it's ${description}, ${temperature}`
          }];

          res.json(ncco);
        } else {
          // 날씨 정보를 찾을 수 없는 경우
          const ncco = [{
            action: 'talk',
            text: 'Sorry, I could not find the weather information for that location.'
          }];
          res.json(ncco);
        }
      });

    }).on("error", (err) => {
      console.log("Error: " + err.message);
      const ncco = [{
        action: 'talk',
        text: 'Sorry, there was an error retrieving the weather information.'
      }];
      res.json(ncco);
    });

  } else {
    // 음성을 인식하지 못한 경우
    const ncco = [{
      action: 'talk',
      text: `Sorry, I don't understand you. Please try again.`
    }];
    res.json(ncco);
  }
});

// 서버 실행
const port = 8888;
app.listen(port, () => console.log(`Server running on port ${port}`));
