const express = require('express');
const app = express();

app.get('/answer', (req, res) => {
  const ncco = [
    {
      action: "connect",
      endpoint: [
        {
          type: "websocket",
          uri: "wss://01f9-222-112-27-104.ngrok-free.app",
          "content-type": "audio/l16;rate=16000"
        }
      ]
    }
  ];
  res.json(ncco);
});

app.listen(8282, () => {
  console.log('Server is running on port 8282');
});


