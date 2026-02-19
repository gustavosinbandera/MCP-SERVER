# Hyperion: listar shipments y editar el nombre (JavaScript)

Ejemplo basado en los manuales de dev.magaya.com y en el patrón del [extension-example](https://github.com/magaya-dev/extension-example) de Magaya. Usa **dbx** (lectura), **algorithm** (consultas) y **dbw** (escritura).

> **Nota:** El namespace exacto de Shipment puede variar según la versión de Magaya (p. ej. `dbx.Shipment.Shipment.ListByNumber` o similar). Conviene confirmar en la wiki de Hyperion (dev.magaya.com) con `search_docs` buscando "Shipment" o "dbx".

## Requisitos

- `@magaya/hyperion-node` (o `@magaya/hyperion-express-middleware` si usas Express).
- Conexión con `--connection-string` y, para escritura, `clientId` y `apiKey` en las opciones.

## 1. Inicializar Hyperion

```javascript
const hyperion = require('@magaya/hyperion-node')(process.argv, {
  clientId: 'mi-extension',
  apiKey: 'tu-api-key'
});

const { dbx, algorithm, dbw } = hyperion;
```

## 2. Listar shipments

Se usa un **list** del namespace (p. ej. por número o por rango de fechas). El patrón es:

- `dbx.using(list).from(...).to(...)` para definir el rango.
- `algorithm.transform(...).callback(...)` para obtener un array de resultados.
- O `algorithm.find(...).where(...)` para un solo resultado.

Ejemplo: listar shipments y devolver número y nombre (o descripción):

```javascript
async function listShipments(dbx, algorithm) {
  // Ajustar el namespace según la wiki: p. ej. Shipment.Shipment.ListByNumber
  const list = dbx.Shipment.Shipment.ListByNumber;

  const shipments = await algorithm
    .transform(dbx.using(list))
    .callback((shipment) => ({
      guid: shipment.GUID,
      number: shipment.Number,
      name: shipment.Name || shipment.Number // nombre/descripción
    }));

  return shipments;
}
```

Si el list es por rango (como en Invoice.ListByTime), el patrón sería:

```javascript
const list = dbx.Shipment.Shipment.ListByTime; // o el que indique la wiki
const start = new Date('2025-01-01');
const end = new Date();

const shipments = await algorithm
  .transform(dbx.using(list).from(start).to(end))
  .callback((shipment) => ({
    guid: shipment.GUID,
    number: shipment.Number,
    name: shipment.Name
  }));
```

## 3. Editar el nombre de un shipment

Patrón igual que en el extension-example para Warehouse Receipt:

1. Obtener la entidad (por GUID o con `algorithm.find`).
2. `dbx.edit(entidad)` para marcarla como editable.
3. Asignar el nuevo valor (p. ej. `editShipment.Name = 'Nuevo nombre'`).
4. `dbw.save(editShipment)` para persistir.

```javascript
async function setShipmentName(dbx, dbw, algorithm, shipmentGuid, newName) {
  const list = dbx.Shipment.Shipment.ListByGuid;

  const shipment = await algorithm
    .find(dbx.using(list).from(shipmentGuid).to(shipmentGuid))
    .where((s) => s.GUID === shipmentGuid);

  if (!shipment) {
    throw new Error('Shipment no encontrado');
  }

  const edited = dbx.edit(shipment);
  edited.Name = newName; // o la propiedad que use la wiki para "nombre"

  await dbw.save(edited);
  return { success: true, guid: shipmentGuid, name: newName };
}
```

## 4. Ejemplo completo (script o endpoint)

```javascript
const hyperion = require('@magaya/hyperion-node')(process.argv, {
  clientId: 'mi-extension',
  apiKey: 'tu-api-key'
});

const { dbx, algorithm, dbw } = hyperion;

async function main() {
  const list = dbx.Shipment.Shipment.ListByNumber;
  const shipments = await algorithm
    .transform(dbx.using(list))
    .callback((s) => ({ guid: s.GUID, number: s.Number, name: s.Name }));

  console.log('Shipments:', shipments.length);
  shipments.slice(0, 5).forEach((s) => console.log(s.number, s.name));

  if (shipments.length > 0) {
    const guid = shipments[0].guid;
    await setShipmentName(dbx, dbw, algorithm, guid, 'Nombre actualizado desde script');
    console.log('Nombre actualizado para', guid);
  }
}

main().catch((err) => console.error(err));
```

## 5. Con Express (middleware)

Si usas `@magaya/hyperion-express-middleware`, en cada request tienes `request.dbx`, `request.algorithm` y `request.dbw`:

```javascript
app.get('/shipments', async (req, res) => {
  const list = req.dbx.Shipment.Shipment.ListByNumber;
  const data = await req.algorithm
    .transform(req.dbx.using(list))
    .callback((s) => ({ guid: s.GUID, number: s.Number, name: s.Name }));
  res.json(data);
});

app.post('/shipments/:guid/name', express.json(), async (req, res) => {
  await setShipmentName(req.dbx, req.dbw, req.algorithm, req.params.guid, req.body.name);
  res.json({ success: true });
});
```

## Referencias

- **Manuales:** dev.magaya.com (Hyperion) — en este proyecto indexado en el Knowledge Hub; usar `search_docs` con "Shipment", "dbx", "ListBy" o "dbw" para confirmar namespaces y propiedades.
- **Código de ejemplo:** [magaya-dev/extension-example](https://github.com/magaya-dev/extension-example) (api/invoice.js, api/whr.js).
- **Paquetes:** [@magaya/hyperion-node](https://www.npmjs.com/package/@magaya/hyperion-node), [@magaya/hyperion-express-middleware](https://www.npmjs.com/package/@magaya/hyperion-express-middleware).
