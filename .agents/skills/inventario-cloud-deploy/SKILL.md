---
name: inventario-cloud-deploy
description: >-
  Guía completa y flujo de sincronización multi-remoto (origin y upstream), despliegue en Vercel,
  compatibilidad serverless (bcryptjs, CORS, IP truncation) y versionado semántico en Inventario Pro.
---

# Flujo de Despliegue en la Nube y Sincronización Multi-Remoto

Esta guía define las reglas indispensables para la compilación, versionado y sincronización del repositorio de **Inventario Pro** hacia los dos repositorios remotos y la infraestructura de nube en **Vercel**.

---

## 🌐 1. Topología de Repositorios y Nube

El proyecto se distribuye simultáneamente en dos repositorios de GitHub y se compila automáticamente en Vercel:

| Remoto | Propietario | URL |
| :--- | :--- | :--- |
| **`origin`** | Raúl Sosa | `https://github.com/raulrafael/inventario.git` |
| **`upstream`** | Roberto | `https://github.com/Robert120990/inventario.git` |
| **Producción Web** | Vercel | `https://inventario-coldroom.vercel.app/` |

### Regla de Oro Multi-Remoto:
Toda actualización aprobada debe ser empujada **a ambas ramas (`main` y `master`) en ambos remotos (`origin` y `upstream`)**.

---

## ⚡ 2. Herramienta Automatizada: `npm run sync:all`

Para facilitar la sincronización a programadores o agentes de IA, se dispone del script:
[`scripts/sync-remotes.js`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/scripts/sync-remotes.js)

```bash
# Ejecución directa desde terminal
npm run sync:all "feat: descripción del cambio"
```

### Qué hace este comando automáticamente:
1. Revisa si hay cambios pendientes (`git status --porcelain`).
2. Si los hay, ejecuta `npm run build` (auto-incrementa versión semántica y sincroniza `SYSTEM_CHANGELOG`).
3. Hace commit con el mensaje indicado.
4. Empuja en 4 direcciones atómicas:
   - `git push origin main:master`
   - `git push upstream main:master`
   - `git push origin main`
   - `git push upstream main`
5. Espera 12 segundos y consulta el endpoint oficial `https://inventario-coldroom.vercel.app/version.json` para verificar que Vercel compiló y desplegó exitosamente.

---

## ☁️ 3. Reglas de Compatibilidad Serverless (Vercel)

Al programar endpoints en [`api/`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/api/), el agente de IA **DEBE** cumplir estrictamente las siguientes directrices:

### 1. Usar `bcryptjs`, NUNCA `bcrypt` nativo
- Los lambdas de Vercel fallan al cargar binarios nativos de C++ compilados en Windows.
- Siempre importar `import bcrypt from 'bcryptjs';`.

### 2. Proteger `app.listen()` de la ejecución serverless
- En Vercel, Express opera como handler exportado, no como daemon permanente.
- El servidor solo debe escuchar puerto en desarrollo local:
  ```javascript
  if (!process.env.VERCEL) {
      app.listen(PORT, () => console.log(`Servidor local en puerto ${PORT}`));
  }
  ```

### 3. Política de CORS Permisiva para Vercel
- Si `ALLOWED_ORIGINS` no está definido en las variables de entorno de Vercel, el middleware de CORS debe permitir automáticamente subdominios `*.vercel.app` y `localhost`:
  ```javascript
  if (!origin || origin.endsWith('.vercel.app') || origin.includes('localhost')) {
      return callback(null, true);
  }
  ```

### 4. Truncamiento Seguro de Direcciones IP
- En Vercel, los proxies balanceadores pueden concatenar múltiples IPs en la cabecera `x-forwarded-for` (ej. `192.168.1.1, 10.0.0.1...`).
- Para evitar que exceda la columna `VARCHAR(50)` de `active_sessions` y lance un error 500, siempre truncar:
  ```javascript
  const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const ip = typeof rawIp === 'string' ? rawIp.substring(0, 45) : 'unknown';
  ```

### 5. `JWT_SECRET` Seguro sin Crashes
- En [`api/middleware/auth.js`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/api/middleware/auth.js), advertir con `console.warn` en vez de arrojar `new Error` fatal si la variable no está configurada en la nube, permitiendo fallback seguro sin derribar la API completa.

---

## 🩺 4. Monitoreo y Comprobación Rápida

Para verificar el estado del despliegue en cualquier momento:

```bash
npm run health
```

Consulta en milisegundos la versión activa, el commit desplegado y el estado de la conexión a la base de datos MySQL remota.
