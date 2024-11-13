require('dotenv').config();
const express = require('express');
const PORT = 8282;

const app = express();
const cors = require('cors');

app.use(
  cors({
    origin: [
      'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  })
);


app.use(express.json());

app.get('/', (req, res) => {
  res.send('콜봇 테스트');
});





app.listen(PORT, () => console.log(`Server is runnig on ${PORT}`));
