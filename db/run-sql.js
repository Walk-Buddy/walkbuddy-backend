require('dotenv').config();
const fs=require('fs');
const path=require('path');
const pool=require('../config/db');

async function runSql(){
    const filePath=process.argv[2];
    if(!filePath){
        console.error('실행할 SQL 파일 경로를 입력해주세요.');
        process.exit(1);
    }

    const sqlPath=path.resolve(filePath);
    const sql=fs.readFileSync(sqlPath,'utf8');

    try{
        await pool.query(sql);
        console.log(`SQL 실행 완료: ${filePath}`);
    } catch (error){
        console.error('SQL 실행 중 오류 발생:', error.message);
        process.exitCode=1;
    }finally{
        await pool.end();
    }
}

runSql();