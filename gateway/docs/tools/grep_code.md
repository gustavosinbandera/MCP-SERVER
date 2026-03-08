# grep_code

**MCP tool:** Search with ripgrep (rg) in `blueivory` or `classic` for exact or regex matches. Complements `search_docs` (Qdrant semantic search) with fast textual search.

## When to use it

- Find exact strings or regex patterns in the codebase (blueivory or classic).
- Get file, line, column and optional context lines for each match.
- Integrate with n8n or other clients that consume the JSON envelope.

## Arguments

| Argument        | Type    | Required | Default    | Description |
|----------------|---------|----------|------------|-------------|
| `pattern`      | string  | Yes      | —          | Regex or literal search pattern. Must not be empty. |
| `path`         | string  | No       | `blueivory`| Only `blueivory` or `classic` (and subpaths). No absolute paths or `..`. |
| `include`      | string  | No       | —          | Glob, e.g. `*.{cpp,h,hpp,c,cc,cxx}`. |
| `ignore_case`  | boolean | No       | false      | Case-insensitive search. |
| `max_matches`  | number  | No       | 200        | Clamped to [1, 2000]. |
| `context_lines`| number  | No       | 0          | Lines before/after each match. Clamped to [0, 3]. |

## Validation

- `pattern`: non-empty.
- `path`: must not be absolute (`/`, `C:\`, `~`), must not contain `..`, must start with `blueivory` or `classic`.
- Invalid path returns `VALIDATION_ERROR` in the error envelope.

## Output (success envelope)

```json
{
  "summary_text": "123 matches in 17 files under blueivory",
  "data": {
    "total_matches": 123,
    "total_files": 17,
    "matches": [
      {
        "file": "blueivory/ExpExpl/ItemPaymentUI.cpp",
        "line": 542,
        "column": 12,
        "text": "obj->SetAmountPaidInPaymentCurrency(m_RecordUiPtr, f);",
        "context_before": [],
        "context_after": []
      }
    ]
  },
  "meta": {
    "tool_version": "v1",
    "elapsed_ms": 320,
    "truncated": false,
    "warnings": []
  }
}
```

When `context_lines` > 0, `context_before` and `context_after` are filled from the file contents.

## Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR|DEPENDENCY_MISSING|TIMEOUT|EXEC_ERROR",
    "message": "...",
    "details": {}
  },
  "meta": { "retryable": false, "elapsed_ms": 0 }
}
```

- **VALIDATION_ERROR:** invalid `pattern` or `path`.
- **DEPENDENCY_MISSING:** ripgrep (`rg`) is not installed.
- **TIMEOUT:** run exceeded timeout (default 10s; configurable via `GREP_CODE_TIMEOUT_MS`).
- **EXEC_ERROR:** rg failed (exit code 2 or other runtime error).

## Examples

- `pattern: "AmountPaidInPaymentCurrency", path: "blueivory"` — find that symbol in blueivory.
- `pattern: "Trial balance", path: "classic", ignore_case: true` — case-insensitive in classic.
- `path: "../etc"` — returns `VALIDATION_ERROR`.

## Dependencies

- **ripgrep (`rg`)** must be installed (e.g. in Docker: `apt-get install -y ripgrep`). If missing, the tool returns `DEPENDENCY_MISSING`.
