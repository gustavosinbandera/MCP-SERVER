# index_site

**Tool MCP:** Indexa todo un sitio desde una URL semilla: recorre enlaces del mismo dominio (BFS) hasta indexar `max_pages` páginas.

## Cómo usarla: qué argumentos pasar

- **`url`** (obligatorio) — URL semilla (http/https). Ejemplo: `"https://wiki.ejemplo.com/"`.
- **`max_pages`** (opcional) — Máximo de páginas a indexar (default 1000, máx. 20000). Ejemplo: `500`.
- **`skip_already_indexed`** (opcional) — Si `true`, no reindexa URLs que ya tengan puntos en Qdrant; solo las salta y usa su HTML para descubrir enlaces y seguir el BFS. Útil para “reanudar” sin reindexar lo ya indexado.

**Ejemplo de invocación (solo nuevas):**
```
url: "https://wiki.ejemplo.com/"
max_pages: 20000
skip_already_indexed: true
```

## Cuándo usarla

Para indexar documentación completa (wiki, dev center, sitio de ayuda) de un dominio.

## Parámetros

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `url` | string | Sí | URL semilla (http/https). |
| `max_pages` | number | No | Máximo de páginas a indexar (default 1000, máx. 20000). |
| `skip_already_indexed` | boolean | No | Si true, salta URLs que ya estén en Qdrant y solo indexa las nuevas. |

## Ejemplo de resultado

```
Indexadas: 250 páginas.
Saltadas (ya en índice): 1200 páginas.
URLs (primeras 20): https://wiki.ejemplo.com/, https://wiki.ejemplo.com/Intro, ...
Errores (primeros 5): https://wiki.ejemplo.com/old: timeout
```
(La línea “Saltadas” solo aparece si usaste `skip_already_indexed: true`.)

## Si se cortó la conexión (apagaste el host, SSH, etc.)

La indexación puede estar corriendo en el **gateway** (contenedor en EC2). Si cerraste la sesión SSH o apagaste el equipo desde el que lanzaste `index_site` (p. ej. desde Cursor MCP), la petición HTTP pudo haberse cerrado y el proceso haberse detenido en el servidor.

**Qué hacer:**

1. **Ver hasta dónde llegó**  
   Los logs del progreso `[SITE]` están en el **servidor donde corre el gateway** (p. ej. EC2), no en tu PC. Conéctate por SSH a la instancia y allí ejecuta:
   ```bash
   ssh -i infra/mcp-server-key.pem ec2-user@52.91.217.181
   cd ~/MCP-SERVER
   docker compose logs --tail=500 gateway
   ```
   Busca líneas `[SITE] (N/20000)` para ver el último contador. Si solo ves `MCP Gateway listening on port 3001`, es que estás ejecutando `docker compose logs` **en tu máquina local** (donde el gateway no hizo la indexación); hay que ejecutarlo dentro de la sesión SSH en la instancia.

2. **Ver cuántos documentos hay ahora**  
   Desde Cursor (con el host encendido) usa la herramienta **`count_docs`** y anota el total. Si antes tenías X y ahora tienes X + ~3600, se habrán indexado aproximadamente las páginas que viste en los logs (p. ej. 3597).

3. **Seguir indexando sin reindexar**  
   Vuelve a lanzar **`index_site`** con la misma URL, `max_pages` (p. ej. 20000) y **`skip_already_indexed: true`**. El crawl empieza desde la URL semilla, pero las URLs que ya estén en Qdrant se **saltan** (no se vuelve a hacer fetch para indexar ni embed); solo se usa el HTML para extraer enlaces y seguir el BFS. Así solo se indexan páginas nuevas y se ahorra tiempo y uso de API. Deja el host y Cursor conectados hasta que termine.

---

## Cómo verificar que el sitio se indexó

1. **Salida de la propia herramienta**  
   Al terminar, `index_site` devuelve algo como:
   - `Indexadas: N páginas.` → número de URLs indexadas en esa ejecución.
   - `URLs (primeras 20): ...` → muestra las primeras URLs para comprobar el dominio.
   - `Errores (primeros 5): ...` → si hubo fallos (timeouts, 403, etc.), verás hasta 5.

2. **Total en el Knowledge Hub**  
   Usa la herramienta MCP **`count_docs`** (sin argumentos). Devuelve el total de documentos (puntos) en la colección. Si antes tenías X y después de indexar Y, el total habrá subido; la colección mezcla archivos y URLs, así que el número no es “solo” ese sitio.

3. **Comprobar que el contenido está buscable**  
   Usa **`search_docs`** con una frase o término que solo aparezca en ese sitio (por ejemplo el nombre del wiki o una página concreta). Si devuelve resultados con URLs de ese dominio, el sitio está indexado y buscable.

## Notas

- Solo se siguen enlaces del **mismo dominio** que la URL semilla.
- Puede tardar mucho si `max_pages` es alto; conviene usarla en momentos de bajo uso o en background.
- Requiere Qdrant y, para búsqueda semántica, OpenAI configurado.
