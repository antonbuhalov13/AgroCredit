// Проверяем порядок вставок и отчёта отдельно от блокировок PostgreSQL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { importCsv } = require('./importer');
const { readDictFile } = require('./reference');

const [header, ...control] = fs.readFileSync(path.join(__dirname, '../../analytics/data/control_applications.csv'), 'utf8')
  .trim().split(/\r?\n/);
const csv = rows => Buffer.from([header, ...rows, ''].join('\r\n'));

function fakePool(existing = []) {
  const existingIds = new Set(existing);
  const attempted = [];
  const client = {
    async query(sql, values) {
      if (!sql.startsWith('INSERT')) return { rows: [] };
      const id = values[0];
      attempted.push(id);
      if (existingIds.has(id)) return { rows: [] };
      existingIds.add(id);
      return { rows: [{ id }] };
    },
    release() {},
  };
  return {
    attempted,
    pool: {
      async connect() { return client; },
      async query(sql) {
        const file = sql.includes('FROM professions') ? 'professions.csv' : 'company_industries.csv';
        return { rows: readDictFile(file) };
      },
    },
  };
}

test('импорт пытается вставить заявки по возрастанию ID, даже если CSV отсортирован обратно', async () => {
  const { pool, attempted } = fakePool();
  assert.deepEqual(await importCsv(csv([...control].reverse()), pool), { accepted: 14, rejected: 0, errors: [] });
  assert.deepEqual(attempted, control.map(row => Number(row.split(';', 1)[0])).sort((a, b) => a - b));
});

test('дубликаты в БД отображаются с исходными номерами строк CSV', async () => {
  const { pool } = fakePool([1001, 1005, 1010]);
  const reversed = [...control].reverse();
  const result = await importCsv(csv(reversed), pool);
  assert.equal(result.accepted, 11);
  assert.equal(result.rejected, 3);
  assert.deepEqual(result.errors.map(({ row, code }) => [row, code]), [1010, 1005, 1001].map(id => [
    reversed.findIndex(line => line.startsWith(id + ';')) + 2, 'duplicate_id',
  ]));
});

test('ошибки валидации и дубли в БД сортируются до ограничения отчёта 200 строками', async () => {
  const { pool } = fakePool([1001]);
  const invalid = control[0].split(';');
  invalid[header.split(';').indexOf('loan_amount')] = '0';
  const rows = [control[0], ...Array(200).fill(invalid.join(';')), control[1]];
  const result = await importCsv(csv(rows), pool);
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 201);
  assert.equal(result.errors_truncated, true);
  assert.equal(result.errors.length, 200);
  assert.equal(result.errors[0].code, 'duplicate_id');
  assert.equal(result.errors[1].code, 'invalid_loan_amount');
  assert.deepEqual(result.errors.map(error => error.row), Array.from({ length: 200 }, (_, i) => i + 2));
});
