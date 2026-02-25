# Hyperion: seleccionar un shipment y cargarlo con un Warehouse Receipt (Node.js)

Información detallada con códigos de ejemplo a partir de la **wiki Hyperion** (Qdrant) y del código en **blueivory** (ShipmentReceptionDlg, test2.js). Uso de **@magaya/hyperion-node** con `dbx`, `algorithm` y `dbw`.

---

## 1. Namespaces y listas (wiki + blueivory)

| Entidad              | Namespace (dbx)                              | Listas típicas                          |
|----------------------|----------------------------------------------|-----------------------------------------|
| **Shipment**         | `dbx.Shipping.Shipment` o `dbx.Shipment.Shipment` | ListByGuid, ListByNumber, ListByTime    |
| **Warehouse Receipt**| `dbx.Warehousing.WarehouseReceipt`           | ListByGuid, ListByNumber, ListByTime    |

En blueivory (Node binding clásico) se usa por ejemplo:
- `dbx.Warehousing.WarehouseReceipt.ListByNumber`, `ListByTime`
- `dbx.using(list).from(x).to(y).iterate(callback)`

Con **@magaya/hyperion-node** (algorithm):
- `algorithm.find(dbx.using(list).from(guid)).where(predicate)`
- `algorithm.transform(dbx.using(list)).callback(map)`

---

## 2. Seleccionar un shipment (por GUID o por número)

### 2.1 Por GUID (wiki “Getting a Shipment by its GUID”)

En la wiki el patrón es:

```javascript
var shipments = dbx.Shipping.Shipment.ListByGuid;  // o dbx.Shipment.Shipment.ListByGuid
dbx.using(shipments).from(guid).iterate(function(shipment){
    if(shipment.GUID == guid){
        result = shipment;
        return false;  // detener iteración
    }
});
```

Con **hyperion-node** (algorithm):

```javascript
async function getShipmentByGuid(dbx, algorithm, shipmentGuid) {
  const list = dbx.Shipment.Shipment.ListByGuid;  // o dbx.Shipping.Shipment.ListByGuid según versión
  const shipment = await algorithm
    .find(dbx.using(list).from(shipmentGuid).to(shipmentGuid))
    .where((s) => s.GUID === shipmentGuid);
  return shipment;
}
```

### 2.2 Por número (análogo a getWarehouseReceipt en blueivory)

En blueivory (`test2.js`) el WHR se obtiene por número con `ListByNumber` e `iterate`. Para Shipment el mismo patrón:

```javascript
async function getShipmentByNumber(dbx, algorithm, number) {
  const list = dbx.Shipment.Shipment.ListByNumber;
  let result = null;
  await algorithm
    .find(dbx.using(list).from(number))
    .where((s) => s.Number === number || s.Waybill === number);
  // Si algorithm.find no devuelve el primero que cumple, usar transform y tomar el primero
  const list2 = dbx.Shipment.Shipment.ListByNumber;
  const arr = await algorithm
    .transform(dbx.using(list2).from(number))
    .callback((s) => ({ shipment: s, match: s.Number === number || (s.Waybill && s.Waybill === number) }));
  const found = arr.find((x) => x.match);
  return found ? found.shipment : null;
}
```

Versión simple si `find` devuelve un solo resultado:

```javascript
async function getShipmentByNumber(dbx, algorithm, number) {
  const list = dbx.Shipment.Shipment.ListByNumber;
  const shipment = await algorithm
    .find(dbx.using(list).from(number))
    .where((s) => s.Number === number);
  return shipment;
}
```

---

## 3. Obtener un Warehouse Receipt (por GUID o por número)

### 3.1 Por GUID (wiki “How to save attachments from extension”)

```javascript
const whrList = dbx.Warehousing.WarehouseReceipt.ListByGuid;
const whr = await algorithm.find(dbx.using(whrList).from(whrGuid)).where(i => true);
```

### 3.2 Por número (blueivory test2.js)

```javascript
function getWarehouseReceipt(dbx, number) {
  var resultingWhr = null;
  dbx.using(dbx.Warehousing.WarehouseReceipt.ListByNumber)
    .from(number)
    .iterate((whr) => {
      if (whr.Number == number) {
        resultingWhr = whr;
      }
      return false;
    });
  return resultingWhr;
}
```

