import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pool, { ensureSchema } from './db.js';
import { randomUUID } from 'node:crypto';

const app = express();
const router = express.Router();

app.use(cors());
app.use(express.json());

// Initialize Schema once per cold start - safely
let initializationPromise = null;

const initializeApp = () => {
    if (!initializationPromise) {
        initializationPromise = ensureSchema();
    }
    return initializationPromise;
};

app.use(async (req, res, next) => {
    await initializeApp();
    next();
});

// Diagnostics
router.get('/health', async (req, res) => {
    let dbStatus = 'checking...';
    let userCount = 0;
    try {
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM users');
        userCount = rows[0].count;
        dbStatus = 'connected';
    } catch (err) {
        dbStatus = `error: ${err.message}`;
    }
    res.json({ 
        status: 'ok', 
        db: dbStatus,
        users: userCount,
        time: new Date().toISOString(), 
        env: process.env.NODE_ENV,
        hasHost: !!process.env.DB_HOST,
        hasUser: !!process.env.DB_USER
    });
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

router.post('/inventory-adjustments', async (req, res) => {
    const { productId, stockUnits, stockPounds, stockBaskets, reason, auditUser } = req.body;
    const countedUnits = Number(stockUnits);
    const countedPounds = Number(stockPounds);
    const countedBaskets = Number(stockBaskets);

    if (!productId || !reason?.trim() || !auditUser?.trim()) {
        return res.status(400).json({ error: 'Producto, motivo y usuario son obligatorios.' });
    }

    if (![countedUnits, countedPounds, countedBaskets].every(Number.isFinite)
        || countedUnits < 0 || countedPounds < 0 || countedBaskets < 0
        || !Number.isInteger(countedUnits) || !Number.isInteger(countedBaskets)) {
        return res.status(400).json({ error: 'Las existencias deben ser valores válidos y no negativos.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [products] = await connection.query(
            'SELECT * FROM products WHERE id = ? FOR UPDATE',
            [productId]
        );

        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Producto no encontrado.' });
        }

        const product = products[0];
        const adjustmentId = randomUUID();

        await connection.query(
            `INSERT INTO inventory_adjustments (
                id, productId, previousUnits, previousPounds, previousBaskets,
                countedUnits, countedPounds, countedBaskets, reason, auditUser
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                adjustmentId,
                productId,
                product.stockUnits || 0,
                product.stockPounds || 0,
                product.stockBaskets || 0,
                countedUnits,
                countedPounds,
                countedBaskets,
                reason.trim(),
                auditUser.trim()
            ]
        );

        await connection.query(
            'UPDATE products SET stockUnits = ?, stockPounds = ?, stockBaskets = ? WHERE id = ?',
            [countedUnits, countedPounds, countedBaskets, productId]
        );

        const [updatedProducts] = await connection.query('SELECT * FROM products WHERE id = ?', [productId]);
        await connection.commit();

        res.json({
            success: true,
            product: updatedProducts[0],
            adjustment: {
                id: adjustmentId,
                productId,
                previousUnits: Number(product.stockUnits || 0),
                previousPounds: Number(product.stockPounds || 0),
                previousBaskets: Number(product.stockBaskets || 0),
                countedUnits,
                countedPounds,
                countedBaskets,
                reason: reason.trim(),
                auditUser: auditUser.trim()
            }
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.get('/inventory-adjustments', async (req, res) => {
    try {
        const productId = req.query.productId;
        const params = [];
        let query = `SELECT ia.*, p.sku, p.description
            FROM inventory_adjustments ia
            JOIN products p ON p.id = ia.productId`;
        if (productId) {
            query += ' WHERE ia.productId = ?';
            params.push(productId);
        }
        query += ' ORDER BY ia.created_at DESC LIMIT 100';
        const [rows] = await pool.query(query, params);
        res.json(rows);
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
        
        if (rows.length === 0) return res.json([]);

        const movIds = rows.map(m => m.id);
        const [allItems] = await pool.query('SELECT * FROM movement_items WHERE movementId IN (?)', [movIds]);
        const [allServices] = await pool.query('SELECT * FROM services WHERE movementId IN (?)', [movIds]);

        const itemsMap = allItems.reduce((acc, item) => {
            if (!acc[item.movementId]) acc[item.movementId] = [];
            acc[item.movementId].push(item);
            return acc;
        }, {});

        const servicesMap = allServices.reduce((acc, s) => {
            if (!acc[s.movementId]) acc[s.movementId] = [];
            acc[s.movementId].push(s);
            return acc;
        }, {});

        const results = rows.map(mov => ({
            ...mov,
            items: itemsMap[mov.id] || [],
            services: servicesMap[mov.id] || []
        }));

        res.json(results);
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

router.put('/movements/:id', async (req, res) => {
    const { id } = req.params;
    const { type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, auditUser, items, services } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [movementRows] = await connection.query(
            'SELECT type FROM movements WHERE id = ? FOR UPDATE',
            [id]
        );

        if (movementRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Movimiento no encontrado' });
        }

        const [previousItems] = await connection.query(
            'SELECT productId, qtyUnits, qtyPounds, qtyBaskets FROM movement_items WHERE movementId = ?',
            [id]
        );

        const previousMultiplier = movementRows[0].type === 'in' ? -1 : 1;
        for (const item of previousItems) {
            await connection.query(
                'UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
                [item.qtyUnits * previousMultiplier, item.qtyPounds * previousMultiplier, item.qtyBaskets * previousMultiplier, item.productId]
            );
        }

        await connection.query(
            'UPDATE movements SET type = ?, equipment = ?, carrier = ?, seal = ?, refType = ?, refNumber = ?, date = ?, timeStart = ?, timeEnd = ?, auditUser = ? WHERE id = ?',
            [type, equipment || '', carrier || '', seal || '', refType || '', refNumber || '', date, timeStart, timeEnd, auditUser, id]
        );

        await connection.query('DELETE FROM movement_items WHERE movementId = ?', [id]);
        await connection.query('DELETE FROM services WHERE movementId = ?', [id]);

        const newMultiplier = type === 'in' ? 1 : -1;
        for (const item of items) {
            await connection.query(
                'INSERT INTO movement_items (movementId, productId, temperature, qtyUnits, qtyPounds, qtyBaskets) VALUES (?, ?, ?, ?, ?, ?)',
                [id, item.productId, item.temperature, item.qtyUnits, item.qtyPounds, item.qtyBaskets]
            );
            await connection.query(
                'UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
                [item.qtyUnits * newMultiplier, item.qtyPounds * newMultiplier, item.qtyBaskets * newMultiplier, item.productId]
            );
        }

        for (const service of services || []) {
            await connection.query(
                'INSERT INTO services (movementId, description, value) VALUES (?, ?, ?)',
                [id, service.description, service.value]
            );
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
        const [rows] = await pool.query('SELECT id, username, password, role, isActive FROM users');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/users', async (req, res) => {
    const { username, password, role } = req.body;
    try {
        await pool.query('INSERT INTO users (username, password, role, isActive) VALUES (?, ?, ?, 1)', [username, password, role || 'user']);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { username, password, role, isActive } = req.body;
    try {
        await pool.query(
            'UPDATE users SET username=?, password=?, role=?, isActive=? WHERE id=?',
            [username, password, role || 'user', isActive !== false ? 1 : 0, id]
        );
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

router.put('/config/categories/:name', async (req, res) => {
    const { unit_type } = req.body;
    try {
        await pool.query('UPDATE categories SET unit_type=? WHERE name=?', [unit_type, decodeURIComponent(req.params.name)]);
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

// Versions
router.get('/versions', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT id, version, description, DATE_FORMAT(created_at, '%Y-%m-%d') as date, DATE_FORMAT(created_at, '%H:%i') as time FROM versions ORDER BY id DESC");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/versions', async (req, res) => {
    const { description } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [maxRows] = await connection.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM versions');
        const nextVersion = `V${maxRows[0].maxId + 1}`;
        await connection.query('INSERT INTO versions (version, description) VALUES (?, ?)', [nextVersion, description || '']);
        await connection.commit();
        res.json({ success: true, version: nextVersion });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.delete('/versions/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM versions WHERE id=?', [req.params.id]);
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
