import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import db from '../api/db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, '..', 'septiembre.csv');

if (!fs.existsSync(csvPath)) {
    console.error('❌ Error: No se encontró el archivo septiembre.csv en la raíz del proyecto.');
    console.log('Por favor, guarda los datos en inventario/septiembre.csv y vuelve a intentar.');
    process.exit(1);
}

const rawData = fs.readFileSync(csvPath, 'utf8');
const lines = rawData.split('\n');

const inventory = new Map();

for (const line of lines) {
    const match = line.match(/^(\d{8}),(.*?),(.*?),(.*?),(.*?),/);
    if (match) {
        const sku = match[1].trim();
        const desc = match[2].trim();
        const units = parseFloat(match[3].trim().replace(/,/g, '')) || 0;
        const lbs = parseFloat(match[4].trim().replace(/,/g, '')) || 0;
        const baskets = parseFloat(match[5].trim().replace(/,/g, '')) || 0;
        
        // Try to parse price if available
        let price = 0;
        const priceMatch = line.match(/,\$\s*([\d\.,]+)\s*,/);
        if (priceMatch) {
            price = parseFloat(priceMatch[1].replace(/,/g, '')) || 0;
        }

        if (!inventory.has(sku)) {
            inventory.set(sku, { sku, desc, units: 0, lbs: 0, baskets: 0, price });
        }
        
        const current = inventory.get(sku);
        current.units += units;
        current.lbs += lbs;
        current.baskets += baskets;
        if (price > 0 && current.price === 0) current.price = price;
    }
}

console.log(`✅ Procesados ${inventory.size} productos únicos del CSV.`);

async function updateSystem() {
    const pool = db.pool || db.default || db;
    if (!pool || !pool.query) {
        console.error('Error al conectar con la base de datos.');
        process.exit(1);
    }
    
    let updatedCount = 0;
    
    // Update live products inventory
    for (const [sku, data] of inventory.entries()) {
        try {
            const [rows] = await pool.query('SELECT id, stockUnits, stockPounds, stockBaskets FROM products WHERE sku = ?', [sku]);
            if (rows.length > 0) {
                const p = rows[0];
                await pool.query(
                    'UPDATE products SET stockUnits = ?, stockPounds = ?, stockBaskets = ?, price = COALESCE(NULLIF(?, 0), price) WHERE id = ?',
                    [data.units, data.lbs, data.baskets, data.price, p.id]
                );
                
                // If stock changed, we could log it but let's keep it simple
                updatedCount++;
            } else {
                // Create product if missing
                const id = crypto.randomUUID();
                await pool.query(
                    'INSERT INTO products (id, sku, description, category, price, stockUnits, stockPounds, stockBaskets) VALUES (?, ?, ?, "Preparados", ?, ?, ?, ?)',
                    [id, sku, data.desc, data.price, data.units, data.lbs, data.baskets]
                );
                updatedCount++;
            }
        } catch (e) {
            console.error(`Error actualizando SKU ${sku}:`, e.message);
        }
    }
    
    console.log(`✅ Se actualizaron existencias y precios de ${updatedCount} productos en vivo.`);
    
    // Attempt to update September Daily Cut
    try {
        const [cuts] = await pool.query("SELECT * FROM daily_cuts WHERE title LIKE '%21/09/2026%' OR endDate >= '2026-09-01' ORDER BY endDate DESC LIMIT 1");
        if (cuts.length > 0) {
            const cut = cuts[0];
            let congelados = [];
            let preparados = [];
            try {
                congelados = JSON.parse(cut.congeladosData || '[]');
                preparados = JSON.parse(cut.preparadosData || '[]');
            } catch (e) {}

            // Helper to update specific array
            const updateArray = (arr) => {
                for (const item of arr) {
                    if (inventory.has(item.sku)) {
                        const data = inventory.get(item.sku);
                        item.stockUnits = data.units;
                        item.stockPounds = data.lbs;
                        item.stockBaskets = data.baskets;
                        if (data.price > 0) item.price = data.price;
                    }
                }
            };
            
            updateArray(congelados);
            updateArray(preparados);
            
            await pool.query(
                'UPDATE daily_cuts SET congeladosData = ?, preparadosData = ? WHERE id = ?',
                [JSON.stringify(congelados), JSON.stringify(preparados), cut.id]
            );
            console.log(`✅ Se actualizó el Corte Congelado de Septiembre: "${cut.title}"`);
        } else {
            console.log('⚠️ No se encontró un corte de septiembre en daily_cuts. Deberás generarlo desde la interfaz.');
        }
    } catch (e) {
        console.error('Error actualizando el corte:', e.message);
    }
    
    console.log('🎉 Proceso completado con éxito.');
    process.exit(0);
}

updateSystem();
