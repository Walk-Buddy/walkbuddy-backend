const pool = new Pool({
  host: process.env.DB_HOST,    
  port: process.env.DB_PORT,    
  database: process.env.DB_NAME,  
  user: process.env.DB_USER,      // postgres
  password: process.env.DB_PASSWORD,
});

//이 부분은 유정님이 채워주시면 됩니다 !

//  DB 연결 설정
//  .env 파일에 아래 항목을 채워주세요:
//  DB_HOST=
//  DB_PORT=
//  DB_NAME=
//  DB_USER=
//  DB_PASSWORD=