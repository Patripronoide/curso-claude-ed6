---
name: implement-plan
description: Implementa un plan de docs/plans/ (generado con plan-feature) creando una rama desde development en un git worktree propio (uno por agente si se implementa por aplicaciones) y aplicando TDD estricto tarea a tarea, con un commit por tarea y marcando cada tarea como hecha en el plan. Úsala cuando el usuario pida implementar, desarrollar o ejecutar un plan. Requiere que se adjunte el plan.
argument-hint: <ruta del plan> [nº de ticket]
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(git switch:*), Bash(git worktree:*), Bash(git -C:*), Bash(git rev-parse:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*), Bash(git diff:*), Bash(npx vitest:*), Bash(npm test:*), Bash(npm install:*), Bash(npm i:*), mcp__slack__slack_list_channels, mcp__slack__slack_post_message
---

# Implementar un plan con TDD estricto

Implementa el plan indicado: $ARGUMENTS

## Paso 0: requisitos de entrada

1. **El plan es obligatorio.** Debe venir adjunto o indicado como ruta (normalmente `docs/plans/<AAAA-MM-DD>-<slug>.md`). Si no se ha aportado, **detente y pídelo**; no elijas uno por tu cuenta ni implementes de memoria.
2. Lee el plan completo y `CLAUDE.md` (arquitectura por capas, convenciones, mensajes en español). Si el plan tiene dudas abiertas (sección 8) que bloqueen una decisión, pregúntalas al usuario antes de empezar.
3. Si el plan no tiene lista de tareas con `- [ ] **T<n>**`, detente e indica que hay que generarlo con `plan-feature`.
4. Determina el **modo de ejecución**:
   - **Modo único** (por defecto): una sola rama y un solo worktree.
   - **Modo multiagente**: solo si el plan afecta a varias aplicaciones (`packages/api`, `web-admin`, `web-empleados`, `web-clientes`, `web-shared`…) **y el usuario ha pedido explícitamente que varios agentes las implementen, uno por aplicación**. Identifica qué tareas del plan corresponden a cada aplicación; si alguna tarea toca varias apps o hay dependencias entre ellas (p. ej. la API antes que los frontends), pregunta cómo repartirlas antes de empezar. Si el usuario no pide varios agentes, usa el modo único aunque el plan afecte a varias apps.
5. Comprueba que el árbol de trabajo está limpio (`git status --short`). Si hay cambios sin commitear que no sean el propio plan, avisa al usuario y pregunta cómo proceder (no los pierdas ni los mezcles con la implementación). Si el plan aparece como no versionado, se incluirá en el primer commit que lo modifique.

## Paso 1: crear la rama y el worktree

**Todos los cambios se hacen en un git worktree**, nunca en el directorio de trabajo principal (que queda intacto en la rama en la que estaba el usuario).

### 1.1 Rama base `development`

1. Comprueba si existe `development` (local o `origin/development`): `git branch --list development` y `git branch -r --list origin/development`.
2. **Si no existe**, créala primero desde la rama principal: `main` si existe; si no, `master`, **sin cambiar de rama el directorio principal**: `git branch development main`. Si no existe ninguna de las dos, detente y avisa.
3. Si existe solo en remoto, crea la local con seguimiento: `git branch --track development origin/development`.
4. **Nunca** trabajes directamente sobre `development`, `main` ni `master`.

### 1.2 Nombre de la rama

Formato obligatorio: `<tipo-cambio>/<num-ticket>-<breve-descripcion>`

- `tipo-cambio`: tipo de Conventional Commits derivado del campo **Tipo** del plan: `feature` → `feat`, `bug` → `fix`; si el plan lo indica de otra forma (`refactor`, `docs`, `chore`, `perf`, `test`…), úsalo. Si el cambio rompe compatibilidad, la rama sigue usando el tipo base (el `!` solo va en los commits).
- `num-ticket`: número del ticket. Sácalo del argumento, del plan o del mensaje del usuario. **Si no aparece en ninguno, pregúntalo**; no lo inventes.
- `breve-descripcion`: kebab-case, sin acentos, 2-5 palabras (normalmente el slug del plan sin la fecha ni el prefijo `fix-`).
- Ejemplo: `feat/123-asociar-vendehumo-usuario`.
- **Modo multiagente**: una rama por aplicación, añadiendo el nombre de la app como sufijo: `<tipo-cambio>/<num-ticket>-<breve-descripcion>-<app>` (p. ej. `feat/123-reservas-api`, `feat/123-reservas-web-clientes`).

### 1.3 Crear el worktree

