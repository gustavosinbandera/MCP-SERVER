# count_docs

**Tool MCP:** Devuelve cuántos documentos (puntos) hay indexados en la colección de Qdrant (`mcp_docs`).

## Cómo usarla: qué argumentos pasar

Esta tool **no tiene argumentos**. Solo se invoca y devuelve el total de puntos en la colección.

## Cuándo usarla

Cuando necesites saber el total de documentos en el Knowledge Hub (p. ej. para diagnósticos o para informar al usuario).

## Parámetros

Ninguno.

## Ejemplo de resultado

```
Proyecto: BlueIvory Beta
Colección: mcp_docs
Documentos indexados: 142
```

(Si no hay `KNOWLEDGE_HUB_NAME` configurado, no se muestra la línea "Proyecto".)

## Nota

Cada "documento" en Qdrant puede ser un chunk; un archivo largo indexado genera varios puntos. El número es el total de puntos en la colección.
