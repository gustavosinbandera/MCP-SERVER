# Snippet: Lista de shipments, elegir uno y cambiar su estado (Hyperion Node)

Basado en la wiki Hyperion (SetShipmentStatus, Shipment, GetTransaction) y en el patrón de [hyperion-example-shipments-list-edit.md](hyperion-example-shipments-list-edit.md).

---

## Estados válidos (wiki SetShipmentStatus)

Deben cambiarse en secuencia cuando aplique:

1. `WaitingForInstructions`
2. `Loading`
3. `Loaded`
4. `InTransit`
5. `Received`
6. `Delivered`

Secuencia típica: **Loaded** → **InTransit** → **Received** → **Delivered**.

---

## 1. Listar shipments

```javascript
async function listShipments(dbx, algorithm) {
  const list = dbx.Shipment.Shipment.ListByNumber; // o ListByTime con .from(start).to(end)

  const shipments = await algorithm
    .transform(dbx.using(list))
    .callback((shipment) => ({
      guid: shipment.GUID,
      number: shipment.Number,
      name: shipment.Name || shipment.Number,
      status: shipment.Status // si existe en tu versión
    }));

  return shipments;
}
```

---

## 2. Seleccionar uno para edición (ej. cualquiera / el primero)

```javascript
function selectShipmentForEdit(shipments, strategy) {
  if (!shipments || shipments.length === 0) return null;
  if (strategy === 'first') return shipments[0];
  if (strategy === 'last') return shipments[shipments.length - 1];
  // Por defecto: uno al azar
  return shipments[Math.floor(Math.random() * shipments.length)];
}
```

---

## 3. Cambiar el estado del shipment

Patrón: obtener el shipment por GUID → `dbx.edit(shipment)` → asignar `Status` → `dbw.save(edited)`.

```javascript
async function setShipmentStatus(dbx, dbw, algorithm, shipmentGuid, newStatus) {
  const list = dbx.Shipment.Shipment.ListByGuid;

  const shipment = await algorithm
    .find(dbx.using(list).from(shipmentGuid).to(shipmentGuid))
    .where((s) => s.GUID === shipmentGuid);

  if (!shipment) {
    throw new Error('Shipment no encontrado: ' + shipmentGuid);
  }

  const edited = dbx.edit(shipment);
  edited.Status = newStatus; // WaitingForInstructions | Loading | Loaded | InTransit | Received | Delivered

  await dbw.save(edited);
  return { success: true, guid: shipmentGuid, status: newStatus };
}
```

---

## 4. Función completa: listar → elegir uno → cambiar estado

```javascript
const hyperion = require('@magaya/hyperion-node')(process.argv, {
  clientId: 'mi-extension',
  apiKey: 'tu-api-key'
});

const { dbx, algorithm, dbw } = hyperion;

const VALID_STATUSES = [
  'WaitingForInstructions',
  'Loading',
  'Loaded',
  'InTransit',
  'Received',
  'Delivered'
];

async function listShipments(dbx, algorithm) {
  const list = dbx.Shipment.Shipment.ListByNumber;
  return algorithm
    .transform(dbx.using(list))
    .callback((s) => ({ guid: s.GUID, number: s.Number, name: s.Name || s.Number, status: s.Status }));
}

function selectShipmentForEdit(shipments, strategy) {
  if (!shipments || shipments.length === 0) return null;
  if (strategy === 'first') return shipments[0];
  if (strategy === 'last') return shipments[shipments.length - 1];
  return shipments[Math.floor(Math.random() * shipments.length)];
}

async function setShipmentStatus(dbx, dbw, algorithm, shipmentGuid, newStatus) {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error('Estado no válido. Usar: ' + VALID_STATUSES.join(', '));
  }
  const list = dbx.Shipment.Shipment.ListByGuid;
  const shipment = await algorithm
    .find(dbx.using(list).from(shipmentGuid).to(shipmentGuid))
    .where((s) => s.GUID === shipmentGuid);
  if (!shipment) throw new Error('Shipment no encontrado: ' + shipmentGuid);

  const edited = dbx.edit(shipment);
  edited.Status = newStatus;
  await dbw.save(edited);
  return { success: true, guid: shipmentGuid, status: newStatus };
}

async function listPickOneAndChangeStatus(dbx, dbw, algorithm, newStatus, selectionStrategy) {
  const shipments = await listShipments(dbx, algorithm);
  const chosen = selectShipmentForEdit(shipments, selectionStrategy || 'random');
  if (!chosen) {
    return { success: false, error: 'No hay shipments en la lista' };
  }
  const result = await setShipmentStatus(dbx, dbw, algorithm, chosen.guid, newStatus);
  return { ...result, chosen: { guid: chosen.guid, number: chosen.number } };
}

// Uso: listar, elegir uno (p. ej. al azar) y poner estado "InTransit"
async function main() {
  const result = await listPickOneAndChangeStatus(dbx, dbw, algorithm, 'InTransit', 'random');
  console.log(result);
}

main().catch((err) => console.error(err));
```

---

## 5. Uso por estrategia

- `listPickOneAndChangeStatus(dbx, dbw, algorithm, 'Loaded', 'first')` — primer shipment → estado Loaded.
- `listPickOneAndChangeStatus(dbx, dbw, algorithm, 'InTransit', 'random')` — uno al azar → InTransit.
- `listPickOneAndChangeStatus(dbx, dbw, algorithm, 'Delivered', 'last')` — último de la lista → Delivered.

**Nota:** El nombre de la propiedad puede ser `Status` o `State` según la versión de Magaya; en la wiki de Hyperion (SetShipmentStatus) se usa **Status**. Si en tu entorno el campo es otro, cambia `edited.Status` por la propiedad correcta.
