CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    unit_type ENUM('units', 'pounds', 'baskets') DEFAULT 'units'
);

CREATE TABLE IF NOT EXISTS document_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(50) PRIMARY KEY,
    sku VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(100),
    price DECIMAL(15, 3) DEFAULT 0.000,
    stockUnits INT DEFAULT 0,
    stockPounds DECIMAL(15, 3) DEFAULT 0.000,
    stockBaskets INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS movements (
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
);

CREATE TABLE IF NOT EXISTS movement_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    movementId VARCHAR(50),
    productId VARCHAR(50),
    temperature DECIMAL(5, 2),
    qtyUnits INT DEFAULT 0,
    qtyPounds DECIMAL(15, 3) DEFAULT 0.000,
    qtyBaskets INT DEFAULT 0,
    FOREIGN KEY (movementId) REFERENCES movements(id) ON DELETE CASCADE,
    FOREIGN KEY (productId) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    movementId VARCHAR(50),
    description TEXT,
    value DECIMAL(15, 2) DEFAULT 0.00,
    FOREIGN KEY (movementId) REFERENCES movements(id) ON DELETE CASCADE
);

-- Initial Data (Optional seed)
INSERT IGNORE INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin');
INSERT IGNORE INTO categories (name, unit_type) VALUES ('Frutas', 'pounds'), ('Vegetales', 'pounds'), ('Abarrotes', 'units');
INSERT IGNORE INTO document_types (name) VALUES ('Factura'), ('Remisión'), ('Orden de Compra');
