/**
 * Prueba el endpoint GET /server/bills.
 * Ejecutar con: node test-bills-request.js
 * (El servidor debe estar corriendo en el puerto 8000.)
 */
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 8000,
    path: '/server/bills',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Status:', res.statusCode);
            console.log('Count:', json.count);
            console.log('Bills:', JSON.stringify(json.bills, null, 2));
            process.exit(res.statusCode >= 400 ? 1 : 0);
        } catch (e) {
            console.error('Response not JSON:', data.substring(0, 200));
            process.exit(1);
        }
    });
});

req.on('error', (err) => {
    console.error('Request error:', err.message);
    process.exit(1);
});

req.setTimeout(10000, () => {
    req.destroy();
    console.error('Timeout');
    process.exit(1);
});

req.end();
