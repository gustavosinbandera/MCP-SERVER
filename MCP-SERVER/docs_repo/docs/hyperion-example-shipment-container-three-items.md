# Hyperion: cargar un contenedor en un shipment con tres items (solo JavaScript)

Ejemplo basado en los manuales de dev.magaya.com y en el patrón del [extension-example](https://github.com/magaya-dev/extension-example): **dbx** (lectura/namespaces), **algorithm** (consultas), **dbw** (escritura). Se usa el mismo enfoque que en `whr.js` para añadir attachments: `dbx.edit(entidad)` → crear hijos con `new dbx.DbClass.XXX(...)` → `dbx.insert(colección, hijo)` → `dbw.save(entidad)`.

> **Importante:** Los nombres exactos de clases y colecciones (p. ej. `Container`, `ShipmentItem`, `Containers`, `Items`) pueden variar según la versión. Conviene confirmar en la wiki de Hyperion (dev.magaya.com) con **search_docs**: "Container", "Shipment Items", "dbx.insert" o "DbClass".

---

## 1. Inicializar Hyperion

```javascript
const hyperion = require('@magaya/hyperion-node')(process.argv, {
  clientId: 'mi-extension',
  apiKey: 'tu-api-key'
});

const { dbx, algorithm, dbw } = hyperion;
```

---

## 2. Obtener un shipment existente (por GUID o número)

Para “cargar” un contenedor y items en un shipment, primero necesitas el shipment (existente o recién creado). Ejemplo por GUID:

```javascript
async function getShipmentByGuid(dbx, algorithm, shipmentGuid) {
  const list = dbx.Shipment.Shipment.ListByGuid;
  const shipment = await algorithm
    .find(dbx.using(list).from(shipmentGuid).to(shipmentGuid))
    .where((s) => s.GUID === shipmentGuid);
  return shipment;
}
```

---

## 3. Añadir un contenedor al shipment

Patrón igual que añadir un attachment a un Warehouse Receipt:

- Obtener el shipment y marcarlo editable con `dbx.edit(shipment)`.
- Crear una instancia del contenedor con `new dbx.DbClass.Container(...)` (o el nombre que indique la wiki).
- Insertar el contenedor en la colección del shipment (p. ej. `shipment.Containers`) con `dbx.insert(edited.Containers, container)`.
- Guardar con `dbw.save(edited)`.

```javascript
async function addContainerToShipment(dbx, dbw, algorithm, shipmentGuid, containerNumber) {
  const shipment = await getShipmentByGuid(dbx, algorithm, shipmentGuid);
  if (!shipment) throw new Error('Shipment no encontrado');

  const edited = dbx.edit(shipment);

  // Crear el contenedor. Propiedades según la wiki (p. ej. Number, Size, Type).
  const container = new dbx.DbClass.Container({
    Number: containerNumber || 'CONT-' + Date.now(),
    // Size: '40', Type: 'DC', etc. — confirmar en search_docs "Container"
  });

  dbx.insert(edited.Containers, container);
  await dbw.save(edited);

  return { success: true, shipmentGuid, containerNumber: container.Number };
}
```

---

## 4. Añadir tres items al shipment

Los items del shipment (líneas de carga) suelen estar en una colección del shipment (p. ej. `Items` o `ShipmentItems`). Mismo patrón: `dbx.edit(shipment)` → crear 3 instancias de la clase de item → `dbx.insert(edited.Items, item)` por cada uno → `dbw.save(edited)`.

```javascript
async function addThreeItemsToShipment(dbx, dbw, algorithm, shipmentGuid, itemsData) {
  const shipment = await getShipmentByGuid(dbx, algorithm, shipmentGuid);
  if (!shipment) throw new Error('Shipment no encontrado');

  const edited = dbx.edit(shipment);

  // itemsData = [{ description, quantity, weight? }, ...]; 3 elementos
  const defaultItems = itemsData || [
    { description: 'Item 1', quantity: 1 },
    { description: 'Item 2', quantity: 2 },
    { description: 'Item 3', quantity: 1 }
  ];

  for (const row of defaultItems) {
    const item = new dbx.DbClass.ShipmentItem({
      Description: row.description,
      Quantity: row.quantity,
      // Weight, PackageType, etc. — confirmar en la wiki "Shipment Item"
    });
    dbx.insert(edited.Items, item);
  }

  await dbw.save(edited);
  return { success: true, shipmentGuid, itemsCount: defaultItems.length };
}
```

---

## 5. Cargar un contenedor y tres items en un solo shipment

Encadenar: obtener shipment → editar → añadir 1 contenedor → añadir 3 items → un solo `dbw.save`.

```javascript
async function loadContainerAndThreeItemsInShipment(dbx, dbw, algorithm, shipmentGuid, options) {
  const { containerNumber, items } = options || {};

  const shipment = await getShipmentByGuid(dbx, algorithm, shipmentGuid);
  if (!shipment) throw new Error('Shipment no encontrado');

  const edited = dbx.edit(shipment);

  // 1) Un contenedor
  const container = new dbx.DbClass.Container({
    Number: containerNumber || 'CONT-' + Date.now()
  });
  dbx.insert(edited.Containers, container);

  // 2) Tres items
  const itemRows = items && items.length >= 3
    ? items.slice(0, 3)
    : [
        { description: 'Item 1', quantity: 1 },
        { description: 'Item 2', quantity: 2 },
        { description: 'Item 3', quantity: 1 }
      ];

  for (const row of itemRows) {
    const item = new dbx.DbClass.ShipmentItem({
      Description: row.description,
      Quantity: row.quantity
    });
    dbx.insert(edited.Items, item);
  }

  await dbw.save(edited);

  return {
    success: true,
    shipmentGuid,
    containerNumber: container.Number,
    itemsCount: itemRows.length
  };
}
```

---

## 6. Ejemplo de uso (script)

```javascript
const hyperion = require('@magaya/hyperion-node')(process.argv, {
  clientId: 'mi-extension',
  apiKey: 'tu-api-key'
});

const { dbx, algorithm, dbw } = hyperion;

async function main() {
  // GUID de un shipment existente (p. ej. obtenido antes con listShipments)
  const shipmentGuid = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

  const result = await loadContainerAndThreeItemsInShipment(dbx, dbw, algorithm, shipmentGuid, {
    containerNumber: 'MSKU1234567',
    items: [
      { description: 'Caja paletizada A', quantity: 10 },
      { description: 'Sacos B', quantity: 5 },
      { description: 'Pallet C', quantity: 1 }
    ]
  });

  console.log('Resultado:', result);
  // { success: true, shipmentGuid: '...', containerNumber: 'MSKU1234567', itemsCount: 3 }
}

main().catch((err) => console.error(err));
```

---

## 7. Con Express (middleware)

```javascript
app.post('/shipments/:guid/load-container-and-items', express.json(), async (req, res) => {
  try {
    const { guid } = req.params;
    const { containerNumber, items } = req.body || {};
    const result = await loadContainerAndThreeItemsInShipment(
      req.dbx, req.dbw, req.algorithm, guid, { containerNumber, items }
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
```

---

## Resumen del patrón (manuales / extension-example)

| Paso | Acción |
|------|--------|
| 1 | Obtener el shipment con `algorithm.find(dbx.using(list).from(guid).to(guid)).where(...)` |
| 2 | `edited = dbx.edit(shipment)` |
| 3 | Crear hijo: `new dbx.DbClass.Container(...)` y/o `new dbx.DbClass.ShipmentItem(...)` |
| 4 | Añadir a la colección: `dbx.insert(edited.Containers, container)` y `dbx.insert(edited.Items, item)` |
| 5 | Persistir: `await dbw.save(edited)` |

---

## Confirmar en la wiki (search_docs)

En Cursor, con el MCP del Knowledge Hub y la documentación de dev.magaya.com indexada, usa **search_docs** con consultas como:

- `"Container" Shipment dbx`
- `"Shipment Item" DbClass insert`
- `Shipment Containers Items collection`

Así puedes verificar los nombres exactos de **DbClass** (Container, ShipmentItem, etc.), de las colecciones (Containers, Items) y las propiedades (Number, Description, Quantity, etc.) para tu versión de Magaya.
