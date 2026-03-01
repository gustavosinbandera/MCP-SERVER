# Diagram: fix for `search_docs` hanging (MCP)

## The problem (before)

Multiple parallel searches shared **a single promise** in the transport. Only the last HTTP request got a response; the others would hang.

```mermaid
sequenceDiagram
  participant Cursor
  participant Gateway
  participant Transport
  participant SDK

  Note over Transport: Single currentResolve (promise)

  Cursor->>Gateway: POST 1 (search_docs A)
  Gateway->>Transport: handleRequest(bodyA)
  Transport->>Transport: currentResolve = resolveA
  Transport->>SDK: onmessage(bodyA)

  Cursor->>Gateway: POST 2 (search_docs B)
  Gateway->>Transport: handleRequest(bodyB)
  Transport->>Transport: currentResolve = resolveB (overwrites A)
  Transport->>SDK: onmessage(bodyB)

  Cursor->>Gateway: POST 3 (search_docs C)
  Gateway->>Transport: handleRequest(bodyC)
  Transport->>Transport: currentResolve = resolveC (overwrites B)
  Transport->>SDK: onmessage(bodyC)

  SDK->>Transport: send(respuestaA)
  Transport->>Transport: Resolves resolveC with responseA (incorrect)
  Transport-->>Gateway: respuesta para POST 3
  Gateway-->>Cursor: POST 3 ok (con contenido de A)

  Note over Cursor,Gateway: POST 1 and POST 2 never receive a response (hung)
```

---

## The solution (now)

Each request is stored in a **queue** with its `id`. When a response arrives, it is matched by `id` or, if there’s no id, assigned to the oldest pending request (FIFO). This way each POST receives its own response.

```mermaid
sequenceDiagram
  participant Cursor
  participant Gateway
  participant Transport
  participant SDK

  Note over Transport: pendingQueue = [ ]

  Cursor->>Gateway: POST 1 (id=101, search_docs A)
  Gateway->>Transport: handleRequest(bodyA)
  Transport->>Transport: pendingQueue.push(id 101, resolveA)
  Transport->>SDK: onmessage(bodyA)

  Cursor->>Gateway: POST 2 (id=102, search_docs B)
  Gateway->>Transport: handleRequest(bodyB)
  Transport->>Transport: pendingQueue.push(id 102, resolveB)
  Transport->>SDK: onmessage(bodyB)

  Cursor->>Gateway: POST 3 (id=103, search_docs C)
  Gateway->>Transport: handleRequest(bodyC)
  Transport->>Transport: pendingQueue.push(id 103, resolveC)
  Transport->>SDK: onmessage(bodyC)

  SDK->>Transport: send(responseB with id=102)
  Transport->>Transport: Find id=102 in queue, pop resolveB
  Transport->>Transport: resolveB(responseB)
  Transport-->>Gateway: POST 2 resolved
  Gateway-->>Cursor: POST 2 ok (response B)

  SDK->>Transport: send(responseA with id=101)
  Transport->>Transport: Find id=101, pop resolveA
  Transport->>Transport: resolveA(responseA)
  Transport-->>Gateway: POST 1 resolved
  Gateway-->>Cursor: POST 1 ok (response A)

  SDK->>Transport: send(responseC with id=103)
  Transport->>Transport: Find id=103, pop resolveC
  Transport->>Transport: resolveC(responseC)
  Transport-->>Gateway: POST 3 resolved
  Gateway-->>Cursor: POST 3 ok (response C)

  Note over Cursor,Gateway: All three requests receive the correct response
```

---

## Transport visual summary

```mermaid
flowchart LR
  subgraph entradas [HTTP requests]
    P1[POST 1 id=101]
    P2[POST 2 id=102]
    P3[POST 3 id=103]
  end

  subgraph cola [Transport: pendingQueue]
    Q1["(id:101, resolve1)"]
    Q2["(id:102, resolve2)"]
    Q3["(id:103, resolve3)"]
  end

  subgraph sdk [SDK MCP]
    T1[Tool A]
    T2[Tool B]
    T3[Tool C]
  end

  subgraph salidas [Responses]
    R1[resp id=101]
    R2[resp id=102]
    R3[resp id=103]
  end

  P1 --> Q1
  P2 --> Q2
  P3 --> Q3
  Q1 --> T1
  Q2 --> T2
  Q3 --> T3
  T1 --> R1
  T2 --> R2
  T3 --> R3
  R1 -->|"match by id"| Q1
  R2 -->|"match by id"| Q2
  R3 -->|"match by id"| Q3
```

**Rule in `send(message)`:**

1. If `message.id` exists → find the queued promise with that `requestId` and resolve it.
2. If there’s no `id` or no match → take the oldest promise (FIFO) and resolve it to avoid leaving requests hanging.

---

## Step 4: Per-session queue in the gateway (serialization)

To ensure responses don’t cross even if the SDK doesn’t include an `id`, the gateway **serializes** requests per session: only one request at a time per `(userId, sessionId)`.

- Each POST /mcp goes into a per-session queue (`gateway/src/mcp/session-queue.ts`).
- `handleRequest` is called only when it’s that request’s turn; when it finishes, the next one is processed.
- Effect: tools/calls (multiple `search_docs`) run in order; each SDK `send()` corresponds to the in-flight request, so the transport assigns responses correctly (FIFO with only one pending at a time).

---

## Diagnostic logs (what we added)

To verify in production that matching works:

| Log | What it indicates |
|-----|------------|
| `mcp POST start` with `requestId` | Start of each request and its JSON-RPC id. |
| `mcp transport send resolve` with `matchedBy: "id"` | Response matched by id (correct). |
| `mcp transport send resolve` with `matchedBy: "fifo"` | No id in the response; the oldest pending request was used. |
| `mcp POST ok` / `mcp POST slow` with `requestId` | End of the request; you can correlate with the start. |

If you always see `matchedBy: "fifo"`, the SDK isn’t including `id` in responses, but requests still receive responses in order (FIFO).
