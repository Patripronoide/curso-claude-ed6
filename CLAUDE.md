# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Resttek: plataforma de gestión de restaurantes. Monorepo con **npm workspaces** (`packages/*`):

- `api` — Express 5 + TypeScript (ESM) + SQLite, puerto 3000
- `web-admin` (:4200), `web-empleados` (:4201), `web-clientes` (:4202) — Angular 21
- `web-shared` — librería Angular común (auth, interceptors, login/registro)

La documentación detallada está en `docs/` (arquitectura, dominio, revisiones de inconsistencias). Consúltala antes de cambios estructurales y mantenla actualizada en español.

## Comandos

Desde la raíz (`npm install` una sola vez instala todos los paquetes):

```bash
npm run dev:api          # API con hot-reload (tsx watch)
npm run dev:admin        # / dev:empleados / dev:clientes — ng serve con proxy /api → :3000
npm run seed             # Datos de prueba (idempotente, INSERT OR IGNORE)
npm test                 # Tests de la API (vitest run)
```

Un único test o fichero (desde `packages/api`):

```bash
npx vitest run src/services/order.service.test.ts
npx vitest run -t "nombre del test"
npm run test:watch
```

Build de un frontend: `npm run build -w @resttek/web-admin`. No hay linter configurado ni tests en los frontends; solo `web-clientes` tiene `.prettierrc` (comillas simples, `printWidth` 100).

Credenciales de seed: la contraseña de cada usuario es su propio email (p. ej. `admin@resttek.com`). Lista completa en el README.

## Arquitectura de la API

En `packages/api/src` conviven **dos estilos**; sigue el del dominio que estés tocando:

- **Hexagonal + DDD, solo `employee`** (`contexts/employee/{domain,application,infrastructure}`): entidad `Employee` con constructor privado + `create()` que valida; value objects `Email` y `Role`; casos de uso con un único `execute()`; interfaces con prefijo `I`. El cableado de dependencias está en `infrastructure/http/dependencies.ts`.
- **Por capas para `restaurant`, `dish`, `ingredient`, `order`, `table`**: carpetas `models/` (interfaces planas + funciones `normalizeX()`), `repositories/` (interfaz sin prefijo + implementación SQLite en el mismo fichero), `services/` (validación y lógica), `controllers/`, `routes/`. La composición de dependencias se hace en el propio fichero de rutas.
- `contexts/shared/` contiene `Email`, los middlewares `authenticate`/`authorize(roles)` y el `errorHandler`.

Detalles que no son obvios:

- Imports con path aliases (`@config/*`, `@services/*`, `@employee/*`, `@shared/*`…, ver `tsconfig.json`) y **siempre con extensión `.js`** (ESM, `module: nodenext`).
- Routers montados bajo `/restaurants/:restaurantId/...` necesitan `Router({ mergeParams: true })`.
- Errores: heredan de `AppError` (`errors/DomainErrors.ts`); el `errorHandler` asigna el código HTTP **por el nombre de la clase** (lista explícita de 404, lista `CONFLICT_ERRORS` → 409, `InvalidCredentialsError` → 401, resto → 400). Un error nuevo de "no encontrado" o de conflicto hay que añadirlo a su lista. `OrderController` es la excepción: gestiona sus errores con `try/catch` propio en vez de `next(error)`.
- Base de datos: `dbConfig` (`config/database.ts`) es una instancia exportada; las tablas se crean en código al arrancar (`runInitialMigrations`). Con `NODE_ENV=test` usa `:memory:`; si no, `packages/api/resttek.db`. Columnas en `snake_case` mapeadas a `camelCase` con alias en el SQL.
- Al crear un pedido, cada ítem con `quantity: N` se expande a N filas de `order_items` con `quantity: 1` para seguir el estado de cada unidad.
- Roles: `admin`, `manager` (gerente, no `'gerente'`), `camarero`, `cocinero`, `cliente`.
- Tests unitarios junto al código (`*.test.ts`), con dobles en `contexts/employee/application/mocks/` y `repositories/mocks/`. Los tests de repositorio usan SQLite en memoria. Solo mesas y pedidos tienen tests HTTP (`routes/*.http.test.ts`, con `app.listen(0)` + `fetch`; supertest está instalado pero sin usar).

## Arquitectura de los frontends

- Angular 21: standalone components, signals, zoneless (sin `zone.js`), guards/interceptors funcionales, lazy loading.
- `web-admin` y `web-empleados`: features autocontenidas en `features/<feature>/{models,pages,services,store}`. Patrón **Store**: servicio `providedIn: 'root'` con signals privadas expuestas con `asReadonly()`, trío datos/`loading`/`error`, convierte los `Observable` del service con `firstValueFrom`; los componentes solo hablan con el store. `OrderStore` de empleados hace polling cada 30 s.
- `web-clientes`: modelos y servicios centralizados en `core/`; los componentes llaman a los services directamente con `.subscribe()`. Único store: `CartStore` (local, sin HTTP). Componente raíz `App` (no `AppComponent`).
- `web-shared` se consume desde el fuente (`main: src/index.ts`): todo lo nuevo debe exportarse desde `src/index.ts`, y los cambios requieren reiniciar el `ng serve`.
- URL de la API: token `API_URL` (`'/api/v1'`). `web-clientes` y `web-shared` lo inyectan; `web-admin`/`web-empleados` importan `environment.apiUrl` directamente.
- Estilos: cada app tiene su propia copia del design system (dark mode) en `src/styles.css`; `web-shared/src/lib/styles/base.css` existe pero no se importa en ningún sitio.
