---
description: Crea un commit siguiendo la especificación Conventional Commits
argument-hint: [descripción o pista opcional del cambio]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*)
---

# Crear commit (Conventional Commits)

Crea un commit con los cambios actuales siguiendo la especificación [Conventional Commits 1.0.0](https://www.conventionalcommits.org/es/v1.0.0/).

## Contexto

- Estado del repositorio: !`git status --short`
- Cambios en staging: !`git diff --cached`
- Cambios sin añadir al staging: !`git diff`
- Rama actual: !`git branch --show-current`
- Últimos commits (para respetar el estilo): !`git log --oneline -10 2>/dev/null || echo "(sin commits todavía)"`

Si el usuario ha indicado una pista sobre el cambio, tenla en cuenta: $ARGUMENTS

## Formato del mensaje

```
<tipo>[ámbito opcional][!]: <descripción>

[cuerpo opcional]

[pie(s) opcional(es)]
```

### Tipos permitidos

- `feat`: nueva funcionalidad (corresponde a MINOR en SemVer).
- `fix`: corrección de un error (corresponde a PATCH en SemVer).
- `docs`: cambios solo en documentación.
- `style`: formato, espacios, punto y coma, etc. Sin cambios de lógica.
- `refactor`: cambio de código que no corrige un error ni añade funcionalidad.
- `perf`: mejora de rendimiento.
- `test`: añadir o corregir tests.
- `build`: cambios en el sistema de build o dependencias (`package.json`, etc.).
- `ci`: cambios en la configuración de integración continua.
- `chore`: tareas de mantenimiento que no tocan `src` ni tests.
- `revert`: revierte un commit anterior.

### Reglas

1. La descripción va en **español**, en **imperativo** y en **minúscula** (p. ej. "añade", "corrige", "separa"), sin punto final.
2. La primera línea no debe superar los **72 caracteres**.
3. El **ámbito** es opcional y va entre paréntesis; usa la capa o módulo afectado (p. ej. `routes`, `controllers`, `services`, `repositories`, `helpers`, `middlewares`, `auth`, `vendehumos`).
4. El **cuerpo** (si hace falta) explica el *qué* y el *porqué*, no el *cómo*. Se separa de la descripción con una línea en blanco.
5. Los **cambios incompatibles** (breaking changes) se marcan con `!` tras el tipo/ámbito y/o con un pie `BREAKING CHANGE: <explicación>`.
6. Los pies siguen el formato `Clave: valor` (p. ej. `Refs: #12`, `Closes: #34`).

### Ejemplos

```
feat(auth): añade endpoint de login con JWT
fix(vendehumos): devuelve 404 cuando el id no existe
refactor(vendehumos): separa el CRUD en controller, service y repository
docs: actualiza CLAUDE.md con la estructura en capas
feat(api)!: cambia el formato de errores de validación

BREAKING CHANGE: los errores de validación ahora se devuelven en `errores` en lugar de `error`.
```

## Pasos a seguir

1. Analiza los cambios del contexto anterior (staging y working tree) para entender qué se ha modificado y por qué.
2. Si no hay nada en staging, añade los archivos relevantes con `git add <archivos>` (nombres concretos; evita `git add .` o `-A` para no incluir archivos no deseados).
3. **Nunca** añadas al commit archivos sensibles ni generados: `.env`, claves, `*.db`, `node_modules/`. Si detectas alguno, avisa al usuario y déjalo fuera.
4. Si los cambios mezclan propósitos distintos (p. ej. una funcionalidad y una corrección no relacionadas), propón dividirlos en varios commits y créalos por separado.
5. Elige el **tipo** y el **ámbito** que mejor describan el cambio y redacta el mensaje según las reglas anteriores.
6. Redacta el mensaje siguiendo las reglas anteriores y muéstraselo al usuario utilizando la tool `AskUserQuestion` para preguntarle si el parece bien el mensaje. Si no le parece bien, genera otro mensaje y le vuelves a preguntar. Cuando lo dé por válido, sigue con el paso 7.
7. Crea el commit con `git commit -m "<mensaje>"` (usa varios `-m` o un heredoc si hay cuerpo o pies).
8. Muestra el resultado con `git log -1 --stat` y resume al usuario lo que se ha commiteado.

## Restricciones

- No hagas `git push` salvo que el usuario lo pida expresamente.
- No modifiques la configuración de git ni uses `--no-verify` ni `--amend` salvo petición explícita.
- Si no hay cambios que commitear, díselo al usuario y no crees un commit vacío.
