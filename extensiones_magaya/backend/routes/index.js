// Agregador de rutas: monta todos los routers bajo /server
const express = require('express');
const router = express.Router();

const entitiesRouter = require('./entities');
const acctransactionsRouter = require('./acctransactions');
const shipmentsRouter = require('./shipments');
const devRouter = require('./dev');

// Todas las rutas se montan en /server (el index.js hace app.use('/server', routes))
router.use('/', entitiesRouter);
router.use('/', acctransactionsRouter);
router.use('/', shipmentsRouter);
router.use('/', devRouter);

module.exports = router;
