# Extension Example – Hyperion API

Extensión Node.js que expone APIs REST para leer Bills y Entities desde Hyperion (Magaya).

## Requisitos

- Node.js (versión según documentación de Magaya)
- Base de datos Magaya en ejecución
- `@magaya/hyperion-express-middleware`

## Ejecución

```bash
node index.js --root /server --port 8000 --service-name extension-demo --connection-string=HOST:PUERTO
```

Si no se pasa `--connection-string`, se usa `w19-dev21-v:6110` por defecto.

El servidor escucha en el puerto **8000**.

## APIs

### GET `/server/test`

Verifica que Hyperion esté disponible.

### GET `/server/bills`

Devuelve la lista de Bills (números) desde `dbx.Accounting.Bill.ListByNumber`.

- **Query:** `?limit=100` (máximo 500)

**Ejemplo de respuesta:**
```json
["0001098", "0001099-DNSAO", "0001100", "100", "1000", ...]
```

### GET `/server/entities`

Devuelve todas las entidades (Client, Vendor, Carrier, Forwarding Agent, etc.) combinando las listas por tipo según `EntityConceptBuilder.cpp`.

- **Query:** `?limit=2000` (máximo 5000)

**Estructura de listas (EntityConceptBuilder):**

| Tipo | Path |
|------|------|
| Todas | `dbx.Entity.All.List` / `ListByName` / `ActiveList` |
| Client | `dbx.Entity.Customer.List` |
| Vendor | `dbx.Entity.Vendor.List` |
| Carrier | `dbx.Entity.Carrier.List` |
| Forwarding Agent | `dbx.Entity.ForwardingAgent.List` |
| Warehouse Provider | `dbx.Entity.WarehouseProvider.List` |
| Employee | `dbx.Entity.Employee.List` |
| Salesperson | `dbx.Entity.Salesperson.List` |
| Contact | `dbx.Entity.Contact.List` |
| Division | `dbx.Common.Division.List` |

**Ejemplo de respuesta:**
```json
[
  { "Name": "Acme Corp", "Number": "10001", "Type": "Client" },
  { "Name": "Vendor XYZ", "Number": "20001", "Type": "Vendor" }
]
```

Se deduplican por GUID.

## DbClassType

El campo `Type` usa la tabla de DbClassType de Hyperion (Entity=23, Client=31, Vendor=36, Division=34, etc.).

## Iteración

Las listas se recorren con `dbx.using(lista).iterate(callback)`. Para listas indexadas (por número o nombre), usar `dbx.using(lista).from(valor).iterate(...)`.

## Depuración

- **No inspeccionar** objetos `bill` o `e` en el depurador (pueden causar crash en `hyperion.node`). Inspeccionar solo variables primitivas o arrays de strings.
- Si hay crash con "Debug Assertion Failed" en `debug_heap.cpp`, ver `docs/HYPERION-CRASH-FIX.md`.
- Usar **Ctrl+F5** (Run without Debugging) o `npm start` si el debugger provoca cierres inesperados.
