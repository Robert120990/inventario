import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

const { DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT } = process.env;

async function migratePasswords() {
    const pool = mysql.createPool({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASS,
        database: DB_NAME,
        port: DB_PORT || 3306,
    });

    console.log('[Migración] Conectando a la base de datos...');
    try {
        const [users] = await pool.query('SELECT id, username, password FROM users');
        console.log(`[Migración] Se encontraron ${users.length} usuarios.`);

        let count = 0;
        for (const user of users) {
            // Check if password is already hashed by bcrypt (starts with $2b$ or $2a$)
            if (!user.password.startsWith('$2b$') && !user.password.startsWith('$2a$')) {
                console.log(`[Migración] Hasheando contraseña para el usuario: ${user.username}`);
                const hashedPassword = await bcrypt.hash(user.password, 10);
                await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);
                count++;
            }
        }
        
        console.log(`[Migración] Finalizado. ${count} contraseñas fueron actualizadas.`);
    } catch (err) {
        console.error('[Migración] Error:', err);
    } finally {
        await pool.end();
    }
}

migratePasswords();