Con algorithm (hyperion-node):

```javascript
async function getWarehouseReceiptByNumber(dbx, algorithm, number) {
  const list = dbx.Warehousing.WarehouseReceipt.ListByNumber;
  const whr = await algorithm
    .find(dbx.using(list).from(number))
    .where((w) => w.Number === number);
  return whr;
}
```

---

## 4. Crear un Warehouse Receipt y cargarlo con datos del shipment (flujo “recepción”)

En **blueivory** (`ShipmentReceptionDlg.cpp`) el flujo es:

1. Tener el shipment seleccionado y los ítems a recibir (`m_SelectedItemsCWH`).
2. Crear o usar un WHR (`m_WHR`).
3. `wwhr->SetDataFromShipment(m_Shipment, layout == CShipment::Straight)` — copia datos del shipment al WHR.
4. `wwhr->SetItemList(m_SelectedItemsCWH)` — asigna la lista de ítems al WHR.
5. Por cada ítem: `witem->SetWHR(m_WHR)`.
6. Insertar el WHR en la lista global: `modify(whrl)->insert(m_WHR)`.
7. Actualizar estado del shipment y de los ítems (OnHand, etc.).

En **Node.js con hyperion-node** el equivalente conceptual sería:

- Obtener el shipment (por GUID o número) con las funciones de las secciones 2.1/2.2.
- Crear un nuevo WHR con `new dbx.DbClass.WarehouseReceipt(...)` o el nombre de clase que exponga la API (confirmar en wiki “Warehouse Receipt” / “DbClass”).
- Editar el WHR: `const edited = dbx.edit(whr)`.
- Copiar datos del shipment al WHR: **SetDataFromShipment** — en la wiki/API de Node puede ser una función del objeto editado, por ejemplo `edited.SetDataFromShipment(shipment, isStraight)`. Si no existe en Node, hay que replicar copiando propiedades (Shipper, Consignee, etc.) según la documentación.
- Asignar ítems: si los ítems vienen del shipment (packing list), obtener la lista de ítems del shipment y asociarlos al WHR (por ejemplo `edited.SetItemList(...)` o insertar en `edited.ItemList` / `edited.Items` — nombres según la versión).
- Guardar: `await dbw.save(edited)`.
- Insertar el WHR en la lista global de WHR si es nuevo: en C++ es `GetWhReceiptList()->insert(m_WHR)`. En Node suele ser necesario obtener la lista raíz (por ejemplo `dbx.Warehousing.WarehouseReceiptList` o similar) e insertar ahí el nuevo WHR antes o al guardar; confirmar con `search_docs` “WarehouseReceiptList insert”.

Ejemplo de esqueleto en Node (nombres de clase/lista a confirmar en tu versión):

```javascript
const hyperion = require('@magaya/hyperion-node')(process.argv, {
  clientId: 'mi-extension',
  apiKey: 'tu-api-key'
});

const { dbx, algorithm, dbw } = hyperion;

async function getShipmentByGuid(dbx, algorithm, shipmentGuid) {
  const list = dbx.Shipment.Shipment.ListByGuid;
  return algorithm
    .find(dbx.using(list).from(shipmentGuid).to(shipmentGuid))
    .where((s) => s.GUID === shipmentGuid);
}

async function createWhrFromShipment(dbx, dbw, algorithm, shipmentGuid, options) {
  const shipment = await getShipmentByGuid(dbx, algorithm, shipmentGuid);
  if (!shipment) throw new Error('Shipment no encontrado');

  // Crear nuevo WHR (nombre de clase según wiki: WarehouseReceipt o WH_Receipt)
  const whr = new dbx.DbClass.WarehouseReceipt({
    Number: options.whrNumber || shipment.Waybill || shipment.Number || 'WHR-' + Date.now()
  });

  // Hacer editable y cargar datos del shipment
  const edited = dbx.edit(whr);
  if (typeof edited.SetDataFromShipment === 'function') {
    edited.SetDataFromShipment(shipment, true);  // true = isStraight según C++
  } else {
    // Fallback: copiar campos a mano (Shipper, Consignee, etc.)
    edited.Shipper = shipment.Shipper;
    edited.Consignee = shipment.Consignee;
    // ... según wiki
  }

  // Si hay ítems del shipment a asociar (ej. packing list)
  // edited.SetItemList(itemList) o dbx.insert(edited.ItemList, item) por cada uno
  // y en cada ítem: item.SetWHR(edited) si la API lo expone

  await dbw.save(edited);

  // Insertar en la lista global de WHR si es necesario (depende de la API)
  // const whrList = dbx.Warehousing.WarehouseReceiptList o dbx.Context.GetWhReceiptList();
  // dbx.insert(whrList, edited);

  return { success: true, whrGuid: edited.GUID, shipmentGuid };
}
```

