# Backend – Estructura

El servidor usa **Express** con rutas por tema. Todas las rutas están bajo el prefijo `/server`.

## Estructura de carpetas

```
backend/
  index.js          # Entry: middleware Hyperion, express.json(), monta rutas en /server, listen
  lib/
    constants.js    # ENTITY_TYPES, ACCTRANSACTION_TYPES, ASSIGN_ENTITY_TYPES, dbClassTypeNames, etc.
    helpers.js      # getEntityList, getAccountingList, iterateEntityList, findInList, iterateAccountingList, etc.
  routes/
    index.js        # Agregador: monta entities, acctransactions, shipments, dev
    entities.js     # Entidades: listar, formulario, check, sizes, (edit/delete placeholder)
    acctransactions.js # Transacciones: listar, formulario, asignar entidad, (ver/delete placeholder)
    shipments.js    # Shipments: placeholders para listar, ver, editar, eliminar, ítems
    dev.js          # Test, bills, rep-bug
  ..
  frontend/         # HTML estático (entities.html, acctransactions.html)
```

## Rutas por tema

| Tema | Archivo | Endpoints |
|------|---------|-----------|
| **Entities** | `routes/entities.js` | `GET /server/entities-form`, `GET /server/entities-check`, `GET /server/entities-sizes`, `GET /server/entities`, `PUT /server/entities/:type/:number` (501), `DELETE /server/entities/:type/:number` (501) |
| **Acctransactions** | `routes/acctransactions.js` | `GET /server/acctransactions-form`, `GET /server/acctransactions`, `GET /server/acctransactions/:type/:number` (501), `POST /server/acctransactions-assign-entity`, `DELETE /server/acctransactions/:type/:number` (501) |
| **Shipments** | `routes/shipments.js` | `GET /server/shipments`, `GET /server/shipments/:id`, `PUT /server/shipments/:id`, `DELETE /server/shipments/:id`, `GET /server/shipments/:id/items` (todos 501) |
| **Dev** | `routes/dev.js` | `GET /server/test`, `GET /server/bills`, `GET /server/rep-bug` |

## Cómo agregar un nuevo tema (ej. shipments real)

1. Implementar la lógica en `routes/shipments.js` (usar `lib/helpers.js` y `lib/constants.js` si aplica).
2. Si hace falta, añadir constantes o helpers en `lib/`.
3. Las rutas ya están montadas en `routes/index.js`.

## Cómo agregar una nueva ruta a un tema

Editar el archivo correspondiente en `routes/` (ej. `entities.js`) y añadir `router.get(...)` o `router.post(...)` con la path relativa a `/server`.
