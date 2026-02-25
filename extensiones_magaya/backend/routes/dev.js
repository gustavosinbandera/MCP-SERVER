// Rutas: desarrollo / pruebas (test, bills, rep-bug)
const express = require('express');
const router = express.Router();

// GET /server/test
router.get('/test', function (req, res) {
    const dbx = req.dbx;
    if (dbx == null) {
        console.error('[hyperion] request.dbx es null');
        return res.status(503).send('Hyperion dbx no disponible. Revisa conexión a la base de datos y logs.');
    }
    res.send('Success!!');
});

// GET /server/bills -> lista simple de números (legacy)
router.get('/bills', function (req, res) {
    const dbx = req.dbx;
    if (dbx == null) return res.status(503).json({ error: 'Hyperion dbx no disponible.' });
    try {
        const billList = dbx.Accounting.Bill.ListByNumber;
        const bills = [];
        const maxBills = Math.min(Number(req.query.limit) || 100, 500);
        dbx.using(billList).iterate(function (bill) {
            if (bills.length >= maxBills) return false;
            var num = bill.Number != null ? String(bill.Number) : null;
            bills.push(num);
            return true;
        });
        res.json(bills);
    } catch (err) {
        console.error('[hyperion] Error al listar bills:', err);
        res.status(500).json({ error: 'Error al obtener la lista de bills.', message: err.message });
    }
});

// GET /server/rep-bug -> reproducir bug (asignar FWA a un bill)
router.get('/rep-bug', function (req, res) {
    const dbx = req.dbx;
    const dbw = req.dbw;
    const algorithm = req.algorithm;
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
    const skipEntity = req.query.skipEntity === '1' || req.query.skipEntity === 'true';

    if (dbx == null) return res.status(503).json({ error: 'Hyperion dbx no disponible.' });
    if (algorithm == null) return res.status(503).json({ error: 'Hyperion algorithm no disponible.' });
    if (!dryRun && dbw == null) return res.status(503).json({ error: 'Hyperion dbw no disponible para editar/guardar.' });

    var fwaList = dbx.Entity && dbx.Entity.ForwardingAgent && dbx.Entity.ForwardingAgent.List ? dbx.Entity.ForwardingAgent.List : null;
    var billList = dbx.Accounting && dbx.Accounting.Bill && dbx.Accounting.Bill.ListByNumber ? dbx.Accounting.Bill.ListByNumber : null;
    if (!fwaList) return res.status(500).json({ error: 'Entity.ForwardingAgent.List no encontrado.' });
    if (!billList) return res.status(500).json({ error: 'Accounting.Bill.ListByNumber no encontrado.' });

    var firstFwa = null;
    var firstBill = null;
    var fwaCursor = dbx.using(fwaList);
    algorithm.forEach(fwaCursor).callback(function (e) {
        firstFwa = e;
        return false;
    }).then(function () {
        if (!firstFwa) return res.status(404).json({ error: 'No hay Forwarding Agents en la lista.' });
        var billCursor = dbx.using(billList);
        return algorithm.forEach(billCursor).callback(function (b) {
            firstBill = b;
            return false;
        });
    }).then(function () {
        if (!firstBill) return res.status(404).json({ error: 'No hay Bills en la lista.' });
        var billNumber = firstBill.Number != null ? String(firstBill.Number) : '(sin número)';
        var fwaName = firstFwa.Name != null ? String(firstFwa.Name) : '';
        var fwaNumber = firstFwa.Number != null ? String(firstFwa.Number) : '';
        console.log('[rep-bug] Bill a editar: ' + billNumber + ' | FWA a asignar: ' + (fwaName || fwaNumber || '(sin nombre/número)'));
        var out = { billNumber: billNumber, fwaName: fwaName, fwaNumber: fwaNumber, dryRun: dryRun, skipEntity: skipEntity };
        if (dryRun) {
            console.log('[rep-bug] dryRun=1: no se ejecuta edit/save.');
            return res.json(out);
        }
        return dbw.edit(firstBill).then(function (editable) {
            if (!skipEntity) editable.Entity = firstFwa;
            return dbw.save(editable).then(function () {
                console.log('[rep-bug] Bill editado y guardado: ' + billNumber + ' | FWA asignado: ' + (fwaName || fwaNumber));
                out.saved = true;
                res.json(out);
            });
        });
    }).catch(function (err) {
        console.error('[rep-bug] Error:', err.message);
        res.status(500).json({ error: err.message });
    });
});

module.exports = router;
