// Rutas: shipments (listar, ver, editar, eliminar, cargar items) — placeholder para futuro
const express = require('express');
const router = express.Router();

router.get('/shipments', function (req, res) {
    res.status(501).json({ error: 'Listado de shipments no implementado aún.' });
});

router.get('/shipments/:id', function (req, res) {
    res.status(501).json({ error: 'Detalle de shipment no implementado aún.' });
});

router.put('/shipments/:id', function (req, res) {
    res.status(501).json({ error: 'Edición de shipment no implementada aún.' });
});

router.delete('/shipments/:id', function (req, res) {
    res.status(501).json({ error: 'Eliminación de shipment no implementada aún.' });
});

router.get('/shipments/:id/items', function (req, res) {
    res.status(501).json({ error: 'Carga de ítems del shipment no implementada aún.' });
});

module.exports = router;
