/**
 * Middleware para autorización RBAC granular por módulo y acción.
 * Re-exportado desde ./auth.js como única fuente de verdad (verifica permisos en memoria con 0 consultas extra).
 */
export { requirePermission, requireAdmin } from './auth.js';