1. Ubicación: dentro de la carpeta `.claude` del repositorio: `.claude/worktrees/<rama con "/" sustituida por "-">` (p. ej. `.claude/worktrees/feat-123-asociar-vendehumo-usuario`). Antes de crearlo, comprueba con `git check-ignore .claude/worktrees` que la carpeta está ignorada; si no lo está, añade `.claude/worktrees/` a `.git/info/exclude` (local, sin tocar el `.gitignore` versionado) para que los worktrees no aparezcan en el `git status` ni se cuelen en los commits. Usa siempre la ruta absoluta (raíz del repo + `/.claude/worktrees/...`).
2. Créalo con la rama nueva a partir de `development`: `git worktree add -b <rama> <ruta> development`.
3. Si la rama ya existe, no la sobrescribas: pregunta al usuario si continuar en ella (útil para reanudar un plan a medias) y, si dice que sí, usa `git worktree add <ruta> <rama>` (o reutiliza el worktree si ya existe: `git worktree list`). Si la ruta ya existe y no es un worktree de esa rama, no la toques y pregunta.
4. **Modo multiagente**: crea un worktree por cada agente/aplicación (rama y ruta distintas, todas desde `development`). Cada agente trabaja **únicamente en su worktree y solo en los ficheros de su aplicación**; nunca en el de otro ni en el directorio principal.
5. Prepara cada worktree: no incluye `node_modules` ni los ficheros sin versionar. Ejecuta `npm install` en la raíz del worktree y, si el plan no está versionado en `development`, cópialo al mismo path dentro del worktree (se incluirá en el primer commit que lo modifique).
6. A partir de aquí, **todos los comandos (tests, git, ediciones) se ejecutan dentro del worktree** (`git -C <ruta> ...` o `cd <ruta>`), y las rutas de los ficheros que se editen son las del worktree.
7. **Modo multiagente**: lanza un agente por worktree con las instrucciones de esta skill (pasos 2 a 4), indicándole su ruta, su rama, las tareas que le corresponden y que debe marcar en el plan **solo sus propias tareas**. El agente coordinador espera a todos, respeta el orden entre dependencias y ejecuta el Paso 5.

## Paso 2: preparar el entorno de pruebas

El proyecto puede no tener framework de tests (`npm test` es un placeholder). Comprueba `package.json` y las carpetas `test/`/`tests/`.

- El framework de tests es **vitest**. Si no está instalado, añádelo como devDependency (`npm install -D vitest`); es la única dependencia nueva permitida, no añadas otras (p. ej. supertest). Para probar HTTP, importa `src/app.js` (no abre puerto), arráncala con `app.listen(0)` y llama con `fetch`.
- El código de `src/` es CommonJS: los tests pueden ser ESM (`import { describe, it, expect } from 'vitest'`) e importar los módulos CJS (`import app from '../../src/app.js'`) o usar `createRequire`. Si vitest no resuelve `node:sqlite`, configura `test.server.dep****ternal` o `resolve.external` en `vitest.config.js` para tratarlo como módulo nativo.
- Usa `DB_PATH=:memory:` en los tests (y `JWT_SECRET` de prueba) para aislar la BBDD. Como `src/` usa módulos con estado (la conexión a SQLite se crea al importar), usa `vi.resetModules()` o `pool: 'forks'`/aislamiento por archivo para que cada archivo de test parta de una BBDD limpia.
- Ubicación: `test/`, reflejando `src/` (p. ej. `test/services/vendehumo.service.test.js`, `test/api/vendehumo.test.js`). Ejecución: `npx vitest run`. Nombre de archivos: `*.test.js`.
- Este andamiaje (vitest en `devDependencies`, `vitest.config.js` con `DB_PATH=:memory:` y `JWT_SECRET` de prueba en `test.env`, carpeta `test/`, script `test` de `package.json` → `vitest run`, y un test mínimo de `/health` que demuestre que funciona) se hace **en su propio commit previo** (`chore(test): ...`) antes de la primera tarea, y solo si no existe ya. Comprueba que `npx vitest run` arranca sin errores antes de continuar.
- Todo esto se hace en el worktree (en cada uno, en modo multiagente; los frontends no tienen tests, solo se comprueba que compilan con `npm run build -w <paquete>`). Antes de la primera tarea, ejecuta la suite una vez para conocer la línea base. Si ya hay tests rotos, avisa al usuario.

## Paso 3: bucle por tarea (TDD estricto)

Procesa las tareas **en el orden del plan**, una por una y sin saltarte ninguna. Para cada tarea `T<n>`:

### 🔴 Rojo
1. Escribe primero **un test** que exprese el resultado verificable de la tarea (comportamiento, no implementación). No escribas código de producción todavía.
2. Ejecútalo (`npx vitest run <archivo>`) y **comprueba que falla, y que falla por la razón esperada** (aserción incumplida, no un error de sintaxis o de import). Si pasa sin tocar código, el test no sirve o la tarea ya estaba hecha: revísalo antes de seguir.

