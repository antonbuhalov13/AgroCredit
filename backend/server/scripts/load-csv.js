// Загрузка CSV из консоли: npm run load -- data/control_applications.csv
const fs = require('fs');
const pool = require('../db');
const { importCsv } = require('../importer');
importCsv(fs.readFileSync(process.argv[2]), pool)
  .then(r => { console.log(r); return pool.end(); })
  .catch(e => { console.error(e.code || '', e.message); process.exit(1); });
