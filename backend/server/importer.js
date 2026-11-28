// Импорт CSV и сохранение заявок.
const { parseCsv } = require('./csv');
const { COLUMNS, contextFromDb } = require('./reference');
const { validateApplication } = require('./validate');

const EXTRA_COLUMNS = ['purpose_details', 'profession_details', 'profession_classification', 'company_industry_details', 'company_industry_classification'];
const COLS = ['client_type', 'product_type', 'region', 'profession', 'workplace', 'income', 'company_industry',
  'company_size', 'company_revenue', 'loan_amount', 'loan_term', 'purpose', ...EXTRA_COLUMNS];
const MAX_ERRORS = 200;     // сколько ошибок возвращать в ответе (счётчики считаются по всем)

// Чистая часть (без БД): разбор файла + проверка строк. Повтор ID внутри файла отклоняется
// (первое корректное появление принимается, отклонённая строка ID не резервирует).
function validateCsv(buffer, ctx) {
  const seen = new Set();
  return parseCsv(buffer, COLUMNS, EXTRA_COLUMNS).map(({ line, record }) => {
    const { errors, value } = validateApplication(record, ctx, { fromCsv: true });
    if (!errors.length) {
      if (seen.has(value.id)) errors.push({ field: 'id', code: 'duplicate_id', message: 'Повтор ID внутри файла' });
      else seen.add(value.id);
    }
    return { line, errors, value };
  });
}

// Вставка. Если id уже есть в БД — ничего не вставляем и возвращаем null.
async function insertApplication(db, v) {
  const cols = [...(v.id ? ['id'] : []), ...COLS, ...(v.created_at ? ['created_at'] : [])];
  const ph = cols.map((_, i) => '$' + (i + 1)).join(', ');
  const values = cols.map(c => (v[c] === '' ? null : v[c]));

  const r = await db.query(
    `INSERT INTO applications (${cols.join(', ')}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING RETURNING id`,
    values
  );
  return r.rows[0]?.id ?? null;
}

async function importCsv(buffer, pool) {
  const rows = validateCsv(buffer, await contextFromDb(pool));       // ошибка файла -> исключение, БД не трогаем
  const rejections = [];
  const reject = (line, e) => rejections.push({ row: line, field: e.field, code: e.code, message: e.message });
  for (const { line, errors } of rows) if (errors.length) reject(line, errors[0]);

  // Единый порядок ID уменьшает риск взаимной блокировки двух импортов.
  // Номер строки остаётся исходным, чтобы отчёт ссылался на строки загруженного файла.
  const validRows = rows.filter(row => !row.errors.length).sort((a, b) => a.value.id - b.value.id);
  let accepted = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { line, value } of validRows) {
      const id = await insertApplication(client, value);
      if (id === null) reject(line, { field: 'id', code: 'duplicate_id', message: 'Заявка с таким ID уже есть, она не перезаписана' });
      else accepted++;
    }
    // Автоматические id формы не должны попасть на занятые импортом.
    await client.query(`SELECT setval(pg_get_serial_sequence('applications','id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM applications), 100000))`);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  rejections.sort((a, b) => a.row - b.row);
  const result = { accepted, rejected: rejections.length, errors: rejections.slice(0, MAX_ERRORS) };
  if (rejections.length > MAX_ERRORS) result.errors_truncated = true;
  return result;
}

module.exports = { validateCsv, importCsv, insertApplication };
