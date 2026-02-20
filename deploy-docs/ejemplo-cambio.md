# Ejemplo: documento de cambio para indexación

## Problema
Falta de documentación sobre qué soluciona cada deploy; el Knowledge Hub no podía responder sobre cambios recientes ni sobre bugs corregidos.

## Solución
- Carpeta `deploy-docs/` para documentar cada cambio.
- Script `scripts/sync-to-ec2.ps1` que sincroniza el repo por SSH (solo cambios) y copia estos documentos a INDEX_INBOX en la instancia para su indexación.

## Contexto para búsqueda
sync, deploy, SSH, indexación, changelog, documentación de cambios, Knowledge Hub.
