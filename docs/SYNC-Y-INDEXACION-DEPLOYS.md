# Sincronización por SSH e indexación de cambios

Este documento describe cómo sincronizar el repo MCP a la instancia por SSH **solo con cambios nuevos** y cómo la documentación de cada cambio (y la futura documentación auto-generada de bugs) se usa para **indexación** y ampliar el conocimiento del Hub.

## Flujo resumido

1. **Local:** Haces cambios, commits y (opcional) documentas en `deploy-docs/` qué soluciona cada cambio.
2. **Sync:** Ejecutas `.\scripts\sync-to-ec2.ps1` (y opcionalmente `-Changelog`).
3. **En la instancia:** El script hace `git pull` (solo recibe los cambios vía git) y copia los `.md` de `deploy-docs/` a `INDEX_INBOX`.
4. **Indexación:** El supervisor indexa todo lo que llega a INDEX_INBOX con embeddings; ese contenido pasa a Qdrant y queda disponible para búsqueda semántica.

Así, el Hub puede responder preguntas sobre “qué bug se arregló”, “qué soluciona el último deploy” o “documentación del bug X”.

---

## 1. Sincronización por SSH (solo cambios)

- **Método:** Git. En local: `git push origin master`. En la instancia: `git pull origin master` (vía el script).
- Solo se transfieren **objetos nuevos** que git envía al remoto; no se copia de nuevo todo el repo por SCP/rsync.
- **Requisitos:** En la instancia el repo debe estar clonado (`git clone ...`); la primera vez puede ser manual o con un script de bootstrap. Luego, cada sync es solo `git pull`.

Configuración del script:

- Copia `scripts/sync-config.example.json` a `scripts/sync-config.json` (este archivo no se sube al repo).
- Ajusta `sshKeyPath`, `ec2Host`, `remoteRepoPath`, `remoteIndexInboxPath` y `branch` si aplica.

Comandos útiles:

```powershell
.\scripts\sync-to-ec2.ps1              # push + pull + subir deploy-docs + guardar last-sync
.\scripts\sync-to-ec2.ps1 -Changelog   # además genera y sube changelog (git log) para indexar
.\scripts\sync-to-ec2.ps1 -SkipPush    # no push; solo pull en remoto y subir docs
.\scripts\sync-to-ec2.ps1 -SkipDeployDocs   # solo sync del repo, no subir .md
```

---

## 2. Documentar qué soluciona cada cambio

Para que esa información **sirva para la indexación**:

- Crea archivos Markdown en **`deploy-docs/`** (o en subcarpetas, p. ej. `deploy-docs/bugs/`).
- Nombres sugeridos: `YYYY-MM-DD-descripcion-corta.md` o `BUG-123-fix-login.md`.
- Incluye al menos:
  - **Problema:** qué bug o necesidad se abordaba.
  - **Solución:** qué se cambió (archivos, lógica, config).
  - **Contexto para búsqueda:** términos que ayuden a encontrar el doc (bug-123, login, warehouse, etc.).

El script de sync sube todos los `.md` de `deploy-docs/` (recursivo, salvo `README.md`) a `INDEX_INBOX` en la instancia. El supervisor los indexa en el siguiente ciclo; después los borra de INDEX_INBOX (comportamiento normal del inbox). El contenido queda en Qdrant para búsqueda semántica.

---

## 3. Documentación auto-generada relacionada con bugs

Cuando tengas **documentación auto-generada** relacionada con el bug que se está arreglando (análisis, decisión, solución):

- Guarda esos Markdown en la misma carpeta **`deploy-docs/`** o en una subcarpeta (p. ej. `deploy-docs/bugs/`).
- El mismo script **sync-to-ec2** los copiará a INDEX_INBOX y se indexarán igual que el resto.
- No hace falta cambiar el script: cualquier `.md` bajo `deploy-docs/` (excepto `README.md`) se sube e indexa.

Con eso se amplía el conocimiento del Hub con el contexto de cada bug y su solución.

---

## 4. Changelog automático (opcional)

Con **`-Changelog`** el script:

- Lee en la instancia el último commit de sync (`.last-sync-commit`).
- Genera un Markdown con `git log` desde ese commit hasta `HEAD` (mensajes de commit = “qué soluciona cada cambio” a nivel de commit).
- Sube ese archivo a INDEX_INBOX (p. ej. `sync-changelog-YYYY-MM-DD-HHmm.md`) para que se indexe.

Úsalo cuando quieras que el Hub pueda responder también a partir de los mensajes de commit del último deploy.

---

## 5. Resumen de archivos y rutas

| Elemento | Ubicación / Acción |
|----------|---------------------|
| Config del sync (no subir al repo) | `scripts/sync-config.json` |
| Documentación de cambios y bugs | `deploy-docs/*.md` (y subcarpetas) |
| Inbox en la instancia | `~/MCP-SERVER/INDEX_INBOX` |
| Último commit sincronizado | `~/MCP-SERVER/.last-sync-commit` (en instancia) |

Con este flujo, la sincronización del repo MCP por SSH envía solo cambios, documentas qué soluciona cada cambio (y la doc de bugs) y esa información se indexa para el Knowledge Hub.