---

## 5. Referencias en blueivory (C++)

- **Shipment → WHR (un solo WHR para todos los ítems):**  
  `ExpExpl/ShipmentReceptionDlg.cpp` → `ReceiveInOneWHR()`  
  - `SetWHRCommonData(m_WHR)`, `wwhr->SetItemList(m_SelectedItemsCWH)`, `wwhr->SetDataFromShipment(m_Shipment, layout == CShipment::Straight)`, `witem->SetWHR(m_WHR)`, `modify(whrl)->insert(m_WHR)`.

- **Un WHR por house shipment:**  
  `ReceiveWHRPerHouse()` — por cada ítem obtiene `in_ship = whitem->GetInShipment()`, crea un WHR por `in_ship`, `wwhr->SetDataFromShipment(in_ship, true)`, asigna ítems y hace `insert` en la lista de receipts.

- **Warehouse Receipt por número (Node):**  
  `blueivory/CS/CS.HyperionHost/node-binding/test2.js` → `getWarehouseReceipt(number)` con `dbx.Warehousing.WarehouseReceipt.ListByNumber` e `iterate`.

---

## 6. Listar Warehouse Receipts por rango de fechas (blueivory test2.js)

```javascript
var whrByTime = dbx.Warehousing.WarehouseReceipt.ListByTime;
var firstDate = new Date('2016/10/5');
var lastDate = new Date('2016/12/25');
dbx.using(whrByTime).from(firstDate).to(lastDate).iterate((whr) => {
  // whr.Number, whr.Shipper, etc.
});
```

Con hyperion-node:

```javascript
const list = dbx.Warehousing.WarehouseReceipt.ListByTime;
const start = new Date('2016-10-05');
const end = new Date('2016-12-25');
const whrList = await algorithm
  .transform(dbx.using(list).from(start).to(end))
  .callback((w) => ({ number: w.Number, shipper: w.Shipper ? w.Shipper.Name : null }));
```

---

## 7. Resumen de pasos (Node.js)

1. **Seleccionar shipment:** `getShipmentByGuid(dbx, algorithm, guid)` o `getShipmentByNumber(dbx, algorithm, number)` con `dbx.Shipment.Shipment.ListByGuid` / `ListByNumber`.
2. **Crear o obtener WHR:** Crear con `new dbx.DbClass.WarehouseReceipt(...)` o obtener con `dbx.Warehousing.WarehouseReceipt.ListByGuid` / `ListByNumber` + `algorithm.find`.
3. **Cargar WHR con datos del shipment:** `dbx.edit(whr)` luego `edited.SetDataFromShipment(shipment, isStraight)` si existe; si no, copiar propiedades a mano.
4. **Asignar ítems:** `SetItemList` o `dbx.insert(edited.ItemList, item)` y en ítems `SetWHR(whr)` si la API lo permite.
5. **Persistir:** `await dbw.save(edited)` y, si aplica, insertar el WHR en la lista global de receipts.

Los nombres exactos de clases (`WarehouseReceipt`, `WH_Receipt`) y propiedades (`ItemList`, `Items`, `PackingList`) pueden variar según la versión de Magaya; conviene confirmar con **search_docs** en este proyecto: "Warehouse Receipt", "SetDataFromShipment", "DbClass", "ItemList".
