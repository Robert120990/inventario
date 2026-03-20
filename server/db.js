import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const { DB_HOST, DB_USER, DB_PASS, DB_NAME } = process.env;

// Create connection without DB first to ensure DB exists
const ensureDatabaseExists = async () => {
    try {
        const connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASS
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;`);
        await connection.end();
        console.log(`Database "${DB_NAME}" checked/created.`);
    } catch (error) {
        console.error('Error ensuring database exists:', error);
        throw error;
    }
};

await ensureDatabaseExists();

const pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export default pool;
