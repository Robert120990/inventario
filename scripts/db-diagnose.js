import 'dotenv/config';
import mysql from 'mysql2/promise';

async function diagnoseDatabase() {
  console.log('\n======================================================');
  console.log('🔍 INVENTARIO PRO: Diagnóstico Integral de Base de Datos');
  console.log('======================================================\n');

  const { DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT } = process.env;

  console.log(`🔌 Conectando a MySQL en ${DB_HOST}:${DB_PORT || 3306} (BD: ${DB_NAME}, Usuario: ${DB_USER})...`);
  const startTime = Date.now();

  let pool;
  try {
    pool = mysql.createPool({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASS,
      database: DB_NAME,
      port: DB_PORT || 3306,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 8000
    });

    const [pingRes] = await pool.query('SELECT 1 as isAlive, NOW() as serverTime');
    const latency = Date.now() - startTime;
    console.log(`✅ Conexión establecida exitosamente (Latencia: ${latency}ms)`);
    console.log(`🕒 Hora del servidor BD: ${pingRes[0].serverTime}\n`);

    // 1. Diagnóstico de Tablas y Registros
    console.log('📊 Estado de tablas principales:');
    const tables = [
      'users', 'roles', 'products', 'categories', 'movements', 
      'movement_items', 'inventory_adjustments', 'daily_cuts', 
      'insurance_cuts', 'system_logs', 'active_sessions', 'schema_migrations'
    ];

    for (const table of tables) {
      try {
        const [rows] = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   - ${table.padEnd(24)}: ${rows[0].count.toString().padStart(6)} registros`);
      } catch (tblErr) {
        console.log(`   - ${table.padEnd(24)}: ⚠️ Error o no existe (${tblErr.message})`);
      }
    }

    // 2. Auditoría de Integridad de Usuarios y Contraseñas
    console.log('\n🔒 Auditoría de seguridad de usuarios:');
    try {
      const [users] = await pool.query('SELECT id, username, role, isActive, LENGTH(password) as passLen, password FROM users');
      let issuesFound = 0;
      for (const u of users) {
        const isBcrypt = u.password.startsWith('$2b$') || u.password.startsWith('$2a$');
        const isNormalLen = u.passLen === 60;
        if (!isBcrypt || !isNormalLen) {
          console.log(`   ⚠️ ALERTA: Usuario '${u.username}' (ID: ${u.id}) tiene contraseña malformada o truncada (Len: ${u.passLen})`);
          issuesFound++;
        }
      }
      if (issuesFound === 0) {
        console.log(`   ✅ Todos los usuarios (${users.length}) tienen hashes de contraseña Bcrypt válidos (60 caracteres).`);
      }
    } catch (userErr) {
      console.log('   ⚠️ Error al auditar usuarios:', userErr.message);
    }

    // 3. Auditoría de Existencias Multi-Unidad
    console.log('\n📦 Verificación de consistencia multi-unidad (Productos):');
    try {
      const [inconsistent] = await pool.query(`
        SELECT COUNT(*) as badCount FROM products 
        WHERE stockUnits < 0 OR stockPounds < 0 OR stockBaskets < 0 
           OR stockUnits IS NULL OR stockPounds IS NULL OR stockBaskets IS NULL
      `);
      if (inconsistent[0].badCount > 0) {
        console.log(`   ⚠️ ALERTA: Existen ${inconsistent[0].badCount} productos con stock negativo o valores NULL.`);
      } else {
        console.log('   ✅ Todas las existencias (unidades, libras, cestas) cumplen con las reglas de integridad.');
      }
    } catch (prodErr) {
      console.log('   ⚠️ Error al verificar productos:', prodErr.message);
    }

    // 4. Migraciones Aplicadas
    console.log('\n📜 Migraciones registradas:');
    try {
      const [migs] = await pool.query('SELECT version, description, applied_at FROM schema_migrations ORDER BY applied_at ASC');
      for (const m of migs) {
        console.log(`   - [${m.version}] ${m.description} (${m.applied_at})`);
      }
    } catch {
      console.log('   ⚠️ Tabla schema_migrations no encontrada o vacía.');
    }

    console.log('\n======================================================');
    console.log('🎯 Diagnóstico completado sin fallas críticas de conexión.');
    console.log('======================================================\n');

  } catch (err) {
    console.error('\n❌ Error crítico conectando a la base de datos:', err.message);
  } finally {
    if (pool) await pool.end();
  }
}

diagnoseDatabase();
