// Rutas: acctransactions (listar, ver, editar entidad, eliminar)
const path = require('path');
const express = require('express');
const router = express.Router();
const { ACCTRANSACTION_TYPES, ASSIGN_ENTITY_TYPES } = require('../lib/constants');
const {
    getAccountingList,
    getEntityList,
    findInList,
    iterateAccountingList
} = require('../lib/helpers');

const frontendDir = path.join(__dirname, '..', '..', 'frontend');

// GET /server/acctransactions-form -> sirve la UI
router.get('/acctransactions-form', function (req, res) {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.join(frontendDir, 'acctransactions.html'));
});

// GET /server/acctransactions -> listar todas las listas por tipo
router.get('/acctransactions', function (req, res) {
    const dbx = req.dbx;
    const algorithm = req.algorithm;
    if (dbx == null) return res.status(503).json({ error: 'Hyperion dbx no disponible.' });
    if (algorithm == null) return res.status(503).json({ error: 'Hyperion algorithm no disponible.' });
    if (!dbx.Accounting) return res.status(500).json({ error: 'Accounting namespace no encontrado.' });

    const maxItems = Math.min(Number(req.query.limit) || 200, 500);
    var result = {
        bills: [], invoices: [], payments: [], checks: [], deposits: [], journalEntries: []
    };

    var billList = getAccountingList(dbx, ACCTRANSACTION_TYPES[0].path);
    var invoiceList = getAccountingList(dbx, ACCTRANSACTION_TYPES[1].path);
    var paymentList = getAccountingList(dbx, ACCTRANSACTION_TYPES[2].path);
    var checkList = getAccountingList(dbx, ACCTRANSACTION_TYPES[3].path);
    var depositList = getAccountingList(dbx, ACCTRANSACTION_TYPES[4].path);
    var journalEntryList = getAccountingList(dbx, ACCTRANSACTION_TYPES[5].path);

    var p = Promise.resolve();
    if (billList) p = p.then(function () { return iterateAccountingList(algorithm, dbx, billList, maxItems).then(function (arr) { result.bills = arr; }); });
    if (invoiceList) p = p.then(function () { return iterateAccountingList(algorithm, dbx, invoiceList, maxItems).then(function (arr) { result.invoices = arr; }); });
    if (paymentList) p = p.then(function () { return iterateAccountingList(algorithm, dbx, paymentList, maxItems).then(function (arr) { result.payments = arr; }); });
    if (checkList) p = p.then(function () { return iterateAccountingList(algorithm, dbx, checkList, maxItems).then(function (arr) { result.checks = arr; }); });
    if (depositList) p = p.then(function () { return iterateAccountingList(algorithm, dbx, depositList, maxItems).then(function (arr) { result.deposits = arr; }); });
    if (journalEntryList) p = p.then(function () { return iterateAccountingList(algorithm, dbx, journalEntryList, maxItems).then(function (arr) { result.journalEntries = arr; }); });

    p.then(function () { res.json(result); })
        .catch(function (err) {
            console.error('[hyperion] Error al listar transacciones contables:', err);
            res.status(500).json({ error: err.message, acctransactions: result });
        });
});

// GET /server/acctransactions/:type/:number -> ver una transacción (placeholder)
router.get('/acctransactions/:type/:number', function (req, res) {
    res.status(501).json({ error: 'Detalle de transacción no implementado aún.' });
});

// POST /server/acctransactions-assign-entity -> editar entidad de la transacción
router.post('/acctransactions-assign-entity', function (req, res) {
    const dbx = req.dbx;
    const dbw = req.dbw;
    const algorithm = req.algorithm;
    const body = req.body || {};

    if (dbx == null) return res.status(503).json({ error: 'Hyperion no disponible. No se pudo conectar a la base de datos.' });
    if (algorithm == null) return res.status(503).json({ error: 'Hyperion no disponible. Servicio de algoritmo no encontrado.' });
    if (dbw == null) return res.status(503).json({ error: 'No se puede editar. El servicio de escritura (dbw) no está disponible.' });

    var transactionType = body.transactionType;
    var transactionNumber = body.transactionNumber;
    var entityType = body.entityType;
    var entityNumber = body.entityNumber != null ? String(body.entityNumber).trim() : '';
    var entityName = body.entityName != null ? String(body.entityName).trim() : '';

    if (!transactionType || !transactionNumber) return res.status(400).json({ error: 'Faltan tipo de transacción o número de transacción.' });
    if (!entityType) return res.status(400).json({ error: 'Debe seleccionar un tipo de entidad.' });
    if (!entityNumber && !entityName) return res.status(400).json({ error: 'Debe seleccionar una entidad.' });

    var txConfig = ACCTRANSACTION_TYPES.filter(function (t) { return t.key === transactionType; })[0];
    var entityConfig = ASSIGN_ENTITY_TYPES.filter(function (e) { return e.key === entityType; })[0];
    if (!txConfig) return res.status(400).json({ error: 'Tipo de transacción no válido: ' + transactionType + '.' });
    if (!entityConfig) return res.status(400).json({ error: 'Tipo de entidad no válido: ' + entityType + '.' });

    var txList = getAccountingList(dbx, txConfig.path);
    var entityList = getEntityList(dbx, entityConfig.path);
    if (!txList) return res.status(500).json({ error: 'No se encontró la lista de transacciones para ' + transactionType + '.' });
    if (!entityList) return res.status(500).json({ error: 'No se encontró la lista de entidades para ' + entityType + '.' });

    var txNumberStr = String(transactionNumber);
    findInList(algorithm, dbx, txList, function (item) {
        return item != null && item.Number != null && String(item.Number) === txNumberStr;
    }).then(function (transaction) {
        if (!transaction) return res.status(404).json({ error: 'No se encontró la transacción con número "' + transactionNumber + '".' });
        return findInList(algorithm, dbx, entityList, function (item) {
            if (item == null) return false;
            if (entityNumber && item.Number != null && String(item.Number) === String(entityNumber)) return true;
            if (entityName && item.Name != null && String(item.Name) === String(entityName)) return true;
            return false;
        }).then(function (entity) {
            if (!entity) return res.status(404).json({ error: 'No se encontró la entidad seleccionada en la lista de ' + entityConfig.label + '.' });
            return dbw.edit(transaction).then(function (editable) {
                editable.Entity = entity;
                if (transactionType === 'bills') editable.Vendor = entity;
                if (transactionType === 'invoices') editable.Client = entity;
                return dbw.save(editable).then(function () {
                    res.json({ ok: true, transactionNumber: transactionNumber, entityAssigned: entity.Name || entity.Number });
                });
            });
        });
    }).catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        console.error('[acctransactions-assign-entity] Error:', msg);
        res.status(500).json({ error: 'No se pudo guardar el cambio. ' + msg });
    });
});

// DELETE /server/acctransactions/:type/:number -> eliminar (placeholder)
router.delete('/acctransactions/:type/:number', function (req, res) {
    res.status(501).json({ error: 'Eliminación de transacción no implementada. Use la aplicación Magaya.' });
});

module.exports = router;
