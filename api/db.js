import mysql from 'mysql2/promise';

const { DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT } = process.env;

const sslConfig = process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined;

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
    connectTimeout: 5000, // 5s timeout for remote DB
    ssl: sslConfig
});

export default pool;

// Definición secuencial y versionada de migraciones
export const MIGRATIONS = [
    {
        version: '001_core_tables',
        description: 'Creación de tablas maestras del sistema',
        run: async (connection) => {
            const tables = [
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
                )`,
                `CREATE TABLE IF NOT EXISTS insurance_cuts (
                    id VARCHAR(50) PRIMARY KEY,
                    title VARCHAR(200) NOT NULL,
                    customerName VARCHAR(150) NOT NULL,
                    warehouseName VARCHAR(150) NOT NULL,
                    startDate DATE NULL,
                    cutoffDate DATE NOT NULL,
                    premiumRate DECIMAL(10, 4) DEFAULT 0.10,
                    isLocked TINYINT(1) DEFAULT 1,
                    rowsData LONGTEXT NOT NULL,
                    totalsData LONGTEXT NOT NULL,
                    created_by VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_insurance_cuts_dates (cutoffDate)
                )`
            ];
            for (const sql of tables) {
                await connection.query(sql);
            }
        }
    },
    {
        version: '002_user_and_version_columns',
        description: 'Columnas extendidas para RBAC y control de cambios',
        run: async (connection) => {
            const addColIfMissing = async (table, colDef, colName) => {
                const [cols] = await connection.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [colName]);
                if (cols.length === 0) {
                    await connection.query(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
                }
            };

            await addColIfMissing('users', 'isActive TINYINT(1) DEFAULT 1 AFTER role', 'isActive');
            await addColIfMissing('users', 'permissions LONGTEXT NULL AFTER isActive', 'permissions');
            await addColIfMissing('users', 'role_id INT NULL AFTER role', 'role_id');
            await addColIfMissing('users', 'last_login TIMESTAMP NULL AFTER isActive', 'last_login');
            await addColIfMissing('versions', 'changes LONGTEXT NULL AFTER description', 'changes');
            await addColIfMissing('versions', "author VARCHAR(50) DEFAULT 'Sistema' AFTER changes", 'author');
        }
    },
    {
        version: '003_performance_indexes',
        description: 'Índices optimizados para consultas operativas',
        run: async (connection) => {
            const addIndexIfMissing = async (table, indexName, colList) => {
                const [indexes] = await connection.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [indexName]);
                if (indexes.length === 0) {
                    await connection.query(`CREATE INDEX ${indexName} ON ${table} (${colList})`);
                }
            };

            await addIndexIfMissing('movements', 'idx_movements_date', 'date');
            await addIndexIfMissing('movements', 'idx_movements_type', 'type');
            await addIndexIfMissing('products', 'idx_products_sku', 'sku');
            await addIndexIfMissing('products', 'idx_products_category', 'category');
            await addIndexIfMissing('system_logs', 'idx_system_logs_created', 'created_at');
        }
    },
    {
        version: '004_seed_defaults',
        description: 'Sembrado de configuración base y roles por defecto',
        run: async (connection) => {
            await connection.query(`INSERT IGNORE INTO settings (id, name) VALUES (1, 'Inventario Pro')`);

            const [roleRows] = await connection.query('SELECT COUNT(*) as count FROM roles');
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
                
                await connection.query(queryRoles, [adminPermissions, supervisorPermissions, warehousePermissions, auditorPermissions]);
            }

            const [catRows] = await connection.query('SELECT COUNT(*) as count FROM categories');
            if (catRows[0].count === 0) {
                await connection.query(`INSERT IGNORE INTO categories (name, unit_type) VALUES ('Frutas', 'pounds'), ('Vegetales', 'pounds'), ('Abarrotes', 'units')`);
            }

            const [docRows] = await connection.query('SELECT COUNT(*) as count FROM document_types');
            if (docRows[0].count === 0) {
                await connection.query(`INSERT IGNORE INTO document_types (name) VALUES ('Factura'), ('Remisión'), ('Orden de Compra')`);
            }
        }
    }
];

// Ejecutor formal de migraciones versionadas
export const ensureSchema = async () => {
    let connection;
    try {
        connection = await pool.getConnection();

        // 1. Asegurar tabla de control de migraciones
        await connection.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(50) PRIMARY KEY,
                description VARCHAR(255),
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Obtener migraciones ya aplicadas
        const [appliedRows] = await connection.query('SELECT version FROM schema_migrations');
        const appliedSet = new Set(appliedRows.map(r => r.version));

        // 3. Ejecutar migraciones pendientes en orden
        for (const migration of MIGRATIONS) {
            if (!appliedSet.has(migration.version)) {
                await migration.run(connection);
                await connection.query(
                    'INSERT INTO schema_migrations (version, description) VALUES (?, ?)',
                    [migration.version, migration.description]
                );
            }
        }

        return true;
    } catch (err) {
        console.error('[Migrations] Migration failed:', err);
        throw err;
    } finally {
        if (connection) connection.release();
    }
};
