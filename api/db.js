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
            `CREATE TABLE IF NOT EXISTS inventory_adjustments (
                id VARCHAR(50) PRIMARY KEY,
                productId VARCHAR(50) NOT NULL,
                previousUnits INT DEFAULT 0,
                previousPounds DECIMAL(15, 3) DEFAULT 0.000,
                previousBaskets INT DEFAULT 0,
                countedUnits INT DEFAULT 0,
                countedPounds DECIMAL(15, 3) DEFAULT 0.000,
                countedBaskets INT DEFAULT 0,
                reason VARCHAR(500) NOT NULL,
                auditUser VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_inventory_adjustments_product (productId),
                FOREIGN KEY (productId) REFERENCES products(id)
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
            )`,
            `CREATE TABLE IF NOT EXISTS roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                description VARCHAR(255),
                permissions LONGTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS system_logs (
                id VARCHAR(50) PRIMARY KEY,
                userId INT NULL,
                username VARCHAR(50) NOT NULL,
                action VARCHAR(50) NOT NULL,
                module VARCHAR(50) NOT NULL,
                details TEXT NOT NULL,
                ip_address VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_system_logs_module (module),
                INDEX idx_system_logs_created (created_at)
            )`,
            `CREATE TABLE IF NOT EXISTS active_sessions (
                id VARCHAR(50) PRIMARY KEY,
                userId INT NOT NULL,
                username VARCHAR(50) NOT NULL,
                ip_address VARCHAR(50),
                user_agent VARCHAR(255),
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_active_sessions_user (userId)
            )`,
            `CREATE TABLE IF NOT EXISTS notifications (
                id VARCHAR(50) PRIMARY KEY,
                userId INT NULL,
                title VARCHAR(150) NOT NULL,
                message TEXT NOT NULL,
                type ENUM('info', 'warning', 'success', 'danger') DEFAULT 'info',
                isRead TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_notifications_user (userId)
            )`,
            `CREATE TABLE IF NOT EXISTS versions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                version VARCHAR(20) UNIQUE NOT NULL,
                description TEXT,
                changes LONGTEXT,
                author VARCHAR(50) DEFAULT 'Sistema',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS daily_cuts (
                id VARCHAR(50) PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                clientName VARCHAR(150) NOT NULL,
                startDate DATE NOT NULL,
                endDate DATE NOT NULL,
                isLocked TINYINT(1) DEFAULT 1,
                congeladosData LONGTEXT NOT NULL,
                preparadosData LONGTEXT NOT NULL,
                servicesData LONGTEXT NOT NULL,
                totalsData LONGTEXT NOT NULL,
                created_by VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_daily_cuts_dates (startDate, endDate)
            )`
        ];

        for (const q of queries) {
            await pool.query(q);
        }

        // Asegurar que exista la configuración básica
        await pool.query(`INSERT IGNORE INTO settings (id, name) VALUES (1, 'Inventario Pro')`);

        // Migración manual para columnas adicionales en users
        try {
            await pool.query("ALTER TABLE users ADD COLUMN isActive TINYINT(1) DEFAULT 1 AFTER role");
        } catch (e) {}
        try {
            await pool.query("ALTER TABLE users ADD COLUMN permissions LONGTEXT NULL AFTER isActive");
        } catch (e) {}
        try {
            await pool.query("ALTER TABLE users ADD COLUMN role_id INT NULL AFTER role");
        } catch (e) {}
        try {
            await pool.query("ALTER TABLE users ADD COLUMN last_login TIMESTAMP NULL AFTER isActive");
        } catch (e) {}

        // Migración manual para columnas adicionales en versions
        try {
            await pool.query("ALTER TABLE versions ADD COLUMN changes LONGTEXT NULL AFTER description");
        } catch (e) {}
        try {
            await pool.query("ALTER TABLE versions ADD COLUMN author VARCHAR(50) DEFAULT 'Sistema' AFTER changes");
        } catch (e) {}

        // Índices de alto rendimiento para acelerar consultas y paginación
        try { await pool.query("CREATE INDEX idx_movements_date ON movements (date)"); } catch (e) {}
        try { await pool.query("CREATE INDEX idx_movements_type ON movements (type)"); } catch (e) {}
        try { await pool.query("CREATE INDEX idx_products_sku ON products (sku)"); } catch (e) {}
        try { await pool.query("CREATE INDEX idx_products_category ON products (category)"); } catch (e) {}
        try { await pool.query("CREATE INDEX idx_system_logs_created ON system_logs (created_at)"); } catch (e) {}

        // Roles por defecto
        const [roleRows] = await pool.query('SELECT COUNT(*) as count FROM roles');
        if (roleRows[0].count === 0) {
            const adminPermissions = JSON.stringify({
                dashboard: { view: true },
                products: { view: true, create: true, edit: true, delete: true, export: true },
                'inventory-count': { view: true, create: true, edit: true, delete: true, export: true },
                movements: { view: true, create: true, edit: true, delete: true, export: true },
                insurance: { view: true, export: true },
                summary: { view: true, export: true },
                summary2: { view: true, export: true },
                security: { view: true, create: true, edit: true, delete: true },
                'security-users': { view: true, create: true, edit: true, delete: true, export: true },
                'security-access': { view: true, edit: true },
                'security-roles': { view: true, create: true, edit: true, delete: true },
                'security-logs': { view: true, export: true },
                'security-sessions': { view: true, delete: true },
                'security-changelog': { view: true, create: true, delete: true },
                'security-notifications': { view: true, create: true, delete: true },
                'security-manual': { view: true },
                settings: { view: true, edit: true }
            });

            const supervisorPermissions = JSON.stringify({
                dashboard: { view: true },
                products: { view: true, create: true, edit: true, delete: false, export: true },
                'inventory-count': { view: true, create: true, edit: true, delete: false, export: true },
                movements: { view: true, create: true, edit: true, delete: false, export: true },
                insurance: { view: true, export: true },
                summary: { view: true, export: true },
                summary2: { view: true, export: true },
                security: { view: false, create: false, edit: false, delete: false },
                settings: { view: false, edit: false }
            });

            const warehousePermissions = JSON.stringify({
                dashboard: { view: true },
                products: { view: true, create: false, edit: false, delete: false, export: false },
                'inventory-count': { view: true, create: true, edit: true, delete: false, export: false },
                movements: { view: true, create: true, edit: false, delete: false, export: false },
                insurance: { view: false, export: false },
                summary: { view: false, export: false },
                summary2: { view: false, export: false },
                security: { view: false, create: false, edit: false, delete: false },
                settings: { view: false, edit: false }
            });

            const auditorPermissions = JSON.stringify({
                dashboard: { view: true },
                products: { view: true, create: false, edit: false, delete: false, export: true },
                'inventory-count': { view: true, create: false, edit: false, delete: false, export: true },
                movements: { view: true, create: false, edit: false, delete: false, export: true },
                insurance: { view: true, export: true },
                summary: { view: true, export: true },
                summary2: { view: true, export: true },
                security: { view: true, create: false, edit: false, delete: false },
                'security-logs': { view: true, export: true },
                'security-sessions': { view: true, delete: false },
                'security-changelog': { view: true, create: false, delete: false },
                'security-manual': { view: true },
                settings: { view: false, edit: false }
            });

            const queryRoles = `INSERT INTO roles (name, description, permissions) VALUES 
                ('Administrador', 'Control total y configuración de todo el sistema', ?),
                ('Supervisor', 'Gestión operativa completa de almacén y reportes', ?),
                ('Almacenista', 'Captura de movimientos y conteo de inventario', ?),
                ('Auditor', 'Consulta y verificación de bitácora y movimientos sin edición', ?)`;
            
            await pool.query(queryRoles, [adminPermissions, supervisorPermissions, warehousePermissions, auditorPermissions]);
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
            await pool.query(`INSERT IGNORE INTO users (username, password, role) VALUES ('admin', '123', 'admin')`);
        }

        return true;
    } catch (err) {
        console.error('Schema initialization error:', err);
        return false;
    }
};
