import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pool, { ensureSchema } from './db.js';

const app = express();
const router = express.Router();

app.use(cors());
app.use(express.json());

// Initialize Schema once per cold start
let schemaInitialized = false;

app.use(async (req, res, next) => {
    if (!schemaInitialized) {
        schemaInitialized = await ensureSchema();
    }
    next();
});

// Diagnostics
router.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), environment: process.env.NODE_ENV });
});

// Products
router.get('/products', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/products', async (req, res) => {
    const { id, sku, description, category, price, stockUnits, stockPounds, stockBaskets } = req.body;
    try {
        await pool.query('INSERT INTO products (id, sku, description, category, price, stockUnits, stockPounds, stockBaskets) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
        [id, sku || '', description || '', category || '', price || 0, stockUnits || 0, stockPounds || 0, stockBaskets || 0]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/products/:id', async (req, res) => {
    const { id } = req.params;
    const { sku, description, category, price, stockUnits, stockPounds, stockBaskets } = req.body;
    try {
        await pool.query('UPDATE products SET sku=?, description=?, category=?, price=?, stockUnits=?, stockPounds=?, stockBaskets=? WHERE id=?', 
        [sku, description, category, price, stockUnits, stockPounds, stockBaskets, id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/products/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Movements
router.get('/movements', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT id, type, equipment, carrier, seal, refType, refNumber, DATE_FORMAT(date, '%Y-%m-%d') as date, timeStart, timeEnd, auditUser, created_at FROM movements ORDER BY created_at DESC");
        for (const mov of rows) {
            const [items] = await pool.query('SELECT * FROM movement_items WHERE movementId=?', [mov.id]);
            const [services] = await pool.query('SELECT * FROM services WHERE movementId=?', [mov.id]);
            mov.items = items;
            mov.services = services;
        }
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/movements', async (req, res) => {
    const { id, type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, auditUser, items, services } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        await connection.query('INSERT INTO movements (id, type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, auditUser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, type, equipment || '', carrier || '', seal || '', refType || '', refNumber || '', date, timeStart, timeEnd, auditUser]);
        
        for (const item of items) {
            await connection.query('INSERT INTO movement_items (movementId, productId, temperature, qtyUnits, qtyPounds, qtyBaskets) VALUES (?, ?, ?, ?, ?, ?)',
            [id, item.productId, item.temperature, item.qtyUnits, item.qtyPounds, item.qtyBaskets]);
            
            const multiplier = type === 'in' ? 1 : -1;
            await connection.query('UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
            [item.qtyUnits * multiplier, item.qtyPounds * multiplier, item.qtyBaskets * multiplier, item.productId]);
        }
        
        if (services && services.length > 0) {
            for (const s of services) {
                await connection.query('INSERT INTO services (movementId, description, value) VALUES (?, ?, ?)',
                [id, s.description, s.value]);
            }
        }
        
        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.delete('/movements/:id', async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const [movRows] = await connection.query('SELECT * FROM movements WHERE id=?', [id]);
        if (movRows.length > 0) {
            const mov = movRows[0];
            const [items] = await connection.query('SELECT * FROM movement_items WHERE movementId=?', [id]);
            const multiplier = mov.type === 'in' ? -1 : 1;
            
            for (const item of items) {
                await connection.query('UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
                [item.qtyUnits * multiplier, item.qtyPounds * multiplier, item.qtyBaskets * multiplier, item.productId]);
            }
        }
        
        await connection.query('DELETE FROM movements WHERE id=?', [id]);
        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Users
router.get('/users', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, username, password, role FROM users');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/users', async (req, res) => {
    const { username, password, role } = req.body;
    try {
        await pool.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, password, role || 'user']);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/config', async (req, res) => {
    try {
        const [categories] = await pool.query('SELECT * FROM categories');
        const [docTypes] = await pool.query('SELECT * FROM document_types');
        res.json({ categories, docTypes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/config/categories', async (req, res) => {
    const { name, unit_type } = req.body;
    try {
        await pool.query('INSERT INTO categories (name, unit_type) VALUES (?, ?)', [name, unit_type || 'units']);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/config/categories/:name', async (req, res) => {
    try {
        await pool.query('DELETE FROM categories WHERE name = ?', [decodeURIComponent(req.params.name)]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/config/document-types', async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('INSERT INTO document_types (name) VALUES (?)', [name]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/config/document-types/:name', async (req, res) => {
    try {
        await pool.query('DELETE FROM document_types WHERE name = ?', [decodeURIComponent(req.params.name)]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/settings', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM settings WHERE id = 1');
        res.json(rows[0] || { name: 'Inventario Pro', logo: null });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/settings', async (req, res) => {
    const { name, logo } = req.body;
    try {
        await pool.query('INSERT INTO settings (id, name, logo) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE name = ?, logo = ?', 
        [name, logo, name, logo]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mount router under /api
app.use('/api', router);

// Export for Vercel
export default app;

// Standalone execution for local development
const isDirectRun = import.meta.url.startsWith('file:') && 
                   (process.argv[1] && (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('api\\index.js')));

if (isDirectRun || process.env.NODE_ENV === 'development') {
    const PORT = process.env.PORT || 3001; 
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
