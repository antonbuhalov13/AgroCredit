// npm test — проверки без БД на файлах из data/: правила ввода и разбор CSV.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { contextFromFiles } = require('./reference');
const { validateCsv } = require('./importer');
const { validateApplication } = require('./validate');
const { CsvFileError } = require('./csv');

const ctx = contextFromFiles();
const data = f => fs.readFileSync(path.join(__dirname, '..', '..', 'analytics', 'data', f));

test('контрольный набор: 14 из 14 принимаются', () => {
  const rows = validateCsv(data('control_applications.csv'), ctx);
  assert.strictEqual(rows.length, 14); assert.ok(rows.every(r => !r.errors.length));
});
test('демонстрационный набор: 300 из 300 принимаются', () => {
  const rows = validateCsv(data('demo_applications.csv'), ctx);
  assert.strictEqual(rows.length, 300); assert.ok(rows.every(r => !r.errors.length));
});
test('файл с ошибками: коды и номера строк как в invalid-expected.json', () => {
  const exp = JSON.parse(data('invalid-expected.json'));
  const rows = validateCsv(data('invalid_applications.csv'), ctx);
  assert.strictEqual(rows.length, exp.total);
  for (const e of exp.rows) {
    const got = rows.find(r => r.line === e.line);
    assert.strictEqual(got.errors[0]?.code ?? null, e.code, `строка ${e.line}`);
  }
  assert.strictEqual(rows.filter(r => !r.errors.length).length, exp.accepted);
});
test('ошибки файла: заголовок, кавычки, число полей, пустая строка, кодировка', () => {
  const head = fs.readFileSync(path.join(__dirname, '..', '..', 'analytics', 'data', 'control_applications.csv'), 'utf8').split(/\r?\n/)[0];
  const bad = {
    INVALID_HEADER: 'id;client_type\n1;individual\n', INVALID_COLUMNS: head + '\n1;individual\n',
    INVALID_QUOTES: head + '\n"1;individual;;;;;;;;;;;;\n', EMPTY_LINE: head + '\n' + ';'.repeat(13) + '\n\n' + ';'.repeat(13) + '\n'
  };
  for (const [code, text] of Object.entries(bad)) assert.throws(() => validateCsv(Buffer.from(text), ctx), e => e instanceof CsvFileError && e.code === code, code);
  assert.throws(() => validateCsv(Buffer.from([0xff, 0xfe, 0x41]), ctx), e => e.code === 'INVALID_ENCODING');
});
test('BOM и пустые строки в конце допускаются', () => {
  const buf = Buffer.concat([Buffer.from('\uFEFF'), data('control_applications.csv'), Buffer.from('\r\n\r\n')]);
  assert.strictEqual(validateCsv(buf, ctx).length, 14);
});
test('форма: JSON-числа, id и дату назначает сервер', () => {
  const ok = { client_type: 'individual', product_type: 'consumer', region: 'Краснодарский край', purpose: 'education', loan_amount: 100000.5, loan_term: 12, profession: 1, workplace: 'СИНТЕТИКА: тест', income: 0 };
  assert.deepStrictEqual(validateApplication(ok, ctx).errors, []);
  assert.deepStrictEqual(validateApplication({ ...ok, id: 5 }, ctx).errors.map(e => e.code), ['unexpected_id']);
  assert.deepStrictEqual(validateApplication({ ...ok, loan_amount: 0.1 + 0.2 }, ctx).errors.map(e => e.code), ['invalid_loan_amount']); // >2 знаков
  assert.deepStrictEqual(validateApplication({ ...ok, income: '' }, ctx).errors.map(e => e.code), ['invalid_income']);              // пропуск != 0
  assert.deepStrictEqual(validateApplication({ ...ok, loan_amount: '1e5' }, ctx).errors.map(e => e.code), ['invalid_loan_amount']);
});
