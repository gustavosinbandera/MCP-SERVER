# Creación y edición de Bills con Hyperion

## Flujo de escritura (dbw)

En Node.js tienes **`request.dbw`** (WriteAccess):

- **`dbw.edit(objeto)`** – Devuelve una promesa con un objeto “editable” a partir de un objeto que vienes de leer con `dbx` (p. ej. un Bill obtenido con `dbx.using(...).iterate()`).
- **`dbw.save(objeto)`** – Guarda en base de datos el objeto que previamente editaste (o un objeto nuevo válido). Devuelve una promesa.

Para **crear** un Bill normalmente harías:

1. O bien obtener un Bill existente con `dbx.Accounting.Bill.ListByNumber` / `ListByTime`, tomar uno (o un “template”), y luego `dbw.edit(bill)` para editarlo y `dbw.save(objetoEditado)`.
2. O bien, si el API lo permite, construir un objeto Bill nuevo (con la estructura que espera el backend) y llamar solo a `dbw.save(billNuevo)`.

La creación “from scratch” depende de si Hyperion expone una lista vacía, un factory o un template; en el esquema, Bill comparte tipo con **AccountingItem**.

---

## Campos que puede llevar un Bill (AccountingItem)

El tipo **Bill** en el XSD usa **AccountingItem**. Estos son los campos que puedes setear (según `XMLSchemas/Accounting.xsd`):

### Obligatorios / principales

| Campo | Tipo | Notas |
|-------|------|--------|
| **Number** | string | Número del Bill (obligatorio). |
| **Account** | AccountDefinitionType | Cuenta principal (AP para Bill). Obligatorio. |
| **Entity** | EntityType | **Vendor** en el caso del Bill. Obligatorio. |
| **Currency** | CurrencyType | Moneda de la transacción. Obligatorio. |
| **TotalAmount** | MoneyValue | Total en moneda home. Obligatorio. |
| **TotalAmountInCurrency** | MoneyValue | Total en moneda de la transacción. Obligatorio. |
| **ExchangeRate** | double | Tipo de cambio. Obligatorio. |
| **CreatedOn** | dateTime | Fecha de creación. Obligatorio. |

### Opcionales (se pueden setear)

| Campo | Tipo | Notas |
|-------|------|--------|
| **DueDate** | date | Fecha de vencimiento. No aplica a créditos. |
| **CreatedBy** | EntityType | Usuario que creó la transacción. |
| **IssuedBy** | EntityType | Empresa que emite la transacción. |
| **BillingAddress** | AddressType | Dirección de facturación. |
| **HomeCurrency** | CurrencyType | Solo salida en muchos casos. |
| **Division** | EntityType | División. |
| **Charges** | ChargeList | Líneas de cargos. |
| **AccountItemLines** | AccountItemLineList | Líneas de cuenta adicionales. |
| **Notes** | string | Notas visibles para el cliente. |
| **Description** | string | Descripción. |
| **Status** | string | `"Open"` o `"Paid"`. |
| **ApprovalStatus** | string | `"None"`, `"Approved"`, `"Disputed"`. |
| **AmountPaid** | MoneyValue | Monto pagado (moneda home). |
| **AmountPaidInCurrency** | MoneyValue | Monto pagado (moneda transacción). |
| **TaxAmount** | MoneyValue | Impuestos (home). |
| **TaxAmountInCurrency** | MoneyValue | Impuestos (moneda transacción). |
| **AmountRevalued** | MoneyValue | Revaluación. |
| **RetentionAmount** | MoneyValue | Retención (home). |
| **RetentionAmountInCurrency** | MoneyValue | Retención (moneda transacción). |
| **IsPrepaid** | boolean | Términos de pago (prepago / collect). |
| **IsFiscalPrinted** | boolean | Impreso en impresora fiscal. |
| **FiscalPrintResult** | FiscalPrintResultType | Resultado de impresión fiscal. |
| **IsPeriodic** | boolean | Transacción periódica. |
| **IsPrinted** | boolean | Si ya se imprimió. |
| **ObjectElementName** | string | Nombre del documento de cargo relacionado. |
| **ContainerNumber** | string | Número de contenedor facturado. |
| **RelatedObject** | ObjectType | WR, Pickup Order, Cargo Release, Shipment, etc. |
| **PaymentTerms** | string | Términos de pago (texto). |
| **PaymentTermsRef** | PaymentTermType | Términos de pago detallados. |
| **CustomFields** | CustomFieldList | Campos personalizados. |
| **Attachments** | AttachmentList | Adjuntos. |
| **Events** | EventList | Eventos. |

### Atributos

- **GUID** – Identificador único (opcional).
- **Type** – Tipo de transacción para el API (opcional).

---

## Ejemplo de uso de dbw (editar y guardar)

```javascript
// Ejemplo conceptual (async): obtener un bill, editarlo y guardar
app.get('/server/bills/edit-example', async function (req, res) {
    const dbx = req.dbx;
    const dbw = req.dbw;
    if (!dbx || !dbw) return res.status(503).json({ error: 'Hyperion no disponible.' });

    let billToEdit;
    dbx.using(dbx.Accounting.Bill.ListByNumber).from('1').iterate(function (b) {
        billToEdit = b;
        return false;
    });
    if (!billToEdit) return res.status(404).json({ error: 'Bill no encontrado.' });

    try {
        const editable = await dbw.edit(billToEdit);
        // Aquí setearías propiedades sobre editable (Notes, Description, etc.)
        // editable.Notes = 'Actualizado desde extensión';
        const result = await dbw.save(editable);
        res.json({ ok: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

Los nombres de propiedades en **JavaScript** suelen coincidir con el XSD (por ejemplo `Number`, `DueDate`, `Entity`, `TotalAmount`, `Charges`). Para tipos como **EntityType**, **AccountDefinitionType**, **MoneyValue** o **ChargeList** hay que usar las estructuras que espere el API (referencias por GUID, objetos anidados, etc.); el XSD y la documentación de Magaya definen el detalle.

---

## Resumen

- **Escritura:** `request.dbw.edit(objeto)` y `request.dbw.save(objeto)` (ambos asíncronos, devuelven promesas).
- **Campos setear:** los listados arriba (AccountingItem); los obligatorios son los mínimos para que el Bill sea válido al guardar.
- **Creación:** normalmente vía `dbw.edit` de un Bill existente o de un template, o `dbw.save` de un objeto Bill nuevo si el API lo soporta; la creación “from zero” depende de cómo esté expuesta en tu versión de Hyperion/Node.
