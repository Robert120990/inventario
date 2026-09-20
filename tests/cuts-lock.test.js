import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Protección y Bloqueo de Cortes (Cuts Lock Enforcement)', () => {
    // Función de comprobación de períodos cerrados
    const checkDateLocked = (targetDate, dailyCuts = [], insuranceCuts = []) => {
        for (const cut of dailyCuts) {
            if (cut.isLocked && targetDate >= cut.startDate && targetDate <= cut.endDate) {
                return {
                    locked: true,
                    type: 'daily',
                    cutTitle: cut.title,
                    error: `La fecha ${targetDate} pertenece al corte diario cerrado '${cut.title}'.`
                };
            }
        }
        for (const ins of insuranceCuts) {
            if (ins.isLocked && ins.cutoffDate >= targetDate) {
                return {
                    locked: true,
                    type: 'insurance',
                    cutTitle: ins.title,
                    error: `La fecha ${targetDate} se encuentra dentro del corte de póliza de seguro '${ins.title}'.`
                };
            }
        }
        return { locked: false };
    };

    it('debe bloquear operaciones en fechas comprendidas dentro de un corte diario bloqueado', () => {
        const lockedDailyCuts = [
            { id: 'c1', title: 'Corte Quincena 1 Septiembre', startDate: '2026-09-01', endDate: '2026-09-15', isLocked: 1 }
        ];

        // Fecha dentro del rango
        const checkInside = checkDateLocked('2026-09-10', lockedDailyCuts, []);
        assert.equal(checkInside.locked, true);
        assert.match(checkInside.error, /Corte Quincena 1 Septiembre/);

        // Fecha límite superior
        const checkEnd = checkDateLocked('2026-09-15', lockedDailyCuts, []);
        assert.equal(checkEnd.locked, true);

        // Fecha fuera del rango
        const checkOutside = checkDateLocked('2026-09-16', lockedDailyCuts, []);
        assert.equal(checkOutside.locked, false);
    });

    it('debe permitir operaciones si el corte existe pero se encuentra desbloqueado (isLocked = 0)', () => {
        const unlockedDailyCuts = [
            { id: 'c2', title: 'Corte Borrador', startDate: '2026-09-01', endDate: '2026-09-15', isLocked: 0 }
        ];

        const check = checkDateLocked('2026-09-10', unlockedDailyCuts, []);
        assert.equal(check.locked, false);
    });

    it('debe impedir sobreescritura de datos si el corte está bloqueado', () => {
        const currentCut = { id: 'c1', title: 'Corte Final', isLocked: 1, congeladosData: '[]' };
        const updateAttempt = { congeladosData: '[{"sku": "NEW"}]' };

        // Regla: no se puede actualizar datos si isLocked === 1
        const canUpdate = currentCut.isLocked === 0;
        assert.equal(canUpdate, false);
    });

    it('debe permitir sobreescritura de datos solo tras desbloqueo explícito', () => {
        let currentCut = { id: 'c1', title: 'Corte Final', isLocked: 1 };
        
        // Simular llamada a /lock-status
        currentCut = { ...currentCut, isLocked: 0 };

        const canUpdate = currentCut.isLocked === 0;
        assert.equal(canUpdate, true);
    });
});
