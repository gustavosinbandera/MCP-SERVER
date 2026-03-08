# grep_symbols

**MCP tool:** Extract C/C++ structural symbols (functions, classes, structs, namespaces) in `blueivory` or `classic` using ripgrep with predefined regex patterns. Useful for flow discovery and entrypoints.

## When to use it

- List functions, classes, structs, or namespaces in the codebase.
- Filter symbols by name (e.g. "Invoice") for discovery.
- Get file, line and a short signature per symbol. Does not replace a full parser; optimized for speed.

## Arguments

| Argument       | Type     | Required | Default                      | Description |
|----------------|----------|----------|------------------------------|-------------|
| `query`        | string   | No       | —                             | Filter symbols by name (partial match). |
| `path`         | string   | No       | `blueivory`                   | Only `blueivory` or `classic` (and subpaths). Same rules as grep_code. |
| `symbol_types` | string[] | No       | all four                      | `function`, `class`, `struct`, `namespace`. Only these values allowed. |
| `max_results`  | number   | No       | 300                           | Clamped to [1, 3000]. |
| `include`      | string   | No       | `*.{h,hpp,hxx,c,cc,cxx,cpp,c++}` | Glob for file types. |

## Validation

- `path`: same as grep_code (no absolute, no `..`, must start with `blueivory` or `classic`). Invalid path returns `VALIDATION_ERROR`.
- `symbol_types`: only `function`, `class`, `struct`, `namespace` are allowed.

## Extraction rules (heuristic)

- **namespace:** `^\s*namespace\s+([A-Za-z_]\w*)`
- **class:** `^\s*class\s+([A-Za-z_]\w*)`
- **struct:** `^\s*struct\s+([A-Za-z_]\w*)`
- **function:** C/C++-style signature with `( )` and `{`; excludes control flow (if/for/while/switch/catch).

## Output (success envelope)

```json
{
  "summary_text": "Found 84 symbols in 22 files (function:60, class:14, struct:6, namespace:4)",
  "data": {
    "counts": {
      "function": 60,
      "class": 14,
      "struct": 6,
      "namespace": 4
    },
    "symbols": [
      {
        "kind": "function",
        "name": "SetAmountPaidInPaymentCurrency",
        "file": "blueivory/ExpExpl/ItemPaymentUI.cpp",
        "line": 551,
        "signature": "void SetAmountPaidInPaymentCurrency(...)"
      }
    ]
  },
  "meta": {
    "tool_version": "v1",
    "elapsed_ms": 410,
    "truncated": false,
    "warnings": []
  }
}
```

## Error envelope

Same structure as grep_code: `error.code` can be `VALIDATION_ERROR`, `DEPENDENCY_MISSING`, `TIMEOUT`, or `EXEC_ERROR`.

## Examples

- `path: "blueivory", symbol_types: ["function", "class"]` — list functions and classes in blueivory.
- `query: "Invoice", path: "blueivory"` — symbols whose name contains "Invoice".
- `path: "C:\\temp"` — returns `VALIDATION_ERROR`.

## Dependencies

- **ripgrep (`rg`)** must be installed (same as grep_code). If missing, returns `DEPENDENCY_MISSING`.
