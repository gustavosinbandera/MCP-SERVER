# view_url

**Tool MCP:** Muestra el contenido de una URL en formato **Markdown** (título + texto extraído del HTML) para verlo en la consola o en un cliente que renderice Markdown. No indexa la página; solo obtiene el contenido y lo devuelve.

## Cómo usarla: qué argumentos pasar

- **`url`** (obligatorio) — URL de la página. Debe empezar por `http://` o `https://`.

**Ejemplo de invocación:**
```
url: "https://ejemplo.com/guia"
```

## Cuándo usarla

- Ver el contenido de una URL en la consola.
- Inspeccionar una página sin indexarla.
- Ver contenido remoto (ver url, ver página, inspeccionar url).

## Parámetros (resumen)

| Parámetro | Tipo   | Obligatorio | Descripción |
|-----------|--------|-------------|-------------|
| `url`     | string | Sí          | URL de la página (http/https). |

## Resultado que obtienes (Markdown)

La salida es **Markdown** para que se vea bien en consola o en el chat:

- **Título** de la página (extraído del `<title>`).
- **URL** como referencia.
- **Contenido** en texto plano (HTML convertido a texto, sin etiquetas).

Ejemplo:

```markdown
## Guía de uso

**URL:** https://ejemplo.com/guia

---

Texto de la página convertido a texto plano...
```

## Notas

- Usa la misma lógica que la indexación (html-to-text) para convertir HTML a texto.
- No guarda nada en Qdrant; solo devuelve el contenido para visualización.
- Se respetan sesión y autenticación si están configurados.
