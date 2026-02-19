# search_docs

**Tool MCP:** Búsqueda en la documentación indexada del Knowledge Hub (Qdrant).

## Cómo usarla: qué argumentos pasar

La tool se ejecuta desde el editor (Cursor/VS Code) cuando la IA la invoca, o desde otro cliente MCP. Argumentos:

- **`query`** (obligatorio) — Texto de búsqueda. Ejemplo: `"flujo de facturación"`, `"ADR autenticación"`.
- **`limit`** (opcional) — Número máximo de resultados. Ejemplo: `10` (por defecto), `5`, `20` (máx. 100).

**Ejemplo de invocación:**
```
query: "facturación y pagos"
limit: 5
```

## Cuándo usarla

Cuando necesites información de la documentación del proyecto, ADRs, bugs, flujos o docs corporativos indexados en el hub.

## Parámetros (resumen)

| Parámetro | Tipo   | Obligatorio | Descripción |
|-----------|--------|-------------|-------------|
| `query`   | string | Sí          | Texto de búsqueda. |
| `limit`   | number | No          | Máximo de resultados (default 10, máx. 100). |

## Ejemplos

**Desde el editor (la IA llama a la tool):**
- "Busca en la documentación algo sobre el flujo de facturación."
- "search_docs con query 'ADR autenticación' y limit 5."

**Resultado típico (contenido devuelto al cliente):**
```
[Proyecto] Búsqueda: "facturación" (3 resultado(s))

[1] docs/flujo-facturacion.md
Descripción del flujo de facturación y archivos relacionados...

---

[2] accounting/README.md
Módulo de contabilidad...
```

## Comportamiento

- Si está configurado **OpenAI** (`OPENAI_API_KEY`): búsqueda **semántica** por vectores (embedding de la query).
- Si no hay OpenAI: búsqueda **por palabras** (keyword) en título y contenido.
- Los resultados incluyen `title` y `content` de cada chunk; pueden filtrarse por `project` en futuras versiones vía opciones.

## Errores habituales

- **"Sin resultados"**: la query no coincide con nada indexado; revisa ortografía o amplía términos. Asegúrate de que el supervisor haya indexado inbox y SHARED_DIRS.
