# Formato de comentarios en Azure DevOps (Discussion)

Referencia para que los comentarios enviados con `azure_add_work_item_comment` (o el script `azure-add-comment.cjs`) se vean con formato en la Discussion del work item.

---

## Comportamiento en nuestra instancia (Azure DevOps Server)

**Confirmado:** en esta instancia, la zona de comentarios (Discussion) **no interpreta Markdown**:

- Si enviamos **Markdown crudo** por la API (tool o script), se muestra tal cual (`##`, `**`, etc.) sin formato.
- Si **pegas Markdown crudo a mano** en la caja de comentarios, tampoco se renderiza.
- La **única** forma de ver formato es pegar contenido que ya esté “renderizado”: por ejemplo, abrir el documento en **modo preview** (Markdown preview), copiar desde ahí y pegar en el ticket. Eso pega HTML/contenido rico, y Azure sí lo muestra con títulos, negritas, listas, etc.

Por tanto, la herramienta **no** debe enviar Markdown crudo. Debe convertir el Markdown a **HTML** y enviar ese HTML en `System.History`, de modo que el resultado sea equivalente a “copiar desde el preview”.

---

## Comportamiento del código (tras el ajuste)

En `gateway/src/azure-devops-client.ts`, `addWorkItemCommentAsMarkdown`:

- Recibe el texto en **Markdown** (como hasta ahora).
- **Siempre** lo convierte a HTML con `commentMarkdownToHtmlForHistory()`.
- Envía **solo HTML** en `System.History` (sin intentar `multilineFieldsFormat` ni Markdown crudo).

Así, tanto la tool MCP como el script `azure-add-comment.cjs` se comportan como “pegar desde preview”.

---

## Conversión Markdown → HTML

`commentMarkdownToHtmlForHistory()` genera:

- `##` / `###` → `<h2>` / `<h3>`
- Bloques ` ``` ` → `<pre><code>`
- Listas `-` / `*` / `1.` → `<ul>` / `<li>`
- Párrafos con `**bold**`, `*italic*`, `` `code` `` → `<p>` con `<strong>`, `<em>`, `<code>`

Para que el HTML se vea bien, conviene que el Markdown de entrada use:

- Encabezados (`##`, `###`) para secciones.
- Línea en blanco entre secciones.
- Listas con `-` o `*` (y `1.` si se usa).
- Código en bloques con ` ``` `.

---

## Buenas prácticas al redactar el comentario (Markdown de entrada)

1. **Encabezados** para secciones: `## Investigation summary`, `### Root cause`, `### Changes made`.
2. **Línea en blanco** entre título y párrafo o lista.
3. **Listas** con `-` o `*`.
4. **Código** en bloques ` ``` `.

Ejemplo:

```markdown
## Investigation summary (Blue Ivory codebase)

### Root cause
El texto aquí...

### Where it manifests
- (1) Actions > Mode of Transportation > Add: ...
- (2) Shipment > Routing Tab > ...

### Proposed solution (implemented)
Override `GetAssociatedDBTreeItem()`...

### Changes made
- ExpExpl\ModeOfTranspUI.h: declared virtual ref<CDBTreeItem>
```

Ese Markdown se convierte a HTML y es lo que Azure muestra con formato.

---

*Documento de referencia. Actualizado según el comportamiento real de la instancia: Markdown crudo no se interpreta; solo se ve formato al enviar HTML (equivalente a copiar desde el preview).*