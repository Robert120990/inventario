import mysql from 'mysql2/promise';
import 'dotenv/config';

const { DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT } = process.env;

async function checkCategories() {
    try {
        const connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASS,
            database: DB_NAME,
            port: parseInt(DB_PORT || '3306')
        });
        const [rows] = await connection.execute('SELECT * FROM categories');
        console.log('Categories found in DB:', rows);
        await connection.end();
    } catch (err) {
        console.error('Connection failed:', err.message);
    }
}

checkCategories();
