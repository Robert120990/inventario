import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import pool from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Database Schema
const initDb = async () => {
    try {
        const schema = await fs.readFile(path.join(process.cwd(), 'schema.sql'), 'utf-8');
        const commands = schema.split(';').filter(cmd => cmd.trim());
        for (const cmd of commands) {
            await pool.query(cmd);
        }
        console.log('Database schema checked/initialized.');
    } catch (error) {
        console.error('Error initializing database schema:', error);
    }
};

await initDb();

// API ROUTES

// Products
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products', async (req, res) => {
    const { id, sku, description, category, price, stockUnits, stockPounds, stockBaskets } = req.body;
    try {
        await pool.query('INSERT INTO products (id, sku, description, category, price, stockUnits, stockPounds, stockBaskets) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
        [id, sku || '', description || '', category || '', price || 0, stockUnits || 0, stockPounds || 0, stockBaskets || 0]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
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

app.delete('/api/products/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Movements
app.get('/api/movements', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM movements ORDER BY created_at DESC');
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

app.post('/api/movements', async (req, res) => {
    const { id, type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, auditUser, items, services } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        await connection.query('INSERT INTO movements (id, type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, auditUser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, type, equipment || '', carrier || '', seal || '', refType || '', refNumber || '', date, timeStart, timeEnd, auditUser]);
        
        // Items & Stock update
        for (const item of items) {
            await connection.query('INSERT INTO movement_items (movementId, productId, temperature, qtyUnits, qtyPounds, qtyBaskets) VALUES (?, ?, ?, ?, ?, ?)',
            [id, item.productId, item.temperature, item.qtyUnits, item.qtyPounds, item.qtyBaskets]);
            
            // Stock logic: if 'in' -> add, if 'out' -> subtract
            const multiplier = type === 'in' ? 1 : -1;
            await connection.query('UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
            [item.qtyUnits * multiplier, item.qtyPounds * multiplier, item.qtyBaskets * multiplier, item.productId]);
        }
        
        // Services
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

app.delete('/api/movements/:id', async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // Revert stock before deleting
        const [movRows] = await connection.query('SELECT * FROM movements WHERE id=?', [id]);
        if (movRows.length > 0) {
            const mov = movRows[0];
            const [items] = await connection.query('SELECT * FROM movement_items WHERE movementId=?', [id]);
            const multiplier = mov.type === 'in' ? -1 : 1; // Reverse the previous change
            
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
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, username, role FROM users');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', async (req, res) => {
    const { username, password, role } = req.body;
    try {
        await pool.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, password, role || 'user']);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Categories & Document Types
app.get('/api/config', async (req, res) => {
    try {
        const [categories] = await pool.query('SELECT * FROM categories');
        const [docTypes] = await pool.query('SELECT * FROM document_types');
        res.json({ categories, docTypes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
