import mysql from 'mysql2/promise';
import 'dotenv/config';

const { DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT } = process.env;

async function check() {
    console.log('Connecting to:', DB_HOST, 'port:', DB_PORT || 3306);
    try {
        const connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASS,
            database: DB_NAME,
            port: parseInt(DB_PORT || '3306')
        });
        console.log('Connected successfully!');
        const [rows] = await connection.execute('SELECT id, username, password, role FROM users');
        console.log('DATA_START' + JSON.stringify(rows) + 'DATA_END');
        await connection.end();
    } catch (err) {
        console.error('Connection failed:', err.message);
    }
}

check();
