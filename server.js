const express = require('express');
const mysql = require('mysql2');
const morgan = require('morgan');
const cors = require('cors');

const jwt = require('jsonwebtoken');
const SECRET_KEY = 'mysecretkey';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(morgan('dev'));   // 요청 로그
app.use(cors());          // CORS 허용

/* MySQL 연결 */
const db = mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'suwaza-db',
    port: 3307
});

db.connect((err) => {
    if (err) {
        console.error('MySQL 연결 실패:', err);
        return;
    }
    console.log('MySQL 연결 성공');
});

app.get('/', (req, res) => {
    res.send('Hello, Node.js!');
});

/* DB 데이터 조회 API */
app.get('/users', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        if (err) {
            res.status(500).send(err);
            return;
        }
        res.json(results);
    });
});

app.listen(PORT, () => {
    console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});