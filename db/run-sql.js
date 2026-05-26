require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function runSql() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('실행할 SQL 파일 경로를 입력해주세요.');
        process.exit(1);
    }

    const sqlPath = path.resolve(filePath);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const statements = splitSql(sql);

    const client = await pool.connect();
    try {
        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (!trimmed) continue;
            try {
                await client.query(trimmed);
            } catch (err) {
                // 컬럼 없음 오류 → ALTER TABLE로 자동 추가
                const missingCol = err.message.match(/"(.+)" 이름의 칼럼은 없습니다/);
                if (missingCol) {
                    const colName = missingCol[1];
                    await handleMissingColumn(client, trimmed, colName);
                } else {
                    console.warn(`⚠️  건너뜀: ${err.message}`);
                }
            }
        }
        console.log(`✅ SQL 실행 완료: ${filePath}`);
    } finally {
        client.release();
        await pool.end();
    }
}

async function handleMissingColumn(client, stmt, colName) {
    // CREATE TABLE 구문에서 해당 컬럼 정의 추출
    const colDefMatch = stmt.match(
        new RegExp(`${colName}\\s+([^,\\n]+(?:DEFAULT[^,\\n]+)?(?:NULL|NOT NULL)[^,\\n]*)`, 'i')
    );

    // 테이블명 추출 (CREATE TABLE IF NOT EXISTS table_name 또는 CREATE TABLE table_name)
    const tableMatch = stmt.match(/CREATE TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)/i);

    if (colDefMatch && tableMatch) {
        const tableName = tableMatch[1];
        const colDef = colDefMatch[1].trim().replace(/,$/, '');
        const alterSql = `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${colName} ${colDef};`;
        try {
            await client.query(alterSql);
            console.log(`🔧 컬럼 자동 추가: ${tableName}.${colName}`);
        } catch (alterErr) {
            console.warn(`⚠️  컬럼 추가 실패 (${tableName}.${colName}): ${alterErr.message}`);
        }
    } else {
        console.warn(`⚠️  건너뜀 (컬럼 정의 파싱 실패): ${colName}`);
    }
}

function splitSql(sql) {
    const statements = [];
    let current = '';
    let inDollarQuote = false;
    let dollarTag = '';

    const lines = sql.split('\n');
    for (const line of lines) {
        const dollarMatches = line.match(/\$\w*\$/g) || [];
        for (const tag of dollarMatches) {
            if (!inDollarQuote) {
                inDollarQuote = true;
                dollarTag = tag;
            } else if (tag === dollarTag) {
                inDollarQuote = false;
                dollarTag = '';
            }
        }

        current += line + '\n';

        if (!inDollarQuote && line.trimEnd().endsWith(';')) {
            statements.push(current);
            current = '';
        }
    }

    if (current.trim()) statements.push(current);
    return statements;
}

runSql();