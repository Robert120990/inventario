import { downloadCSV, escapeCsvCell } from './exportManager.js';

/**
 * Función base para exportar arreglos de objetos a CSV compatible con Excel y Google Sheets
 */
export const exportToCsv = (data, filename) => {
  if (!data || !data.length) {
    alert('No hay datos para exportar');
    return;
  }
  
  const headers = Object.keys(data[0]);
  const lines = [];
  
  // Agregar encabezados
  lines.push(headers.map(escapeCsvCell).join(','));
  
  // Agregar datos
  for (const row of data) {
    const values = headers.map(header => escapeCsvCell(row[header]));
    lines.push(values.join(','));
  }
  
  downloadCSV(lines, filename);
};

export { downloadCSV, downloadXLSX, escapeCsvCell } from './exportManager.js';
