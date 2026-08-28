// Tarifas y Reglas del Contrato Almacenadora LIL y Avícola Salvadoreña 2025-2026

export const CONTRACT_INFO = {
  clientName: 'Avícola Salvadoreña, S.A. de C.V.',
  contractorName: 'Inversiones LIL, S.A. de C.V.',
  facility: 'Cuarto Frío San Martín (Km 19 Carretera Panamericana)',
  period: '16 de Enero 2025 - 15 de Enero 2026',
  cutoffs: [10, 25], // Días 10 y 25 de cada mes calendario
  defaultStorageRatePounds: 0.001, // $0.001 por libra / día (Producto Crudo)
  defaultStorageRateBaskets: 0.038, // $0.038 por cesta / día (Productos cocinados/patties)
  palletBasketCapacity: 35, // 35 cestas por pallet ($1.33 / pallet / día)
  ivaRate: 0.13, // IVA 13%
  insuranceRate: 0.10 // 0.10% sobre valor CIF
};

// Catálogo de Servicios Especiales / Extraordinarios según Anexo A
export const EXTRA_SERVICE_PRESETS = [
  { id: 'rastra_habil', label: 'Descarga y Carga Rastra (Horas hábiles)', unitPrice: 54.00, unitLabel: 'Servicio' },
  { id: 'rastra_nohabil', label: 'Descarga y Carga Rastra (Horas no hábiles)', unitPrice: 95.00, unitLabel: 'Servicio' },
  { id: 'camion8_habil', label: 'Descarga y Carga Camión 8 Ton (Horas hábiles)', unitPrice: 30.00, unitLabel: 'Servicio' },
  { id: 'camion8_nohabil', label: 'Descarga y Carga Camión 8 Ton (Horas no hábiles)', unitPrice: 60.00, unitLabel: 'Servicio' },
  { id: 'camion5_habil', label: 'Descarga y Carga Camión 5 Ton (Horas hábiles)', unitPrice: 25.00, unitLabel: 'Servicio' },
  { id: 'camion5_nohabil', label: 'Descarga y Carga Camión 5 Ton (Horas no hábiles)', unitPrice: 50.00, unitLabel: 'Servicio' },
  { id: 'hora_extra_normal', label: 'Hora Extra (Día Normal / Horas no hábiles)', unitPrice: 50.00, unitLabel: 'Horas' },
  { id: 'hora_extra_festivo', label: 'Hora Extra (Día Festivo / No hábil)', unitPrice: 60.00, unitLabel: 'Horas' }
];

// Tabla de tarifas por temperatura fuera de rango (-18°C a -20°C)
// Precios por libra recibida según Anexo A
export const TEMPERATURE_RATES = {
  '-13': 0.003,
  '-12': 0.004,
  '-11': 0.005,
  '-10': 0.006,
  '-9': 0.007,
  '-8': 0.008,
  '-7': 0.009,
  '-6': 0.010,
  '-5': 0.012,
  '-4': 0.014,
  '-3': 0.016,
  '-2': 0.018,
  '-1': 0.020,
  '0': 0.022,
  '1': 0.024,
  '2': 0.026,
  '3': 0.028,
  '4': 0.030,
  '5': 0.032,
  '6': 0.034
};

/**
 * Obtiene la tarifa por libra según la temperatura en °C
 * Si la temperatura está dentro del rango (-14°C o menor), la tarifa es 0.
 * Si es mayor a -14°C, aplica el escalafón del contrato (ej. -13.9°C -> -13°C: $0.003).
 * Si es mayor que +6°C, se aplica la tarifa máxima de 6°C ($0.034).
 */
export const getTemperatureRate = (tempCelsius) => {
  if (tempCelsius === null || tempCelsius === undefined || isNaN(Number(tempCelsius))) return 0;
  const num = Number(tempCelsius);
  if (num <= -14.000001) return 0; // Dentro del rango normal o permitido (-14°C o menor)
  
  // Para temperaturas fuera de rango (> -14°C), se aplica el escalafón del contrato (Math.ceil)
  // Ej: -13.9°C cae en -13°C ($0.003), -12.4°C en -12°C ($0.004), etc.
  const tempKey = Math.min(6, Math.max(-13, Math.ceil(num)));
  return TEMPERATURE_RATES[String(tempKey)] || 0;
};

/**
 * Calcula el cobro extraordinario por temperatura fuera de rango
 * @param {number} tempCelsius Temperatura promedio registrada
 * @param {number} pounds Total de libras recibidas en el movimiento
 * @param {boolean} isAverage Indica si es promedio de temperatura
 */
export const calculateTemperatureService = (tempCelsius, pounds, isAverage = true) => {
  const numTemp = Number(tempCelsius);
  const rate = getTemperatureRate(numTemp);
  if (rate <= 0 || !pounds || pounds <= 0) return null;
  
  const roundedTemp = Number(numTemp.toFixed(1));
  const formattedTemp = roundedTemp > 0 ? `+${roundedTemp}` : `${roundedTemp}`;
  const prefix = isAverage ? 'Temperatura Promedio' : 'Temperatura';
  
  return {
    description: `${prefix} ${formattedTemp}°C (${Number(pounds).toLocaleString('en-US', { maximumFractionDigits: 2 })} lbs)`,
    quantity: Number(pounds),
    unitPrice: rate,
    value: Number((pounds * rate).toFixed(2))
  };
};

/**
 * Resuelve y normaliza los detalles de un servicio extraordinario.
 * Si el servicio fue registrado con cantidad = 1 pero en la descripción incluye libras (ej. "(1425 lbs)"),
 * extrae las libras reales en quantity, calcula el precio unitario por libra y conserva el valor total $.
 */
export const resolveServiceDetails = (s) => {
  if (!s) return { description: '', quantity: 1, unitPrice: 0, value: 0 };
  
  let qty = Number(s.quantity);
  let price = Number(s.unitPrice);
  let val = Number(s.value || 0);
  const desc = String(s.description || '');

  // Buscar libras en la descripción: ej. "(1425 lbs)", "(4,955.50 lbs)", "1425 lbs", etc.
  const lbsMatch = desc.match(/([0-9,]+(?:\.[0-9]+)?)\s*lbs/i);
  if (lbsMatch) {
    const extractedLbs = parseFloat(lbsMatch[1].replace(/,/g, ''));
    if (!isNaN(extractedLbs) && extractedLbs > 0) {
      // Si la cantidad guardada era 1 o diferente a las libras detectadas
      if (isNaN(qty) || qty === 1 || qty <= 0 || qty !== extractedLbs) {
        qty = extractedLbs;
        // Si el precio unitario era igual al valor total (o no era la tarifa por libra)
        if (val > 0 && (price === val || isNaN(price) || price === 0 || price >= 1)) {
          price = Number((val / extractedLbs).toFixed(5));
        }
      }
    }
  }

  if (isNaN(qty) || qty <= 0) qty = 1;
  if (isNaN(price) || price <= 0) {
    price = qty > 0 && val > 0 ? Number((val / qty).toFixed(5)) : val;
  }
  if (val === 0 && qty > 0 && price > 0) {
    val = Number((qty * price).toFixed(2));
  }

  return {
    ...s,
    description: desc,
    quantity: qty,
    unitPrice: price,
    value: val
  };
};

