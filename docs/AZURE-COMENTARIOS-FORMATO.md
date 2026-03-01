# Azure DevOps comment formatting (Discussion)

Reference so comments sent via `azure_add_work_item_comment` (or the `gateway/scripts/azure/azure-add-comment.cjs` script) render with formatting in the work item Discussion.

---

## Behavior in our instance (Azure DevOps Server)

**Confirmed:** in this instance, the comments area (Discussion) **does not render Markdown**:

- If we send **raw Markdown** via the API (tool or script), it shows up literally (`##`, `**`, etc.) with no formatting.
- If you **paste raw Markdown manually** into the comment box, it also won’t render.
- The **only** way to see formatting is to paste content that is already “rendered”: for example, open the document in **preview mode** (Markdown preview), copy from there, and paste into the ticket. That pastes HTML/rich content, and Azure will display headings, bold, lists, etc.

Therefore, the tool must **not** send raw Markdown. It must convert Markdown to **HTML** and send that HTML in `System.History`, so the outcome matches “copy from preview”.

---

## Code behavior (after the fix)

In `gateway/src/azure/client.ts`, `addWorkItemCommentAsMarkdown`:

- Receives the text in **Markdown** (as before).
- **Always** converts it to HTML via `commentMarkdownToHtmlForHistory()`.
- Sends **only HTML** in `System.History` (no `multilineFieldsFormat`, no raw Markdown).

This makes both the MCP tool and the `gateway/scripts/azure/azure-add-comment.cjs` script behave like “paste from preview”.

---

## Markdown → HTML conversion

`commentMarkdownToHtmlForHistory()` generates:

- `##` / `###` → `<h2>` / `<h3>`
- Code blocks ` ``` ` → `<pre><code>`
- Lists `-` / `*` / `1.` → `<ul>` / `<li>`
- Paragraphs with `**bold**`, `*italic*`, `` `code` `` → `<p>` with `<strong>`, `<em>`, `<code>`

For best-looking HTML output, the input Markdown should use:

- Headings (`##`, `###`) for sections.
- Blank line between sections.
- Lists with `-` or `*` (and `1.` if needed).
- Code blocks with ` ``` `.

---

## Best practices when writing the comment (input Markdown)

1. **Headings** for sections: `## Investigation summary`, `### Root cause`, `### Changes made`.
2. **Blank line** between heading and paragraph/list.
3. **Lists** with `-` or `*`.
4. **Code** in ` ``` ` blocks.

Ejemplo:

```markdown
## Investigation summary (Blue Ivory codebase)

### Root cause
Text goes here...

### Where it manifests
- (1) Actions > Mode of Transportation > Add: ...
- (2) Shipment > Routing Tab > ...

### Proposed solution (implemented)
Override `GetAssociatedDBTreeItem()`...

### Changes made
- ExpExpl\ModeOfTranspUI.h: declared virtual ref<CDBTreeItem>
```

That Markdown is converted to HTML, and that’s what Azure displays with formatting.

---

*Reference document. Updated based on observed instance behavior: raw Markdown is not rendered; formatting only appears when sending HTML (equivalent to copying from preview).*