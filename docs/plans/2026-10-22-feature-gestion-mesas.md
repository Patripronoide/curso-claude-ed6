## 📋 Plan de implementación

# Gestión de mesas (issue #5)

- **Tipo:** feature
- **Fecha:** 2026-10-22
- **Estado:** Pendiente
- **Issue:** [#5 Gestión de mesas](https://github.com/Patripronoide/curso-claude-ed6/issues/5)
- **Tiempo estimado total:** 284 min (contrato 10 min · API 113 min · web-admin 44 min · web-empleados 49 min · web-clientes 43 min · integración y documentación 25 min)

## 1. Contexto

La issue pide tres cosas:

1. **Cliente.** Al elegir restaurante indica primero el número de personas y ve las mesas disponibles con capacidad suficiente. Al elegir una y pulsar "Continuar", la mesa pasa a `ocupada` y va a la carta para enviar su pedido a cocina y barra.
2. **Administrador.** CRUD de las mesas del restaurante. Cada mesa tiene `id`, `número`, `descripción`, `capacidad` y `estado` (`libre`, `ocupada`, `reservada`).
3. **Empleados.** Ven el estado de las mesas y lo cambian. También ven el estado de los pedidos de las mesas ocupadas.

Hoy no existe el concepto de mesa: `orders.table_id` es un `TEXT` libre sin clave foránea (el cliente envía `tableId: null` y el seed usa `'5'`).

## 2. Objetivo y alcance

**Incluye:**

- Entidad `Table` (tabla SQLite `restaurant_tables`) con CRUD de administrador en la API.
- Endpoint público para listar las mesas libres con capacidad suficiente y endpoint autenticado de cliente para ocuparla de forma atómica.
- Endpoint para que `admin`, `manager` y `camarero` cambien el estado de una mesa.
- Validación de `tableId` al crear un pedido y número de mesa en los pedidos activos.
- **Contrato OpenAPI de todo lo anterior, definido antes de implementar**, para que las cuatro apps trabajen en paralelo.
- `web-admin`: pantallas de gestión de mesas. `web-empleados`: tablero de mesas con cambio de estado y pedidos de las mesas ocupadas. `web-clientes`: selección de personas y mesa antes de la carta.
- Documentación (`docs/dominio/modelo-datos.md`, `docs/arquitectura/arquitectura-api.md`, `CLAUDE.md` si procede).

**No incluye:**

- Liberar la mesa automáticamente al entregar todo el pedido o al pagar (la libera un empleado a mano).
- Gestión de reservas (fecha/hora, cliente): `reservada` es solo un estado que fija un empleado.
- Documentación OpenAPI global de la API (issue #6): aquí solo se escribe el contrato de mesas.
- Tests en los frontends (el proyecto no los tiene; se comprueba con `npm run build -w <paquete>`).
- Cambios en `web-shared`.

## 3. Análisis del código actual

- API por capas (estilo de `ingredient`): [models/ingredient.model.ts](../../packages/api/src/models/ingredient.model.ts), [repositories/ingredient.repository.ts](../../packages/api/src/repositories/ingredient.repository.ts), [services/ingredient.service.ts](../../packages/api/src/services/ingredient.service.ts), [controllers/ingredient.controller.ts](../../packages/api/src/controllers/ingredient.controller.ts) y [routes/ingredient.routes.ts](../../packages/api/src/routes/ingredient.routes.ts) (`Router({ mergeParams: true })`, composición en el fichero de rutas). Es el patrón a replicar.
- Montaje de rutas en [app.ts](../../packages/api/src/app.ts): `/api/v1/restaurants/:restaurantId/...` (privadas) y `/api/v1/public/restaurants/...` (públicas).
- Tablas creadas en código en [config/database.ts](../../packages/api/src/config/database.ts) (`runInitialMigrations`). `orders.table_id` existe, es `TEXT` y no tiene FK.
- Errores en [errors/DomainErrors.ts](../../packages/api/src/errors/DomainErrors.ts). [errorHandler.ts](../../packages/api/src/contexts/shared/infrastructure/http/errorHandler.ts) asigna 404 por nombre de clase (`NOT_FOUND_ERRORS`), 401 a `InvalidCredentialsError` y 400 al resto. **No hay 409**, hay que añadirlo.
- Pedidos: [order.service.ts](../../packages/api/src/services/order.service.ts) (`create` no valida `tableId`), [order.repository.ts](../../packages/api/src/repositories/order.repository.ts) (`table_id` en `INSERT` y en los `SELECT` de `findById`, `findByClientId` y `findActiveByRestaurant`), [order.routes.ts](../../packages/api/src/routes/order.routes.ts) y [order.controller.ts](../../packages/api/src/controllers/order.controller.ts) (gestiona errores con `try/catch` propio).
- Roles: `admin`, `manager`, `camarero`, `cocinero`, `cliente` ([middlewares.ts](../../packages/api/src/contexts/shared/infrastructure/http/middlewares.ts)). El token lleva `id` y `role`.
- [scripts/seed.ts](../../packages/api/src/scripts/seed.ts): inserta un pedido con `table_id = '5'`, que no corresponde a ninguna mesa real.
- `web-admin`: features autocontenidas con patrón Store (ej. [features/ingredients](../../packages/web-admin/src/app/features/ingredients/)), rutas colgadas de `restaurants/:restaurantId` en [app.routes.ts](../../packages/web-admin/src/app/app.routes.ts) y tarjetas de acceso en `restaurant-dashboard.component.html`.
- `web-empleados`: [salon.component.ts](../../packages/web-empleados/src/app/features/orders/pages/salon/salon.component.ts) solo muestra ítems `listo` para entregar; [order.store.ts](../../packages/web-empleados/src/app/features/orders/store/order.store.ts) hace polling cada 30 s; el menú y los permisos por rol están en `core/layout/shell.component.ts`.
- `web-clientes`: [restaurant-list.component.ts](../../packages/web-clientes/src/app/features/restaurants/restaurant-list.component.ts) enlaza a `/restaurants/:id` (carta); [order.service.ts](../../packages/web-clientes/src/app/core/services/order.service.ts) envía `tableId: null`; modelos y servicios centralizados en `core/`, `CartStore` local sin HTTP.

## 4. Solución propuesta

### 4.1 Modelo de datos

Tabla nueva `restaurant_tables` (el nombre `tables` se evita por claridad):

| Columna | Tipo | Notas |
| ------- | ---- | ----- |
| `id` | TEXT PK | UUID |
| `restaurant_id` | TEXT NOT NULL FK → `restaurants(id)` | |
| `number` | INTEGER NOT NULL | `UNIQUE(restaurant_id, number)` |
| `description` | TEXT | opcional |
| `capacity` | INTEGER NOT NULL | entero ≥ 1 |
| `status` | TEXT NOT NULL DEFAULT `'libre'` | `libre` \| `ocupada` \| `reservada` |
| `created_at`, `updated_at` | TEXT NOT NULL | ISO |

`orders.table_id` pasa a guardar el `id` de una mesa. No se añade FK (SQLite no permite añadirla con `ALTER`; los pedidos antiguos con `table_id` libre siguen siendo válidos). La validación se hace en el servicio.

### 4.2 Contrato de la API (resumen; el detalle se fija en la tarea T1 en `docs/api/mesas.openapi.yaml`)

Esquema `Table`: `{ id, restaurantId, number, description (string|null), capacity, status, createdAt, updatedAt }`.

| Método y ruta | Roles | Cuerpo / parámetros | Respuestas |
| ------------- | ----- | ------------------- | ---------- |
| `POST /restaurants/{restaurantId}/tables` | admin | `{ number, description?, capacity, status? }` | 201 `Table`; 400 validación; 409 número duplicado |
| `GET /restaurants/{restaurantId}/tables` | admin, manager, camarero, cocinero | `?status=` opcional | 200 `Table[]` ordenadas por `number` |
| `GET /restaurants/{restaurantId}/tables/{id}` | admin, manager, camarero, cocinero | | 200 `Table`; 404 |
| `PUT /restaurants/{restaurantId}/tables/{id}` | admin | `{ number, description?, capacity, status }` | 200 `Table`; 400; 404; 409 |
| `DELETE /restaurants/{restaurantId}/tables/{id}` | admin | | 204; 404; 409 si tiene pedidos asociados |
| `PATCH /restaurants/{restaurantId}/tables/{id}/status` | admin, manager, camarero | `{ status }` | 200 `Table`; 400 estado inválido; 404 |
| `GET /public/restaurants/{restaurantId}/tables/available` | público | `?people=N` (entero ≥ 1, obligatorio) | 200 `Table[]` libres con `capacity ≥ N`, ordenadas por `capacity` y `number`; 400 si `people` no es válido |
| `POST /restaurants/{restaurantId}/tables/{id}/occupy` | cliente | `{ people }` | 200 `Table` (ya `ocupada`); 400; 404; 409 si no está libre o no cabe |

Cambios en pedidos: `POST /orders` valida que `tableId`, si viene, sea una mesa del restaurante del pedido y esté `ocupada` (400 si no). `Order` incorpora `tableNumber` (integer|null), calculado con un `LEFT JOIN`, en `GET /orders/active`, `/orders/mine` y `/orders/{id}`.

Errores (JSON `{ error, message }`): `TableNotFoundError` → 404; `DuplicatedTableNumberError`, `TableNotAvailableError`, `TableHasOrdersError` → 409 (se añade lista `CONFLICT_ERRORS` al `errorHandler`); el resto (`TableNumberInvalidError`, `InvalidCapacityError`, `InvalidTableStatusError`, `InvalidPeopleError`, `TableNotOccupiedError`) → 400.

La ocupación es **atómica**: `UPDATE restaurant_tables SET status='ocupada' WHERE id=? AND restaurant_id=? AND status='libre'`; si no cambia ninguna fila, 409. Así dos clientes no pueden coger la misma mesa.

### 4.3 Reparto en paralelo con cuatro agentes

1. **Primero, el contrato (T1).** El agente de la API lo redacta y los tres de frontend lo revisan y piden cambios antes de seguir. Cuando está cerrado, se congela: quien necesite cambiarlo lo pide al coordinador.
2. **Después, en paralelo y cada uno en su worktree y rama** (`feat/5-gestion-mesas-<app>`): T2–T14 (`api`), T15–T19 (`web-admin`), T20–T24 (`web-empleados`) y T25–T28 (`web-clientes`). Los frontends no dependen del código de la API, solo del contrato.
3. **Cierre (T29–T30)** a cargo del coordinador: integración con la API real y documentación común.

### 4.4 Frontends

- **web-admin:** nueva feature `tables` (`models`, `services`, `store`, `pages/table-list`, `pages/table-form`), ruta `restaurants/:restaurantId/tables` y tarjeta en el panel del restaurante. Misma estructura que `ingredients`.
- **web-empleados:** feature `tables` con store y polling cada 30 s. El tablero se integra en la página `salon` (accesible a `camarero` y `manager`): rejilla de mesas con su estado, cambio de estado y, en las `ocupada`, listado de los pedidos de esa mesa (ítems y estado) obtenido del `OrderStore` filtrando por `tableId`. `cocinero` no cambia estados.
- **web-clientes:** al entrar en un restaurante se muestra un paso previo "¿Cuántas personas sois?" → lista de mesas disponibles → "Continuar" llama a `occupy` y navega a la carta. La mesa elegida se guarda en un `TableSelectionStore` (local) y `OrderService.createOrder` envía su `tableId`. La carta redirige al paso previo si no hay mesa elegida.

## 5. Archivos afectados

| Archivo | Acción | Descripción |
| ------- | ------ | ----------- |
| `docs/api/mesas.openapi.yaml` | crear | Contrato OpenAPI 3.0 de mesas y cambios en pedidos |
| `packages/api/src/models/table.model.ts` | crear | Interfaz `Table`, estados y `normalizeTableStatus()` |
| `packages/api/src/errors/DomainErrors.ts` | modificar | Errores de mesa |
| `packages/api/src/contexts/shared/infrastructure/http/errorHandler.ts` | modificar | `TableNotFoundError` a 404 y lista de 409 |
| `packages/api/src/config/database.ts` | modificar | Migración de `restaurant_tables` |
| `packages/api/src/repositories/table.repository.ts` (+ `.test.ts`) | crear | Interfaz y repositorio SQLite |
| `packages/api/src/repositories/mocks/MockTableRepository.ts` | crear | Doble para tests de servicio |
| `packages/api/src/services/table.service.ts` (+ `.test.ts`) | crear | Validación y lógica de mesas |
| `packages/api/src/controllers/table.controller.ts` | crear | Controlador HTTP |
| `packages/api/src/routes/table.routes.ts`, `table.public.routes.ts` | crear | Rutas privadas y públicas |
| `packages/api/src/app.ts` | modificar | Montaje de las rutas |
| `packages/api/src/services/order.service.ts` (+ test), `models/order.model.ts`, `repositories/order.repository.ts`, `repositories/mocks/MockOrderRepository.ts`, `routes/order.routes.ts` | modificar | Validar `tableId` y exponer `tableNumber` |
| `packages/api/src/scripts/seed.ts` | modificar | Mesas de ejemplo y pedido de seed ligado a una mesa real |
| `packages/web-admin/src/app/features/tables/**` | crear | Modelo, servicio, store, listado y formulario |
| `packages/web-admin/src/app/app.routes.ts`, `features/restaurants/pages/restaurant-dashboard/*` | modificar | Ruta y tarjeta de acceso |
| `packages/web-empleados/src/app/features/tables/**` | crear | Modelo, servicio y store con polling |
| `packages/web-empleados/src/app/features/orders/pages/salon/*`, `orders/models/order.model.ts` | modificar | Tablero de mesas y pedidos por mesa |
| `packages/web-clientes/src/app/core/{models,services,store}/table*.ts` | crear | Modelo, servicio y `TableSelectionStore` |
| `packages/web-clientes/src/app/features/tables/table-picker.component.ts`, `app.routes.ts`, `core/services/order.service.ts`, `features/menu/restaurant-menu.component.ts`, `features/restaurants/restaurant-list.component.ts` | crear / modificar | Paso previo de personas y mesa; `tableId` en el pedido |
| `docs/dominio/modelo-datos.md`, `docs/arquitectura/arquitectura-api.md`, `docs/arquitectura/arquitectura-frontend.md`, `CLAUDE.md` | modificar | Documentación |

## 6. Lista de tareas

Etiquetas: `[API]` agente de back, `[ADMIN]`, `[EMP]` y `[CLI]` agentes de cada web, `[COORD]` coordinador. Las tareas de API siguen TDD (test rojo → código → refactor); las de frontend se verifican con `npm run build -w <paquete>`.

### Contrato (bloquea el resto)

- [ ] **T1** `[API]` Redactar `docs/api/mesas.openapi.yaml` (OpenAPI 3.0) con los esquemas `Table`, `TableStatus`, `Error`, las 8 operaciones de la sección 4.2, los cambios de `Order` (`tableNumber`) y los códigos de error; los agentes `[ADMIN]`, `[EMP]` y `[CLI]` lo revisan y se congela. Se comprueba que el YAML es válido (`npx --yes @redocly/cli lint docs/api/mesas.openapi.yaml`, sin añadirlo como dependencia) y que cada frontend confirma que le cubre todo lo que necesita. (~10 min)

### API (`packages/api`, rama `feat/5-gestion-mesas-api`)

- [ ] **T2** `[API]` Modelo en `models/table.model.ts`: interfaz `Table`, estados y `normalizeTableStatus()`; errores de mesa en `DomainErrors.ts`. Test de `normalizeTableStatus` (válidos, mayúsculas, inválido → `InvalidTableStatusError`). (~8 min)
- [ ] **T3** `[API]` `errorHandler.ts`: añadir `TableNotFoundError` a `NOT_FOUND_ERRORS` y lista `CONFLICT_ERRORS` → 409. Test del handler con un error de cada tipo (404, 409, 400). (~5 min)
- [ ] **T4** `[API]` Migración de `restaurant_tables` en `config/database.ts` con `UNIQUE(restaurant_id, number)`. Test: la tabla existe y rechaza un número duplicado en el mismo restaurante pero admite el mismo número en otro. (~6 min)
- [ ] **T5** `[API]` `repositories/table.repository.ts`: interfaz `TableRepository` y `SqliteTableRepository` con `findById`, `findByRestaurantId(restaurantId, status?)`, `save` y `delete`. Tests con SQLite en memoria, como `ingredient.repository.test.ts`. (~10 min)
- [ ] **T6** `[API]` Repositorio: `findAvailable(restaurantId, people)`, `occupyIfFree(id, restaurantId)` atómico y `hasOrders(id)`. Tests: filtra por capacidad y `libre`, orden por capacidad y número, doble ocupación devuelve `false` la segunda vez, `hasOrders` con y sin pedidos. (~10 min)
- [ ] **T7** `[API]` `repositories/mocks/MockTableRepository.ts` y `services/table.service.ts` con `create`, `update`, `findById`, `findByRestaurantId`. Validaciones: número entero ≥ 1, capacidad entero ≥ 1, número duplicado → `DuplicatedTableNumberError`, estado por defecto `libre`. Tests con el mock. (~10 min)
- [ ] **T8** `[API]` Servicio: `delete` (404 si no existe, `TableHasOrdersError` si tiene pedidos) y `changeStatus`. Tests de ambos casos de error y del camino feliz. (~8 min)
- [ ] **T9** `[API]` Servicio: `listAvailable(restaurantId, people)` (`InvalidPeopleError` si no es entero ≥ 1) y `occupy(restaurantId, id, people)` (404; `TableNotAvailableError` si no está libre o `people > capacity`). Tests de los casos. (~10 min)
- [ ] **T10** `[API]` `controllers/table.controller.ts` (`next(error)`, como `IngredientController`) y `routes/table.routes.ts` con los roles de 4.2, más `routes/table.public.routes.ts` (`GET /available`); montaje en `app.ts`, con la ruta `/available` registrada antes que `/:id`. Se comprueba que `npm run build -w @resttek/api` compila. (~10 min)
- [ ] **T11** `[API]` Pruebas de integración HTTP de mesas (`app.listen(0)` + `fetch`, sin dependencias nuevas) para los casos del plan de verificación (sección 7): CRUD admin, 401/403, 409 de duplicado, 409 al ocupar una mesa ya ocupada, `available` y `PATCH status`. (~10 min)
- [ ] **T12** `[API]` `OrderService.create`: si hay `tableId`, la mesa debe existir en el restaurante del pedido y estar `ocupada` (si no, `TableNotFoundError` / `TableNotOccupiedError`). Inyectar `TableRepository` en `OrderService`, actualizar `order.routes.ts` y los tests existentes. Tests: con mesa válida, con mesa libre, con mesa de otro restaurante y sin `tableId`. (~10 min)
- [ ] **T13** `[API]` `Order.tableNumber`: `LEFT JOIN restaurant_tables` en `findById`, `findByClientId` y `findActiveByRestaurant` y reflejarlo en el modelo y el mock. Test de repositorio: pedido con mesa devuelve su número y sin mesa devuelve `null`. (~8 min)
- [ ] **T14** `[API]` `scripts/seed.ts`: crear mesas de ejemplo en `rest-1` y `rest-2` (`INSERT OR IGNORE`, estados variados) y ligar el pedido de seed a una mesa `ocupada`. Se comprueba ejecutando `npm run seed` dos veces sin errores. (~8 min)

### web-admin (`packages/web-admin`, rama `feat/5-gestion-mesas-web-admin`)

- [x] **T15** `[ADMIN]` `features/tables/models/table.model.ts` y `services/table.service.ts` (CRUD según el contrato, `environment.apiUrl`). Compila (`npm run build -w @resttek/web-admin`). (~8 min)
- [x] **T16** `[ADMIN]` `store/table.store.ts` con el patrón del proyecto (signals privadas + `asReadonly()`, `loading`/`error`, `firstValueFrom`). Compila. (~8 min)
- [x] **T17** `[ADMIN]` `pages/table-list`: tabla con número, descripción, capacidad, estado (con badge) y acciones editar/eliminar con confirmación. Compila. (~10 min)
- [x] **T18** `[ADMIN]` `pages/table-form`: alta y edición con validación (número y capacidad enteros ≥ 1) y mensaje al recibir 409 de número duplicado. Compila. (~10 min)
- [x] **T19** `[ADMIN]` `tables.routes.ts`, ruta `restaurants/:restaurantId/tables` en `app.routes.ts` y tarjeta "Mesas" en el panel del restaurante. Compila y se navega a la pantalla. (~8 min)

### web-empleados (`packages/web-empleados`, rama `feat/5-gestion-mesas-web-empleados`)

- [ ] **T20** `[EMP]` `features/tables/models/table.model.ts` y `services/table.service.ts` (`getTables`, `updateStatus`). Compila (`npm run build -w @resttek/web-empleados`). (~8 min)
- [ ] **T21** `[EMP]` `store/table.store.ts` con polling cada 30 s (`startPolling`/`stopPolling`, como `OrderStore`) y `changeStatus` que actualiza la señal. Compila. (~10 min)
- [ ] **T22** `[EMP]` Añadir `tableNumber` a `order.model.ts` y un computed `ordersByTable` en `OrderStore` que agrupa los pedidos activos por `tableId`. Compila. (~8 min)
- [ ] **T23** `[EMP]` `salon.component`: rejilla de mesas con su estado, selector de estado para `camarero` y `manager` (el `cocinero` solo lo ve) y, en las `ocupada`, los pedidos de la mesa con el estado de cada ítem. Compila. (~15 min)
- [ ] **T24** `[EMP]` Ajustar `shell.component` para que `camarero` y `manager` accedan a Salón con las mesas y que la página arranque el polling de mesas y de pedidos y lo detenga al salir. Compila y se comprueba a mano con distintos roles. (~8 min)

### web-clientes (`packages/web-clientes`, rama `feat/5-gestion-mesas-web-clientes`)

- [ ] **T25** `[CLI]` `core/models/table.model.ts`, `core/services/table.service.ts` (`getAvailable(restaurantId, people)`, `occupy(restaurantId, id, people)`) y `core/store/table-selection.store.ts` (mesa elegida y personas, local). Compila (`npm run build -w @resttek/web-clientes`). (~8 min)
- [ ] **T26** `[CLI]` `features/tables/table-picker.component.ts`: paso 1 número de personas (entero ≥ 1); paso 2 mesas disponibles (número, descripción, capacidad) con selección; botón "Continuar" deshabilitado sin mesa. Estados de carga, vacío ("no hay mesas para tantas personas") y error. Compila. (~15 min)
- [ ] **T27** `[CLI]` "Continuar" llama a `occupy`; si responde 409 se avisa de que la mesa acaba de ocuparse y se recarga la lista; si va bien se guarda la mesa y se navega a la carta. Ruta `restaurants/:id/table` en `app.routes.ts` y enlace desde `restaurant-list`. Compila. (~10 min)
- [ ] **T28** `[CLI]` `restaurant-menu.component` redirige al paso previo si no hay mesa elegida para ese restaurante, y `OrderService.createOrder` envía el `tableId` del store en lugar de `null`; se muestra el número de mesa en la carta. Compila. (~10 min)

### Integración y documentación

- [ ] **T29** `[COORD]` Integración: con la API real arrancada y `npm run seed`, recorrer el flujo completo (admin crea mesa → cliente la ocupa y pide → empleado ve el pedido y la libera) y contrastar las respuestas con `docs/api/mesas.openapi.yaml`. Se anotan las diferencias y se corrigen en la rama que corresponda. (~15 min)
- [ ] **T30** `[COORD]` Documentación en español: `docs/dominio/modelo-datos.md` (tabla `restaurant_tables` y diagrama), `docs/arquitectura/arquitectura-api.md`, `docs/arquitectura/arquitectura-frontend.md` y `CLAUDE.md` (lista de 409 del `errorHandler`, ruta pública de mesas). Se comprueba que describe lo realmente implementado. (~10 min)

## 7. Plan de verificación

Con la API arrancada (`npm run dev:api`) y los datos de seed (`npm run seed`). Variables: `TOKEN_ADMIN`, `TOKEN_CAMARERO`, `TOKEN_CLIENTE` obtenidos con `POST /api/v1/auth/login` (la contraseña es el propio email) y `R=rest-1`.

| Caso | Comando (resumen) | Resultado esperado |
| ---- | ----------------- | ------------------ |
| Crear mesa | `curl -X POST /api/v1/restaurants/$R/tables -H "Authorization: Bearer $TOKEN_ADMIN"` con `{"number":20,"description":"Terraza","capacity":4}` | 201, `status: "libre"` |
| Número duplicado | repetir el anterior | 409 `DuplicatedTableNumberError` |
| Capacidad inválida | `capacity: 0` | 400 `InvalidCapacityError` |
| Sin permisos | crear con `TOKEN_CAMARERO` / sin token | 403 / 401 |
| Listar | `GET /restaurants/$R/tables` con `TOKEN_CAMARERO` | 200, ordenadas por número |
| Disponibles | `GET /public/restaurants/$R/tables/available?people=3` | solo `libre` con capacidad ≥ 3 |
| `people` inválido | `?people=0` o sin parámetro | 400 |
| Ocupar | `POST /restaurants/$R/tables/{id}/occupy` con `TOKEN_CLIENTE` y `{"people":3}` | 200, `status: "ocupada"` |
| Doble ocupación | repetir la anterior | 409 `TableNotAvailableError` |
| Ocupar sin caber | `{"people":99}` | 409 |
| Cambiar estado | `PATCH …/status` con `{"status":"libre"}` y `TOKEN_CAMARERO` | 200 |
| Estado inválido | `{"status":"rota"}` | 400 `InvalidTableStatusError` |
| Pedido con mesa ocupada | `POST /orders` con `tableId` de una mesa `ocupada` | 201 |
| Pedido con mesa libre | `POST /orders` con `tableId` de una mesa `libre` | 400 `TableNotOccupiedError` |
| Número de mesa en pedidos | `GET /orders/active?restaurantId=$R` | cada pedido con `tableNumber` |
| Borrar con pedidos | `DELETE` de la mesa con pedidos | 409 `TableHasOrdersError` |
| Borrar sin pedidos | `DELETE` de una mesa sin pedidos | 204 |

Frontend (a mano, con los tres `ng serve` y proxy):

- **web-admin:** crear, editar y borrar una mesa; ver el error de número duplicado.
- **web-empleados:** con `camarero` y `manager`, ver el tablero, cambiar el estado de una mesa y ver los pedidos de las `ocupada`; con `cocinero`, ver sin poder cambiar.
- **web-clientes:** elegir restaurante → personas → mesa → Continuar; la mesa queda `ocupada` en `web-empleados`; el pedido llega con su número de mesa; entrar directo a la carta sin mesa redirige al paso previo.

Los casos de API se automatizan en T11 y los de servicio y repositorio en T2–T9 y T12–T13. La suite completa se ejecuta con `npm test`.

## 8. Riesgos y dudas abiertas

- **Mesas que se quedan ocupadas.** Si el cliente ocupa una mesa y abandona sin pedir, queda `ocupada` hasta que un empleado la libere. Queda fuera de alcance liberar por inactividad o al cerrar el pedido; conviene decidir si se aborda en otra issue.
- **Pedidos antiguos.** `orders.table_id` no tiene FK y puede contener valores libres (`'5'` en el seed antiguo); no se migran. Con `resttek.db` ya creada, la tabla nueva se crea al arrancar (`CREATE TABLE IF NOT EXISTS`), pero el seed antiguo no se corrige: basta con borrar `resttek.db` y repetir `npm run seed` (relacionado con la issue #4, el seed no borra datos previos).
- **Pertenencia al restaurante.** La API actual no comprueba que el empleado pertenezca al `restaurantId` de la URL (ocurre igual en el resto de recursos). Las rutas nuevas siguen ese criterio; endurecerlo sería una issue aparte.
- **Contrato compartido.** Un cambio en `docs/api/mesas.openapi.yaml` tras T1 afecta a los cuatro agentes; debe pasar por el coordinador.
- **Conflictos al integrar.** Cada rama marca solo sus tareas en este fichero, así que al fusionar pueden aparecer conflictos en las casillas; se resuelven conservando todos los `[x]`.
- **Cambio de firma de `OrderService`.** Recibe ahora `TableRepository`; hay que actualizar tests y rutas existentes (T12).
- **Duda abierta:** ¿Debe poder el cliente ocupar una mesa `reservada`? El plan asume que **no** (solo `libre`). Si no es lo que se quiere, solo cambia T6 y T9.
