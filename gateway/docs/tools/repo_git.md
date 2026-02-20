# repo_git

**Tool MCP:** Manipula el repositorio Git del workspace (status, add, commit, push, pull).

## Alias

Hacer push, hacer commit, subir cambios, estado del repo, git status, git push, git commit, subir al repo, guardar en git.

## Parámetros

| Parámetro   | Tipo   | Obligatorio | Descripción |
|-------------|--------|-------------|-------------|
| `action`    | string | Sí          | Una de: `status`, `add`, `commit`, `push`, `pull`. |
| `message`   | string | Si action=commit | Mensaje del commit. |
| `directory` | string | No          | Ruta del repo (por defecto: directorio de trabajo del proceso, normalmente la raíz del proyecto). |
| `paths`     | string | No          | Para `add`: rutas a añadir separadas por espacios (por defecto: `.` = todo). |

## Cuándo usarla

Cuando el usuario pida hacer push, commit, subir los cambios a GitHub, ver el estado del repo, añadir archivos al stage o traer cambios del remoto (pull).

## Ejemplos

- **Estado:** `action: "status"` → equivalente a `git status`.
- **Añadir todo:** `action: "add"` (o `paths: "."`).
- **Commit:** `action: "commit", message: "docs: actualizar README"`.
- **Push:** `action: "push"` → sube al remoto.
- **Pull:** `action: "pull"` → trae del remoto.

Opera por defecto en el directorio de trabajo del servidor MCP (típicamente la raíz del proyecto abierta en el IDE).
