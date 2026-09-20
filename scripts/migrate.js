import 'dotenv/config';
import pool, { ensureSchema } from '../api/db.js';

async function runMigrations() {
    console.log('[Migraciones] Conectando a la base de datos y ejecutando migraciones pendientes...');
    try {
        await ensureSchema();
        console.log('[Migraciones] Migraciones ejecutadas con éxito.');
        process.exit(0);
    } catch (err) {
        console.error('[Migraciones] Error al ejecutar migraciones:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();
