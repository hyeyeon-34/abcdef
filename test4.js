require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');

const app = express();
app.use(bodyParser.json());
app.get('/webhooks/answer', (request, response) => {

    const ncco = [{
        action: 'talk',
        text: 'Thank you for calling Weather Bot! Where are you from?'
      },
      {
        action: 'input',
        eventUrl: [
          `${request.protocol}://${request.get('host')}/webhooks/asr`],
        type: [ "speech" ],  
        speech: {
            language: "ko-KR"
          }
      },
      {
        action: 'talk',
        text: 'Sorry, I don\'t hear you'
      }
    ]
  
    response.json(ncco)
  })

  app.post('/webhooks/events', (request, response) => {
    console.log(request.body)
    response.sendStatus(200);
  })
  app.post('/webhooks/asr', (request, response) => {

    console.log(request.body)
  
    if (request.body.speech.results) {
  
      const city = request.body.speech.results[0].text
  
      http.get(
        'http://api.weatherstack.com/current?access_key=13c837053954bec24ec99b42241fb4e8&query=' +
        city, (weatherResponse) => {
          let data = '';
  
          weatherResponse.on('data', (chunk) => {
            data += chunk;
          });
  
          weatherResponse.on('end', () => {
            const weather = JSON.parse(data);
  
            console.log(weather);
  
            let location = weather.location.name
            let description = weather.current.weather_descriptions[0]
            let temperature = weather.current.temperature          
  
            console.log("Location: " + location)
            console.log("Description: " + description)
            console.log("Temperature: " + temperature)
  
            const ncco = [{
              action: 'talk',
              text: `Today in ${location}: it's ${description}, ${temperature}°C`
            }]
  
            response.json(ncco)
  
          });
  
        }).on("error", (err) => {
        console.log("Error: " + err.message);
      });
  
    } else {
  
      const ncco = [{
        action: 'talk',
        text: `Sorry I don't understand you.`
      }]
  
      response.json(ncco)
    }
  
  })

  const port = 8888
  app.listen(port, () => console.log(`Listening on port ${port}`))
  