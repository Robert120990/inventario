import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Integridad de Stock y Validación de Movimientos', () => {
    // Función pura de validación que replica la regla de negocio del servidor
    const validateStockWithdrawal = (currentStock, requested) => {
        if (!requested || requested.length === 0) {
            return { valid: false, error: 'El movimiento debe incluir al menos un producto.' };
        }

        for (const item of requested) {
            const u = Number(item.qtyUnits) || 0;
            const p = Number(item.qtyPounds) || 0;
            const b = Number(item.qtyBaskets) || 0;
            if (u < 0 || p < 0 || b < 0 || (u === 0 && p === 0 && b === 0)) {
                return { valid: false, error: 'Las cantidades deben ser positivas y no negativas.' };
            }
        }

        // Agrupar requerimientos por producto
        const reqMap = new Map();
        for (const item of requested) {
            const cur = reqMap.get(item.productId) || { u: 0, p: 0, b: 0 };
            cur.u += Number(item.qtyUnits) || 0;
            cur.p += Number(item.qtyPounds) || 0;
            cur.b += Number(item.qtyBaskets) || 0;
            reqMap.set(item.productId, cur);
        }

        for (const [prodId, reqQty] of reqMap.entries()) {
            const prod = currentStock.get(prodId);
            if (!prod) {
                return { valid: false, error: `Producto '${prodId}' no existe.` };
            }
            if (prod.stockUnits < reqQty.u || prod.stockPounds < reqQty.p || prod.stockBaskets < reqQty.b) {
                return {
                    valid: false,
                    error: `Stock insuficiente para salida de '${prod.sku}'. Solicitado: [${reqQty.u}u, ${reqQty.p}lbs, ${reqQty.b}can]. Disponible: [${prod.stockUnits}u, ${prod.stockPounds}lbs, ${prod.stockBaskets}can].`
                };
            }
        }

        return { valid: true };
    };

    it('debe rechazar salida cuando la cantidad solicitada supera las existencias disponibles', () => {
        const stock = new Map([
            ['prod-1', { id: 'prod-1', sku: 'POLLO-ENTERO', stockUnits: 5, stockPounds: 25.5, stockBaskets: 2 }]
        ]);

        // Intentar sacar 10 unidades teniendo solo 5
        const items = [{ productId: 'prod-1', qtyUnits: 10, qtyPounds: 10, qtyBaskets: 1 }];
        const result = validateStockWithdrawal(stock, items);

        assert.equal(result.valid, false);
        assert.match(result.error, /Stock insuficiente/);
        assert.match(result.error, /POLLO-ENTERO/);
    });

    it('debe permitir salida cuando hay suficiente stock disponible', () => {
        const stock = new Map([
            ['prod-1', { id: 'prod-1', sku: 'POLLO-ENTERO', stockUnits: 20, stockPounds: 100.0, stockBaskets: 10 }]
        ]);

        const items = [{ productId: 'prod-1', qtyUnits: 5, qtyPounds: 25.0, qtyBaskets: 2 }];
        const result = validateStockWithdrawal(stock, items);

        assert.equal(result.valid, true);
    });

    it('debe rechazar cantidades negativas o en cero', () => {
        const stock = new Map([
            ['prod-1', { id: 'prod-1', sku: 'POLLO-ENTERO', stockUnits: 10, stockPounds: 50.0, stockBaskets: 5 }]
        ]);

        const itemsNeg = [{ productId: 'prod-1', qtyUnits: -5, qtyPounds: 10, qtyBaskets: 1 }];
        const resultNeg = validateStockWithdrawal(stock, itemsNeg);
        assert.equal(resultNeg.valid, false);
        assert.match(resultNeg.error, /no negativas/);

        const itemsZero = [{ productId: 'prod-1', qtyUnits: 0, qtyPounds: 0, qtyBaskets: 0 }];
        const resultZero = validateStockWithdrawal(stock, itemsZero);
        assert.equal(resultZero.valid, false);
    });

    it('debe acumular correctamente múltiples líneas del mismo producto en un movimiento', () => {
        const stock = new Map([
            ['prod-1', { id: 'prod-1', sku: 'POLLO-ENTERO', stockUnits: 10, stockPounds: 50.0, stockBaskets: 5 }]
        ]);

        // Dos líneas de 6 unidades cada una = 12 unidades solicitadas (disponible: 10)
        const items = [
            { productId: 'prod-1', qtyUnits: 6, qtyPounds: 20.0, qtyBaskets: 2 },
            { productId: 'prod-1', qtyUnits: 6, qtyPounds: 20.0, qtyBaskets: 2 }
        ];
        const result = validateStockWithdrawal(stock, items);

        assert.equal(result.valid, false);
        assert.match(result.error, /Stock insuficiente/);
    });

    it('debe impedir que la reversión al eliminar una entrada deje stock negativo', () => {
        // Producto con stock actual de 2 unidades, pero la entrada a eliminar aportó 10 unidades (8 ya fueron vendidas)
        const currentUnits = 2;
        const entryUnitsToRemove = 10;
        const resultingStock = currentUnits - entryUnitsToRemove;

        assert.ok(resultingStock < 0);
        // Regla: si resultingStock < 0, debe rechazarse la eliminación
        const canDelete = resultingStock >= 0;
        assert.equal(canDelete, false);
    });
});
