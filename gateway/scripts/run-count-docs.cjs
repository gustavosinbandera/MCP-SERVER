require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { countDocs } = require('../dist/search');
countDocs()
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch((e) => { console.error(e.message || e); process.exit(1); });
