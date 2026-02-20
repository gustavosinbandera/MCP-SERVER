# Documentación de despliegues y cambios

Esta carpeta se usa para **documentar qué soluciona cada cambio** antes de sincronizar a la instancia. Todo su contenido se envía a la instancia y se **indexa** para que el Knowledge Hub pueda responder sobre bugs corregidos, mejoras y contexto de cada deploy.

## Uso

1. **Por cada cambio relevante** (fix, feature, refactor), crea un archivo Markdown aquí:
   - Nombre sugerido: `YYYY-MM-DD-descripcion-corta.md` o `BUG-123-fix-login.md`
   - Incluye: qué problema se resolvía, qué se cambió y, si aplica, relación con un bug/ticket

2. **Documentación auto-generada de bugs**: cuando generes documentación automática relacionada con un bug (análisis, decisión, solución), guarda el Markdown en esta carpeta o en una subcarpeta (ej. `deploy-docs/bugs/`). El script de sync la sube e indexa igual.

3. Al ejecutar **sync-to-ec2** (por SSH), se hace:
   - Sincronización del repo (solo cambios vía git)
   - Copia de todos los `.md` de `deploy-docs/` a `INDEX_INBOX` en la instancia
   - El supervisor indexa ese contenido con embeddings para búsqueda semántica

## Plantilla de documento de cambio

```markdown
# [Fecha] Título corto del cambio

## Problema
Qué bug o necesidad se abordaba.

## Solución
Qué se cambió (archivos, lógica, config).

## Contexto para búsqueda
Términos o conceptos que ayudan a encontrar este doc: bug-123, login, warehouse, etc.
```

## Nota

Los archivos de esta carpeta **no se borran** en el repo; en la instancia se copian a INDEX_INBOX y el supervisor, tras indexarlos, los elimina de INDEX_INBOX (comportamiento normal del inbox). El conocimiento queda en Qdrant.

Flujo completo (sync por SSH, changelog, documentación de bugs): ver **docs/SYNC-Y-INDEXACION-DEPLOYS.md**.
