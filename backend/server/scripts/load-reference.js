// Загрузка справочников из data/*.csv в БД (можно запускать повторно): npm run db:reference
const pool = require('../db');
const { readDictFile } = require('../reference');
(async () => {
  for (const [table, file] of [['professions', 'professions.csv'], ['company_industries', 'company_industries.csv']])
    for (const r of readDictFile(file))
      await pool.query(`INSERT INTO ${table} (id, name, is_agricultural) VALUES ($1,$2,$3)
                        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_agricultural = EXCLUDED.is_agricultural`, [r.id, r.name, r.is_agricultural]);
  console.log('Справочники загружены');
  await pool.end();
})().catch(e => { console.error('Ошибка:', e.code || e.message); process.exit(1); });