### 🟢 Verde
3. Escribe el **código mínimo** que haga pasar el test, en el archivo y capa que indica la tarea, respetando la arquitectura (`routes` → `controllers` → `services` → `repositories`) y las convenciones de `CLAUDE.md`.
4. Ejecuta **toda la suite** (`npx vitest run`): todo en verde, incluidos los tests anteriores.

### 🔵 Refactor
5. Limpia duplicación o nombres sin cambiar comportamiento; vuelve a ejecutar la suite en verde.

### Cierre de tarea
6. **Marca la tarea como hecha en el plan**: cambia `- [ ] **T<n>**` por `- [x] **T<n>**` en el archivo del plan (solo esa línea; no reescribas el resto). Si la tarea completa un punto de la sección "Documentación a actualizar", márcalo también.
7. **Haz un commit** con el test, el código y el plan actualizado juntos (usa `git add` de archivos concretos, nunca `git add -A`). Mensaje en **Conventional Commits** en español, estilo del historial (`feat(vendehumos): ...`), con `!` si rompe compatibilidad según el plan, y el pie de atribución que corresponda. Un commit = una tarea; el asunto debe ser coherente con la tarea.
8. Pasa a la siguiente tarea.

### Reglas del TDD estricto
- **Prohibido escribir código de producción sin un test rojo previo** que lo exija.
- Un test nuevo cada vez; no encadenes varios comportamientos en una misma tarea.
- No avances a la siguiente tarea con la suite en rojo ni dejes tests deshabilitados o saltados.
- No modifiques un test para que pase; si el test estaba mal, corrígelo y explica por qué en el mensaje del commit.
- Si el comportamiento de una tarea ya está cubierto por tests de una anterior (el test nace en verde), no fuerces código artificial: documenta que ya está cubierto, marca la tarea como hecha y haz commit solo del plan (y de tests adicionales si aportan).

### Tareas que no son de código
- **Verificación manual con `curl`** (p. ej. "probar con curl..."): conviértela en tests automatizados de integración que cubran los casos del "Plan de pruebas" del plan. El ciclo rojo/verde se aplica igual: si ya pasan, la tarea consiste en añadir esos tests y comprobar que son sensibles (p. ej. rompiendo temporalmente el código y viendo que fallan, sin dejar el cambio).
- **Documentación** (`CLAUDE.md`, `docs/`): no tiene test; actualízala en español, comprueba que describe lo realmente implementado y haz el commit (`docs: ...`).
- **Migraciones o scripts**: pruébalos con un test que parta de una BBDD temporal con el esquema antiguo.

## Paso 4: si algo se tuerce

- Si una tarea es más grande de lo previsto o el plan es incorrecto/incompleto (p. ej. contradice el código real), **detente y consúltalo** con el usuario; no improvises un cambio de diseño. Si se acuerda, anota el ajuste en el plan.
- Si un test no se puede poner en verde tras un intento razonable, no fuerces el commit: informa del bloqueo con la salida del test.
- Nunca uses `--no-verify`, `git push --force`, ni reescribas commits ya hechos sin permiso.

## Paso 5: cierre

1. Cuando todas las tareas estén en `[x]`, ejecuta la suite completa una última vez, y comprueba `git status` (árbol limpio) en cada worktree. En modo multiagente, las ramas marcan el plan por separado: avisa de que al integrarlas puede haber conflictos en el fichero del plan (se resuelven conservando todos los `[x]`).
2. Cambia el campo **Estado** del plan a `completado` y haz un último commit (`docs(plan): marca el plan como completado`).
3. **No hagas push ni abras PR** salvo que el usuario lo pida. **No elimines los worktrees** (`git worktree remove`) sin que el usuario lo pida: pueden contener el trabajo pendiente de revisar; indica sus rutas y cómo borrarlos cuando se integren.
4. **Avisa por Slack** de que la implementación ya se puede revisar:
   1. Obtén el ID del canal `planes-ed8` con `mcp__slack__slack_list_channels` (pagina con `cursor` si no aparece).
   2. Publica con `mcp__slack__slack_post_message` (`channel_id` = ID del canal) un mensaje en español que **empiece y termine con el icono 🧩** e incluya la rama (o ramas, en modo multiagente) y el plan. Ejemplo:
      `🧩 La implementación del plan docs/plans/<plan>.md en la rama <rama> ya está lista para revisar. 🧩`
   3. Si el canal no existe o el envío falla, no interrumpas la skill: indícalo en el resumen.
5. Resume al usuario, en español: rama(s) y worktree(s) creados (con su ruta), tareas completadas (con sus commits), resultado de la suite, si se envió el aviso a Slack, y cualquier desviación o duda pendiente.

