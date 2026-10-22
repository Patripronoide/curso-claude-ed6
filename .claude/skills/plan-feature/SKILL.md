---
name: plan-feature
description: Planifica cómo implementar una nueva funcionalidad o corregir un bug y genera un plan detallado en docs/plans/ con tareas de 5-10 minutos. Úsala cuando el usuario pida planificar, diseñar o preparar el trabajo antes de programarlo.
argument-hint: <descripción de la funcionalidad o del bug>
---

# Planificar funcionalidad o corrección de bug

Genera un plan de implementación detallado en un archivo Markdown dentro de `docs/plans/`. **Esta skill solo planifica: no modifiques código del proyecto.**

Descripción recibida: $ARGUMENTS

## Pasos a seguir

1. **Entiende la petición.** Si `$ARGUMENTS` está vacío o es ambiguo, o falta una decisión que cambia el plan, pregunta al usuario con `AskUserQuestion` antes de seguir. No preguntes lo que puedas deducir del código.
2. **Clasifica** el trabajo como `feature` (nueva funcionalidad) o `bugfix` (corrección de un error).
3. **Explora el código** necesario para planificar con precisión:
   - Lee `CLAUDE.md` y respeta la arquitectura en capas (`routes` → `controllers` → `services` → `repositories` → SQLite).
   - Localiza los archivos que habrá que crear o modificar y las funciones concretas afectadas.
   - Si es un bug, identifica la causa raíz (archivo y línea) antes de proponer la solución.
   - Si afecta a peticiones GET de listado, consulta `docs/api/api-pagination.md`.
4. **Lee la plantilla** [assets/plantilla-plan.md](assets/plantilla-plan.md) y rellénala respetando exactamente sus secciones y su orden. Elimina los comentarios de instrucciones (`<!-- ... -->`) y no omitas ninguna sección; si alguna no aplica, escribe "No aplica".
5. **Redacta la lista de tareas** con estas reglas:
   - Cada tarea debe poder hacerse en **5-10 minutos**. Si una es mayor, divídela; si es trivial (< 5 min), únela con otra relacionada.
   - Cada tarea es concreta y verificable: indica el archivo, qué se hace y cómo se comprueba que está terminada.
   - Ordénalas según las dependencias y las capas (de abajo arriba: modelo/repository → service → controller → route → documentación).
   - Usa casillas `- [ ]`, numeradas y con la duración estimada (p. ej. `~5 min`).
   - Incluye tareas de verificación manual (el proyecto no tiene tests), como arrancar la API y probar con `curl`, y de actualización de documentación si procede (p. ej. `CLAUDE.md`).
6. **Guarda el plan** en `docs/plans/<AAAA-MM-DD>-<tipo>-<slug>.md`:
   - `<tipo>` es `feature` o `bugfix`.
   - `<slug>` es un resumen en kebab-case, sin tildes ni mayúsculas (p. ej. `2026-10-15-feature-votar-vendehumo.md`).
   - Usa la fecha actual. Si el archivo ya existe, no lo sobrescribas: pregunta al usuario.
7. **Resume al usuario** en español: la ruta del plan, el enfoque elegido, el número de tareas y el tiempo total estimado, y las dudas abiertas si las hay. No empieces a implementar salvo que lo pida.
8. **Avisa por Slack** de que el plan ya se puede revisar (ver "Notificación por Slack").

## Notificación por Slack

Al terminar la planificación, envía un mensaje al canal `planes-ed8` con el MCP de Slack:

1. Obtén el ID del canal con `mcp__slack__slack_list_channels` (busca el de nombre `planes-ed8`; pagina con `cursor` si no aparece).
2. Publícalo con `mcp__slack__slack_post_message` (`channel_id` = ID del canal). El mensaje va en español, **empieza y termina con el icono 🧩** e incluye la ruta del plan. Ejemplo:
   `🧩 El plan docs/plans/<AAAA-MM-DD>-<tipo>-<slug>.md ya está listo para revisar. 🧩`
3. Si el canal no existe o el envío falla, no interrumpas la skill: indícalo al usuario en el resumen.

## Restricciones

- Todo el plan va en **español**.
- No modifiques archivos fuera de `docs/plans/`.
- No inventes archivos ni funciones: todo lo que cites debe existir en el repositorio o aparecer como "nuevo".
- Respeta las convenciones del proyecto: SQL solo en `repositories/` con sentencias preparadas, errores con `ErrorServicio`, sin dependencias nuevas para la BD.
