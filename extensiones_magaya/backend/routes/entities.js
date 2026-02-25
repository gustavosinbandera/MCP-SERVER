// Rutas: entities (listar, editar, eliminar)
const path = require('path');
const express = require('express');
const router = express.Router();
const { ENTITY_TYPES } = require('../lib/constants');
const { getEntityList, iterateEntityList, iterateEntityCount } = require('../lib/helpers');

const frontendDir = path.join(__dirname, '..', '..', 'frontend');

// GET /server/entities-form -> sirve la UI
router.get('/entities-form', function (req, res) {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.join(frontendDir, 'entities.html'));
});

// GET /server/entities-check -> diagnóstico
router.get('/entities-check', function (req, res) {
    const dbx = req.dbx;
    if (dbx == null) return res.status(503).json({ error: 'Hyperion dbx no disponible.' });
    if (!dbx.Entity) return res.status(500).json({ error: 'Entity namespace no encontrado.' });
    var report = ENTITY_TYPES.map(function (t) {
        var list = getEntityList(dbx, t.path);
        return { key: t.key, path: t.path.join('.'), exists: list != null };
    });
    res.json(report);
});

// GET /server/entities-sizes -> diagnóstico
router.get('/entities-sizes', function (req, res) {
    const dbx = req.dbx;
    const algorithm = req.algorithm;
    if (dbx == null) return res.status(503).json({ error: 'Hyperion dbx no disponible.' });
    if (algorithm == null) return res.status(503).json({ error: 'Hyperion algorithm no disponible.' });
    if (!dbx.Entity) return res.status(500).json({ error: 'Entity namespace no encontrado.' });

    var lists = {
        customers: dbx.Entity.Customer && dbx.Entity.Customer.List ? dbx.Entity.Customer.List : null,
        vendors: dbx.Entity.Vendor && dbx.Entity.Vendor.List ? dbx.Entity.Vendor.List : null,
        carriers: dbx.Entity.Carrier && dbx.Entity.Carrier.List ? dbx.Entity.Carrier.List : null,
        warehouseProviders: dbx.Entity.WarehouseProvider && dbx.Entity.WarehouseProvider.List ? dbx.Entity.WarehouseProvider.List : null,
        forwardingAgents: dbx.Entity.ForwardingAgent && dbx.Entity.ForwardingAgent.List ? dbx.Entity.ForwardingAgent.List : null,
        employees: dbx.Entity.Employee && dbx.Entity.Employee.List ? dbx.Entity.Employee.List : null,
        salespeople: dbx.Entity.Salesperson && dbx.Entity.Salesperson.List ? dbx.Entity.Salesperson.List : null,
        contacts: dbx.Entity.Contact && dbx.Entity.Contact.List ? dbx.Entity.Contact.List : null,
        vessels: dbx.Entity.Vessel && dbx.Entity.Vessel.List ? dbx.Entity.Vessel.List : null
    };
    var sizes = {};
    var errs = {};
    function countOne(key, list) {
        if (!list) { sizes[key] = 'list-not-found'; return Promise.resolve(); }
        return iterateEntityCount(algorithm, dbx, list)
            .then(function (n) { sizes[key] = n; })
            .catch(function (err) { sizes[key] = 'error'; errs[key] = err.message; });
    }
    var p = Promise.resolve();
    Object.keys(lists).forEach(function (key) { p = p.then(function () { return countOne(key, lists[key]); }); });
    p.then(function () { res.json({ sizes: sizes, errors: Object.keys(errs).length ? errs : undefined }); })
        .catch(function (err) { res.status(500).json({ error: err.message, sizes: sizes }); });
});

// GET /server/entities -> listar (por tipo)
router.get('/entities', function (req, res) {
    const dbx = req.dbx;
    const algorithm = req.algorithm;
    if (dbx == null) return res.status(503).json({ error: 'Hyperion dbx no disponible.' });
    if (algorithm == null) return res.status(503).json({ error: 'Hyperion algorithm no disponible.' });
    if (!dbx.Entity) return res.status(500).json({ error: 'Entity namespace no encontrado.' });

    const maxEntities = Math.min(Number(req.query.limit) || 100, 500);
    var result = {
        customers: null, vendors: null, all: [], allActive: [],
        carriers: [], warehouseProviders: [], forwardingAgents: [],
        employees: [], salespeople: [], contacts: [], vessels: []
    };

    var customerList = getEntityList(dbx, ['Entity', 'Customer', 'List']);
    var vendorList = getEntityList(dbx, ['Entity', 'Vendor', 'List']);
    var carrierList = getEntityList(dbx, ['Entity', 'Carrier', 'List']);
    var warehouseProviderList = getEntityList(dbx, ['Entity', 'WarehouseProvider', 'List']);
    var forwardingAgentList = getEntityList(dbx, ['Entity', 'ForwardingAgent', 'List']);
    var salespersonList = getEntityList(dbx, ['Entity', 'Salesperson', 'List']);
    var contactList = getEntityList(dbx, ['Entity', 'Contact', 'List']);
    var vesselList = getEntityList(dbx, ['Entity', 'Vessel', 'List']);

    if (!customerList) return res.status(500).json({ error: 'Entity.Customer.List no encontrado.' });

    iterateEntityList(algorithm, dbx, customerList, maxEntities)
        .then(function (customers) {
            result.customers = customers;
            return vendorList ? iterateEntityList(algorithm, dbx, vendorList, maxEntities).then(function (v) { result.vendors = v; return result; }) : Promise.resolve(result);
        })
        .then(function () {
            return carrierList ? iterateEntityList(algorithm, dbx, carrierList, maxEntities).then(function (c) { result.carriers = c; return result; }) : Promise.resolve(result);
        })
        .then(function () {
            return warehouseProviderList ? iterateEntityList(algorithm, dbx, warehouseProviderList, maxEntities).then(function (w) { result.warehouseProviders = w; return result; }) : Promise.resolve(result);
        })
        .then(function () {
            return forwardingAgentList ? iterateEntityList(algorithm, dbx, forwardingAgentList, maxEntities).then(function (f) { result.forwardingAgents = f; return result; }) : Promise.resolve(result);
        })
        .then(function () {
            return salespersonList ? iterateEntityList(algorithm, dbx, salespersonList, maxEntities).then(function (s) { result.salespeople = s; return result; }) : Promise.resolve(result);
        })
        .then(function () {
            return contactList ? iterateEntityList(algorithm, dbx, contactList, maxEntities).then(function (c) { result.contacts = c; return result; }) : Promise.resolve(result);
        })
        .then(function () {
            return vesselList ? iterateEntityList(algorithm, dbx, vesselList, maxEntities).then(function (v) { result.vessels = v; return result; }) : Promise.resolve(result);
        })
        .then(function () { res.json(result); })
        .catch(function (err) {
            console.error('[hyperion] Error al listar entidades:', err);
            res.status(500).json({ error: err.message, entities: result });
        });
});

// PUT /server/entities/:type/:number -> editar entidad (placeholder para futuro)
router.put('/entities/:type/:number', function (req, res) {
    res.status(501).json({ error: 'Edición de entidad no implementada aún. Use la aplicación Magaya para editar.' });
});

// DELETE /server/entities/:type/:number -> eliminar (placeholder)
router.delete('/entities/:type/:number', function (req, res) {
    res.status(501).json({ error: 'Eliminación de entidad no implementada. Use la aplicación Magaya.' });
});

module.exports = router;
