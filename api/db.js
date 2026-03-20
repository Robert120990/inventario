import mysql from 'mysql2/promise';

const { DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT } = process.env;

// Connection Pool with automatic recovery
const pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    port: DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10, 
    queueLimit: 0,
    connectTimeout: 5000 // 5s timeout for remote DB
});

console.log(`[Backend] Connecting to DB Host: ${process.env.DB_HOST || 'localhost'} on port: ${process.env.DB_PORT || 3306}`);

export default pool;

// Helper to ensure database and tables exist
export const ensureSchema = async () => {
    try {
        // Since we are in a serverless function, we use the pool directly
        // The table creation queries are 'CREATE TABLE IF NOT EXISTS'
        const queries = [
            `CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'user') DEFAULT 'user',
                isActive TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                unit_type ENUM('units', 'pounds', 'baskets') DEFAULT 'units'
            )`,
            `CREATE TABLE IF NOT EXISTS document_types (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS products (
                id VARCHAR(50) PRIMARY KEY,
                sku VARCHAR(50) UNIQUE NOT NULL,
                description TEXT,
                category VARCHAR(100),
                price DECIMAL(15, 3) DEFAULT 0.000,
                stockUnits INT DEFAULT 0,
                stockPounds DECIMAL(15, 3) DEFAULT 0.000,
                stockBaskets INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS movements (
                id VARCHAR(50) PRIMARY KEY,
                type ENUM('in', 'out') NOT NULL,
                equipment VARCHAR(100),
                carrier VARCHAR(100),
                seal VARCHAR(100),
                refType VARCHAR(100),
                refNumber VARCHAR(100),
                date DATE,
                timeStart TIME,
                timeEnd TIME,
                auditUser VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS movement_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                movementId VARCHAR(50),
                productId VARCHAR(50),
                temperature DECIMAL(5, 2),
                qtyUnits INT DEFAULT 0,
                qtyPounds DECIMAL(15, 3) DEFAULT 0.000,
                qtyBaskets INT DEFAULT 0,
                FOREIGN KEY (movementId) REFERENCES movements(id) ON DELETE CASCADE,
                FOREIGN KEY (productId) REFERENCES products(id)
            )`,
            `CREATE TABLE IF NOT EXISTS services (
                id INT AUTO_INCREMENT PRIMARY KEY,
                movementId VARCHAR(50),
                description TEXT,
                value DECIMAL(15, 2) DEFAULT 0.00,
                FOREIGN KEY (movementId) REFERENCES movements(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS settings (
                id INT PRIMARY KEY DEFAULT 1,
                name VARCHAR(255) DEFAULT 'Inventario Pro',
                logo LONGTEXT
            )`
        ];

        for (const q of queries) {
            await pool.query(q);
        }

        // Asegurar que exista la configuración básica
        await pool.query(`INSERT IGNORE INTO settings (id, name) VALUES (1, 'Inventario Pro')`);

        // Migración manual para agregar isActive si no existe
        try {
            await pool.query("ALTER TABLE users ADD COLUMN isActive TINYINT(1) DEFAULT 1 AFTER role");
        } catch (e) {
            // Ignorar error si la columna ya existe
        }

        // Inserciones por defecto solo si las tablas están vacías
        const [catRows] = await pool.query('SELECT COUNT(*) as count FROM categories');
        if (catRows[0].count === 0) {
            await pool.query(`INSERT IGNORE INTO categories (name, unit_type) VALUES ('Frutas', 'pounds'), ('Vegetales', 'pounds'), ('Abarrotes', 'units')`);
        }

        const [docRows] = await pool.query('SELECT COUNT(*) as count FROM document_types');
        if (docRows[0].count === 0) {
            await pool.query(`INSERT IGNORE INTO document_types (name) VALUES ('Factura'), ('Remisión'), ('Orden de Compra')`);
        }

        const [userRows] = await pool.query('SELECT COUNT(*) as count FROM users');
        if (userRows[0].count === 0) {
            await pool.query(`INSERT IGNORE INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')`);
        }

        return true;
    } catch (err) {
        console.error('Schema initialization error:', err);
        return false;
    }
};
