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
- **Documento completo:** por defecto view_url devuelve hasta 10 MB de contenido (no se recorta como en indexación). Puedes configurar `VIEW_URL_MAX_LENGTH` en gateway/.env (en bytes; máximo 50 MB) si necesitas páginas más largas.
- **Formato de salida:** en MediaWiki solo se convierte el contenido principal (`.mw-parser-output`), sin menús ni pie. Los bloques de código (`<pre>`, `.mw-highlight`) se devuelven envueltos en markdown con \`\`\` (y opcionalmente \`\`\`javascript si se detecta el idioma por clase), para que el cliente muestre código formateado. La IA debe presentar siempre al usuario el contenido completo devuelto por la herramienta.
