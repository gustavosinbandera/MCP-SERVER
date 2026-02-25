// Helpers compartidos para listas y resolución de paths
const { dbClassTypeNames, ENTITY_TYPE_BY_CENTITY, ENTITY_TYPE_BY_POSITION, ENTITY_TYPE_BY_FLAG, ENTITY_TYPE_FLAGS_ORDER, ENTITY_TYPE_BY_INDEX } = require('./constants');

function resolvePath(obj, pathArr) {
    var o = obj;
    for (var i = 0; i < pathArr.length && o != null; i++) o = o[pathArr[i]];
    return o || null;
}

function getDbClassTypeName(obj) {
    var t = obj != null && obj.DbClassType != null ? Number(obj.DbClassType) : -1;
    return t >= 0 && t < dbClassTypeNames.length ? dbClassTypeNames[t] : 'Unknown';
}

function getEntityList(dbx, pathArr) {
    return resolvePath(dbx, pathArr);
}

function getAccountingList(dbx, pathArr) {
    return resolvePath(dbx, pathArr);
}

function iterateEntityList(algorithm, dbx, list, maxItems) {
    var out = [];
    var cursor = dbx.using(list);
    return algorithm.forEach(cursor).callback(function (e) {
        if (out.length >= maxItems) return;
        var name = (e != null && e.Name != null) ? String(e.Name) : null;
        var num = (e != null && e.Number != null) ? String(e.Number) : null;
        out.push({ name: name, number: num });
    }).then(function () { return out; });
}

function iterateEntityCount(algorithm, dbx, list) {
    var count = 0;
    var cursor = dbx.using(list);
    return algorithm.forEach(cursor).callback(function () { count++; }).then(function () { return count; });
}

function findInList(algorithm, dbx, list, predicate) {
    var found = null;
    var cursor = dbx.using(list);
    return algorithm.forEach(cursor).callback(function (item) {
        if (predicate(item)) {
            found = item;
            return false;
        }
        return true;
    }).then(function () { return found; });
}

// --- Accounting helpers
function safeStr(obj, prop) {
    if (obj == null || obj[prop] == null) return null;
    return String(obj[prop]);
}
function safeNum(obj, prop) {
    if (obj == null || obj[prop] == null) return null;
    var v = obj[prop];
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (typeof v === 'string') { var n = parseFloat(v); return isNaN(n) ? null : n; }
    return null;
}
function getEntityName(item) {
    if (item == null) return null;
    var e = item.Entity;
    if (e != null && e.Name != null) return String(e.Name);
    var v = item.Vendor;
    if (v != null && v.Name != null) return String(v.Name);
    var c = item.Client;
    if (c != null && c.Name != null) return String(c.Name);
    return null;
}
function entityTypeToHumanReadable(t) {
    if (t == null) return null;
    if (typeof t === 'string' && !/^\d+$/.test(t)) return t;
    var n = typeof t === 'number' ? t : (typeof t === 'string' ? parseInt(t, 10) : NaN);
    if (!isNaN(n)) {
        // Prioridad: CEntity (Common/user.h, lo que devuelve el API) > FLAG (EntityConceptBuilder) > POSITION > INDEX
        if (ENTITY_TYPE_BY_CENTITY[n]) return ENTITY_TYPE_BY_CENTITY[n];
        if (ENTITY_TYPE_BY_FLAG[n]) return ENTITY_TYPE_BY_FLAG[n];
        if (n >= 1 && n <= 11 && ENTITY_TYPE_BY_POSITION[n]) return ENTITY_TYPE_BY_POSITION[n];
        if (n >= 0 && n < ENTITY_TYPE_BY_INDEX.length) return ENTITY_TYPE_BY_INDEX[n];
        if (n > 0 && n < 4096) {
            for (var i = 0; i < ENTITY_TYPE_FLAGS_ORDER.length; i++) {
                var flag = ENTITY_TYPE_FLAGS_ORDER[i];
                if ((n & flag) !== 0) return ENTITY_TYPE_BY_FLAG[flag];
            }
        }
        return ENTITY_TYPE_BY_INDEX[n] || 'Entity';
    }
    if (typeof t === 'string' && /^\d+$/.test(t)) return entityTypeToHumanReadable(parseInt(t, 10));
    return typeof t === 'string' ? t : null;
}
// Devuelve el tipo real de la entidad (ForwardingAgent, Vendor, Client, etc.), no solo el rol.
// La entidad expone el campo Type (EntityConceptBuilder: AddNamespaceField L"Type", EntityType).
function getEntityType(item) {
    if (item == null) return null;
    var typeVal = null;
    var role = null;
    if (item.Vendor != null) {
        role = 'Vendor';
        typeVal = item.Vendor.Type;
        if (typeVal == null && item.Entity != null) typeVal = item.Entity.Type;
    } else if (item.Client != null) {
        role = 'Client';
        typeVal = item.Client.Type;
        if (typeVal == null && item.Entity != null) typeVal = item.Entity.Type;
    } else {
        var e = item.Entity;
        if (e == null) return null;
        typeVal = e.Type;
        role = 'Entity';
    }
    var hr = typeVal != null ? entityTypeToHumanReadable(typeVal) : null;
    return hr || role;
}
function getTransactionDate(item) {
    if (item == null) return null;
    var d = item.TransactionDate != null ? item.TransactionDate : item.Date;
    if (d == null) return null;
    if (typeof d === 'string') return d;
    if (typeof d === 'number') return new Date(d).toISOString().slice(0, 10);
    if (d && typeof d.getFullYear === 'function') return d.toISOString().slice(0, 10);
    return null;
}
function iterateAccountingList(algorithm, dbx, list, maxItems) {
    var out = [];
    var cursor = dbx.using(list);
    return algorithm.forEach(cursor).callback(function (item) {
        if (out.length >= maxItems) return;
        var num = safeStr(item, 'Number');
        var total = (item != null && item.TotalAmount != null) ? Number(item.TotalAmount) : null;
        if (total == null) total = safeNum(item, 'TotalAmount');
        var typeName = getDbClassTypeName(item);
        var entityName = getEntityName(item);
        var entityType = getEntityType(item);
        var status = (item != null && item.Status != null) ? String(item.Status) : null;
        var date = getTransactionDate(item);
        out.push({
            number: num,
            totalAmount: total,
            type: typeName,
            entityName: entityName,
            entityType: entityType,
            status: status,
            date: date
        });
    }).then(function () { return out; });
}

exports.resolvePath = resolvePath;
exports.getDbClassTypeName = getDbClassTypeName;
exports.getEntityList = getEntityList;
exports.getAccountingList = getAccountingList;
exports.iterateEntityList = iterateEntityList;
exports.iterateEntityCount = iterateEntityCount;
exports.findInList = findInList;
exports.safeStr = safeStr;
exports.safeNum = safeNum;
exports.getEntityName = getEntityName;
exports.entityTypeToHumanReadable = entityTypeToHumanReadable;
exports.getEntityType = getEntityType;
exports.getTransactionDate = getTransactionDate;
exports.iterateAccountingList = iterateAccountingList;
