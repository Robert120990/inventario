import mysql from 'mysql2/promise';
import 'dotenv/config';

const { DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT } = process.env;

async function updateAdmin() {
    try {
        const connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASS,
            database: DB_NAME,
            port: parseInt(DB_PORT || '3306')
        });
        await connection.execute("UPDATE users SET password = '123' WHERE username = 'admin'");
        console.log("Admin password updated to '123'");
        await connection.end();
    } catch (err) {
        console.error('Update failed:', err.message);
    }
}

updateAdmin();
