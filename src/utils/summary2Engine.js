/**
 * Motor puro de cálculo e integridad en cascada para Cuadro Cliente Cuarto Frío (Resumen 2).
 */

/**
 * Garantiza integridad matemática en cascada:
 * Saldo Inicial (Día N) === Saldo Final (Día N-1), recalculando desde `startIndex`.
 */
export const ensureCascadingIntegrity = (rows, defaultRate = 0.001, startIndex = 0) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const normalized = rows.map(r => ({ ...r }));
  const begin = Math.max(0, Number(startIndex) || 0);

  for (let i = begin; i < normalized.length; i++) {
    if (i > 0) {
      normalized[i].stockInicial = Number(normalized[i - 1].stockFinal) || 0;
    }
    const init = Number(normalized[i].stockInicial) || 0;
    const ent = Number(normalized[i].entradas) || 0;
    const sal = Number(normalized[i].salidas) || 0;
    normalized[i].stockFinal = init + ent - sal;
    normalized[i].totalMonto = normalized[i].stockFinal * Number(normalized[i].precio || defaultRate);
  }
  return normalized;
};

/**
 * Calcula totales acumulados de una serie diaria (Congelados o Preparados).
 */
export const calculateStorageTotals = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { invInicial: 0, entradas: 0, salidas: 0, stockFinal: 0, totalMonto: 0 };
  }
  let invInicial = 0;
  let entradas = 0;
  let salidas = 0;
  let stockFinal = 0;
  let totalMonto = 0;

  for (const r of rows) {
    invInicial += Number(r?.stockInicial) || 0;
    entradas += Number(r?.entradas) || 0;
    salidas += Number(r?.salidas) || 0;
    stockFinal += Number(r?.stockFinal) || 0;
    totalMonto += Number(r?.totalMonto) || 0;
  }

  return { invInicial, entradas, salidas, stockFinal, totalMonto };
};
