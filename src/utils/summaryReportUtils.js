/**
 * Utilidad pura para el cálculo del reporte Resumen de Actividad (Resumen 1).
 * Pre-indexa los movimientos por productId para evitar complejidad cuadrática
 * y sumar correctamente múltiples líneas del mismo SKU dentro de un mismo movimiento.
 */

const toDateKey = (value) => String(value ?? '').slice(0, 10);

const createEmptyBucket = () => ({
  inUnits: 0,
  inPounds: 0,
  inBaskets: 0,
  outUnits: 0,
  outPounds: 0,
  outBaskets: 0
});

const getOrInitBucket = (map, productId) => {
  const key = String(productId);
  let bucket = map.get(key);
  if (!bucket) {
    bucket = createEmptyBucket();
    map.set(key, bucket);
  }
  return bucket;
};

/**
 * Calcula las filas del reporte de actividad para un rango de fechas [startDate, endDate].
 */
export const calculateSummaryReport = ({
  products = [],
  movements = [],
  categoryUnits = {},
  startDate = '',
  endDate = ''
} = {}) => {
  const startKey = toDateKey(startDate);
  const endKey = toDateKey(endDate);

  if (!startKey || !endKey || !Array.isArray(products) || products.length === 0) {
    return [];
  }

  const afterEndByProduct = new Map();
  const inRangeByProduct = new Map();

  for (const mov of movements || []) {
    if (!mov || !Array.isArray(mov.items) || mov.items.length === 0) continue;
    const mDate = toDateKey(mov.date);
    if (!mDate) continue;

    let targetMap = null;
    if (mDate > endKey) {
      targetMap = afterEndByProduct;
    } else if (mDate >= startKey && mDate <= endKey) {
      targetMap = inRangeByProduct;
    }
    if (!targetMap) continue;

    const isIn = mov.type === 'in';
    const isOut = mov.type === 'out';
    if (!isIn && !isOut) continue;

    for (const item of mov.items) {
      if (!item || item.productId === undefined || item.productId === null) continue;
      const bucket = getOrInitBucket(targetMap, item.productId);
      const u = Number(item.qtyUnits) || 0;
      const p = Number(item.qtyPounds) || 0;
      const b = Number(item.qtyBaskets) || 0;

      if (isIn) {
        bucket.inUnits += u;
        bucket.inPounds += p;
        bucket.inBaskets += b;
      } else {
        bucket.outUnits += u;
        bucket.outPounds += p;
        bucket.outBaskets += b;
      }
    }
  }

  const rows = [];
  for (const p of products) {
    const key = String(p.id);
    const unitType = categoryUnits?.[p.category] || 'units';
    const stockField =
      unitType === 'units'
        ? 'stockUnits'
        : unitType === 'pounds'
          ? 'stockPounds'
          : 'stockBaskets';
    const unitLabel =
      unitType === 'units'
        ? 'Und'
        : unitType === 'pounds'
          ? 'Lbs'
          : 'Cst';
    const inKey =
      unitType === 'units'
        ? 'inUnits'
        : unitType === 'pounds'
          ? 'inPounds'
          : 'inBaskets';
    const outKey =
      unitType === 'units'
        ? 'outUnits'
        : unitType === 'pounds'
          ? 'outPounds'
          : 'outBaskets';

    const currentStock = Number(p[stockField] || 0);
    const afterBucket = afterEndByProduct.get(key);
    const rangeBucket = inRangeByProduct.get(key);

    const stockAtEnd = afterBucket
      ? currentStock - afterBucket[inKey] + afterBucket[outKey]
      : currentStock;
    const entradas = rangeBucket ? rangeBucket[inKey] : 0;
    const salidas = rangeBucket ? rangeBucket[outKey] : 0;

    if (entradas <= 0 && salidas <= 0) continue;

    const stockInicial = stockAtEnd - entradas + salidas;
    const precio = Number(p.price || 0);
    const total = stockAtEnd * precio;

    rows.push({
      id: p.id,
      producto: `${p.sku} - ${p.description}`,
      categoria: p.category,
      unidad: unitLabel,
      stockInicial,
      entradas,
      salidas,
      stockFinal: stockAtEnd,
      precio,
      total
    });
  }

  return rows;
};
