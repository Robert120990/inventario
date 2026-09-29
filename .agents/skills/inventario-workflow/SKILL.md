---
name: inventario-workflow
description: >-
  Guía completa de flujo de trabajo para el desarrollo, ejecución local, compilación,
  versionado semántico y solución de problemas en el proyecto Inventario Pro.
---

# Flujo de Trabajo de Desarrollo: Inventario Pro

Esta guía contiene los procedimientos y comandos esenciales para trabajar eficazmente en el proyecto **Inventario Pro**.

---

## 🛠️ 1. Requisitos Previos y Configuración de Entorno

El proyecto requiere **Node.js** (v18 o superior) y una instancia de **MySQL** (local o remota).

### Configuración del archivo `.env`
Dentro de la carpeta `inventario/`, asegúrate de que exista el archivo `.env` (puedes basarte en `.env.example`):

```env
DB_HOST=127.0.0.1
DB_USER=root
DB_PASS=tu_password_segura
DB_NAME=inventario_db
DB_PORT=3306
JWT_SECRET=super_secret_jwt_key_inventario_2026
PORT=3000
```

> [!NOTE]
> El backend utiliza un connection pool optimizado en [`api/db.js`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/api/db.js) con timeout de conexión de 5 segundos y reintentos automáticos.

---

## 💻 2. Comandos de Ejecución y Desarrollo

Todos los comandos de NPM deben ejecutarse dentro del directorio `inventario/`:

| Comando | Descripción |
| :--- | :--- |
| `npm install` | Instala las dependencias de frontend y backend. |
| `npm run dev` | Inicia simultáneamente el servidor API Express (puerto 3000) y el servidor de desarrollo Vite (puerto 5173). |
| `npm run server` | Inicia únicamente el backend Express en [`api/index.js`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/api/index.js). |
| `npm run build` | Ejecuta el script de incremento de versión y genera el bundle de producción en `dist/`. |
| `npm run version:update` | Incrementa automáticamente el número de compilación y actualiza [`version.json`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/src/config/version.json). |
| `npm run lint` | Ejecuta ESLint para validar la calidad del código. |
| `npm run preview` | Previsualiza el bundle compilado de producción localmente. |

---

## 🔄 3. Ciclo de Versionado Automático

El proyecto incluye un script de versionado inteligente en [`scripts/update-version.js`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/scripts/update-version.js).

Al ejecutar `npm run build` o `npm run version:update`:
1. Lee el último commit de Git y el conteo de revisiones.
2. Incrementa el número de `build`.
3. Actualiza y sincroniza:
   - `src/config/version.json`
   - `public/version.json`
   - `dist/version.json` (si existe la carpeta dist)
4. El componente [`UpdateNotifier.jsx`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/src/components/Common/UpdateNotifier.jsx) detecta cambios de versión en caliente en los navegadores de los clientes.

---

## 🗄️ 4. Base de Datos y Auto-Migraciones

- La base de datos se inicializa automáticamente al arrancar el backend mediante la función `ensureSchema()` en [`api/db.js`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/api/db.js).
- Las tablas utilizan sentencias `CREATE TABLE IF NOT EXISTS`.
- Las modificaciones de columnas existentes se ejecutan de forma segura e idempotente mediante bloques `try / catch`.
- **Diagnóstico de Salud**: Puedes comprobar la conexión en tiempo real navegando al endpoint `GET /api/health` o `GET http://localhost:3000/api/health`.

---

## ⚠️ 5. Solución de Problemas Frecuentes

1. **Error de conexión a MySQL (`ECONNREFUSED` o `ETIMEDOUT`)**:
   - Verifica que las credenciales en `.env` coincidan con tu servidor MySQL.
   - Si usas una base de datos remota en la nube, comprueba que tu dirección IP esté autorizada en el firewall o whitelist.
2. **Conflicto de Puertos (3000 o 5173 en uso)**:
   - Puedes definir un puerto alternativo para el backend con la variable `PORT=3001` en `.env`.
   - Vite seleccionará automáticamente el siguiente puerto disponible si el 5173 está ocupado.
3. **Contraseñas heredadas sin hash bcrypt**:
   - Ejecuta `node scripts/hash-passwords.js` para migrar contraseñas en texto plano a hashes seguros de `bcrypt`.
