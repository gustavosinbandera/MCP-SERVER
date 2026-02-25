# Snippet: Obtener y recorrer una lista en Hyperion (Node / script)

Basado en la wiki Hyperion indexada en Qdrant (How to - Hyperion, forEachInArray, CopyToArray, CGroupList).

---

## 1. Función para iterar un array de objetos Hyperion

```javascript
function forEachInArray(arr, callback) {
  for (var index = 0; index < arr.length; index++) {
    callback(arr[index]);
  }
}
```

- **arr:** array al que aplicar la función (p. ej. resultado de `copyToArray(listaHyperion)`).
- **callback:** función que recibe cada elemento; parámetro único = objeto Hyperion.

---

## 2. Obtener una lista del objeto actual y recorrerla

Ejemplo: obtener los **Charges** (cargos) del objeto en contexto y procesar cada uno.

```javascript
function getSortedCharges() {
  var result = '';
  // Obtener la lista Hyperion del objeto actual (ej. cargos de una transacción)
  var chargesList = dbx.Context.CurrentObject.Charges;
  // Convertir la lista Hyperion a array para poder iterar/ordenar
  var chargesArr = copyToArray(chargesList);

  chargesArr.sort(byCustomerCriteria); // orden opcional
  forEachInArray(chargesArr, function (charge) {
    result += charge.Description + '\t' + charge.Amount + '\r\n';
  });
  return result;
}
```

- **dbx.Context.CurrentObject** — objeto Hyperion en contexto (según el script).
- **.Charges** — propiedad que devuelve una lista (tipo CGroupList u otra lista Hyperion).
- **copyToArray(lista)** — convierte la lista Hyperion en array de JS (ver wiki CopyToArray).
- Luego se puede ordenar y recorrer con **forEachInArray**.

---

## 3. Número de elementos en la lista (CGroupList)

En la wiki, **CGroupList** expone:

- **Count** — Integer, número de elementos en la lista.

Si tu lista es de tipo CGroupList (o tiene `Count`):

```javascript
var list = dbx.Context.CurrentObject.Charges; // u otra propiedad que sea lista
var numElements = list.Count;
```

---

## 4. Esquema resumido

```
Objeto Hyperion (ej. transacción)
  → .Charges / .Items / otra propiedad lista
  → lista Hyperion (ej. CGroupList)
  → copyToArray(lista) → array JS
  → forEachInArray(array, function(item) { ... }) para procesar cada elemento
```

Para otras listas (Items de transacción, etc.) se usa el mismo patrón: obtener la propiedad lista del objeto, `copyToArray`, luego iterar con `forEachInArray` o un `for` sobre el array.
