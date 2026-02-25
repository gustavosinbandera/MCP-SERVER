# Gráfico: solución al bloqueo de search_docs (MCP)

## El problema (antes)

Varias búsquedas en paralelo compartían **una sola promesa** en el transport. Solo la última petición HTTP recibía respuesta; las demás se quedaban colgadas.

```mermaid
sequenceDiagram
  participant Cursor
  participant Gateway
  participant Transport
  participant SDK

  Note over Transport: Una sola currentResolve (promesa)

  Cursor->>Gateway: POST 1 (search_docs A)
  Gateway->>Transport: handleRequest(bodyA)
  Transport->>Transport: currentResolve = resolveA
  Transport->>SDK: onmessage(bodyA)

  Cursor->>Gateway: POST 2 (search_docs B)
  Gateway->>Transport: handleRequest(bodyB)
  Transport->>Transport: currentResolve = resolveB (machaca A)
  Transport->>SDK: onmessage(bodyB)

  Cursor->>Gateway: POST 3 (search_docs C)
  Gateway->>Transport: handleRequest(bodyC)
  Transport->>Transport: currentResolve = resolveC (machaca B)
  Transport->>SDK: onmessage(bodyC)

  SDK->>Transport: send(respuestaA)
  Transport->>Transport: Resuelve resolveC con respuestaA (incorrecto)
  Transport-->>Gateway: respuesta para POST 3
  Gateway-->>Cursor: POST 3 ok (con contenido de A)

  Note over Cursor,Gateway: POST 1 y POST 2 nunca reciben respuesta (colgados)
```

---

## La solución (ahora)

Cada petición se guarda en una **cola** con su `id`. Cuando llega una respuesta, se empareja por `id` o, si no hay id, se asigna la más antigua (FIFO). Así cada POST recibe su respuesta.

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

  SDK->>Transport: send(respuestaB con id=102)
  Transport->>Transport: Busca en cola id=102, saca resolveB
  Transport->>Transport: resolveB(respuestaB)
  Transport-->>Gateway: POST 2 resuelto
  Gateway-->>Cursor: POST 2 ok (respuesta B)

  SDK->>Transport: send(respuestaA con id=101)
  Transport->>Transport: Busca id=101, saca resolveA
  Transport->>Transport: resolveA(respuestaA)
  Transport-->>Gateway: POST 1 resuelto
  Gateway-->>Cursor: POST 1 ok (respuesta A)

  SDK->>Transport: send(respuestaC con id=103)
  Transport->>Transport: Busca id=103, saca resolveC
  Transport->>Transport: resolveC(respuestaC)
  Transport-->>Gateway: POST 3 resuelto
  Gateway-->>Cursor: POST 3 ok (respuesta C)

  Note over Cursor,Gateway: Las tres peticiones reciben su respuesta correcta
```

---

## Resumen visual del transport

```mermaid
flowchart LR
  subgraph entradas [Peticiones HTTP]
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

  subgraph salidas [Respuestas]
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
  R1 -->|"match por id"| Q1
  R2 -->|"match por id"| Q2
  R3 -->|"match por id"| Q3
```

**Regla en `send(message)`:**

1. Si `message.id` existe → buscar en la cola la promesa con ese `requestId` y resolverla.
2. Si no hay `id` o no hay coincidencia → tomar la promesa más antigua (FIFO) y resolverla para no dejar peticiones colgadas.

---

## Logs de diagnóstico (lo que añadimos)

Para ver en producción si el emparejamiento funciona:

| Log | Qué indica |
|-----|------------|
| `mcp POST start` con `requestId` | Inicio de cada petición y su id JSON-RPC. |
| `mcp transport send resolve` con `matchedBy: "id"` | La respuesta se emparejó por id (correcto). |
| `mcp transport send resolve` con `matchedBy: "fifo"` | No había id en la respuesta; se usó la más antigua. |
| `mcp POST ok` / `mcp POST slow` con `requestId` | Fin de la petición; puedes correlacionar con el start. |

Si siempre ves `matchedBy: "fifo"`, el SDK no envía `id` en la respuesta pero las peticiones siguen recibiendo respuesta en orden (FIFO).
