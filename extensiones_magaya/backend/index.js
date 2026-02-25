// Backend: Express + Hyperion. Entry point: monta middleware y rutas.
const path = require('path');
const express = require('express');
const app = express();

const hasConnectionString = process.argv.some(a => typeof a === 'string' && a.startsWith('--connection-string'));
const argv = hasConnectionString ? process.argv : process.argv.slice(0, 2).concat(
    '--root', '/server', '--port', '8000', '--service-name', 'extension-demo', '--connection-string=w19-dev21-v:6110'
);
if (!hasConnectionString) console.log('[hyperion] Usando connection string por defecto: w19-dev21-v:6110 (para otro host/puerto pasa --connection-string=HOST:PUERTO).');

var hyperionMiddleware;
try {
    const hm = require('@magaya/hyperion-express-middleware');
    hyperionMiddleware = hm.middleware(argv, {
        clientId: 'example-extension',
        apiKey: '123456'
    });
} catch (err) {
    console.error('[hyperion] Error al cargar middleware (el servidor seguirá; las rutas API devolverán 503):', err.message);
    hyperionMiddleware = function (req, res, next) {
        req.dbx = null;
        req.dbw = null;
        req.algorithm = null;
        next();
    };
}

app.use(hyperionMiddleware);
app.use(express.json());

// Rutas por tema: /server/entities*, /server/acctransactions*, /server/test, /server/bills, /server/rep-bug
const routes = require('./routes');
app.use('/server', routes);

app.listen(8000, () => {
    console.log('Server started on port 8000...');
    process.exitCode = 0;
});

process.on('uncaughtException', function (err) {
    console.error('[hyperion] uncaughtException:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
});
process.on('unhandledRejection', function (reason, p) {
    console.error('[hyperion] unhandledRejection:', reason);
    process.exitCode = 1;
});
process.on('SIGINT', function () { process.exit(0); });
process.on('SIGTERM', function () { process.exit(0); });
