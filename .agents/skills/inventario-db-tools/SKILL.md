---
name: inventario-db-tools
description: >-
  Guía de administración, diagnóstico y migraciones de la base de datos MySQL en Inventario Pro:
  chequeo de integridad, auditoría de contraseñas Bcrypt y prevención de trampas de shell en Windows.
---

# Herramientas de Base de Datos y Prevención de Errores: Inventario Pro

Este documento reúne las prácticas de conexión, herramientas de diagnóstico, reglas de migración y la advertencia crítica sobre la interpolación de variables en terminales Windows PowerShell.

---

## ⚠️ 1. REGLA CRÍTICA: La Trampa de Expansión de Variables en PowerShell

Cuando un agente de IA o programador ejecuta consultas MySQL o scripts rápidos desde PowerShell en Windows:

### El Peligro:
PowerShell interpreta el símbolo `$` dentro de comillas dobles como una variable de entorno. 
Por lo tanto, un hash Bcrypt como:
`$2b$10$Bbi8clHFRWoeYkYdxJAXJungMpH.HPy8Itcps4mlhZhfIOWW.fpJ6`
es interpretado por PowerShell como:
- Variable `$2b` (vacía)
- Variable `$10` (vacía)
- Variable `$Bbi8clHFRWoeYkYdxJAXJungMpH` (vacía)

Resultado catastrófico: La base de datos recibe únicamente `.HPy8Itcps4mlhZhfIOWW.fpJ6`, corrompiendo la contraseña de forma irreversible y provocando errores 500 en el backend.

### La Solución Obligatoria:
1. **Nunca interpolar hashes directamente en comandos inline de PowerShell**.
2. Pasar strings protegidos en **Base64** o crear un script `.js` temporal:
   ```javascript
   // Forma segura usando Base64:
   const hash = Buffer.from('JDJiJDEwJEJiaThjbEhGUldvZVlrWWR4SkFYSnVuZ01wSC5IUHk4SXRjcHM0bWxoWmhmSU9XVy5mcEo2', 'base64').toString('utf8');
   ```

---

## 🔍 2. Diagnóstico Automatizado: `npm run db:check`

Para evaluar la salud completa de la base de datos remota (`5.252.55.29`), ejecutar:

```bash
npm run db:check
```

[`scripts/db-diagnose.js`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/scripts/db-diagnose.js) realiza automáticamente:
1. **Medición de Latencia de Red**: Tiempo de respuesta ping a MySQL.
2. **Conteo por Tabla**: Existencias en `users`, `products`, `movements`, `daily_cuts`, etc.
3. **Auditoría de Hashes de Contraseña**: Detecta si algún usuario tiene contraseñas truncadas o en texto plano.
4. **Validación de Triple Unidad**: Verifica que no existan productos con existencias negativas (`< 0`) o nulas (`NULL`).
5. **Historial de Migraciones**: Lista las migraciones aplicadas en `schema_migrations`.

---

## 🛠️ 3. Motor de Migraciones Versionadas (`ensureSchema`)

Ubicado en [`api/db.js`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/api/db.js):
- Cada migración se registra en la tabla `schema_migrations` con `version`, `description` y `applied_at`.
- Para agregar una nueva columna o tabla:
  1. Registrar una nueva entrada en el arreglo `MIGRATIONS` en `api/db.js`.
  2. Implementar funciones idempotentes (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`).
  3. La migración se ejecuta automáticamente al arrancar el servidor backend.

---

## 🔌 4. Configuración del Pool MySQL para Serverless

En entornos como Vercel donde los lambdas se crean y destruyen:
- Utilizar `waitForConnections: true`.
- Mantener `connectionLimit: 5` o `10` para no agotar las conexiones simultáneas del servidor MySQL (`max_connections`).
- Siempre liberar conexiones en bloques `finally { if (connection) connection.release(); }`.
