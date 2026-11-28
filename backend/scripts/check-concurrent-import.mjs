// Запускать только в отдельной локальной БД agrocredit_concurrency.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const require = createRequire(import.meta.url);
const { COLUMNS, readDictFile } = require('../server/reference');
const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
assert.equal(DB_HOST, '127.0.0.1', 'Укажите адрес отдельной локальной БД');
assert.equal(DB_NAME, 'agrocredit_concurrency');
assert.ok(Number(DB_PORT) > 0 && DB_USER && DB_PASSWORD, 'Нужны явные настройки подключения');

const connection = {
  host: DB_HOST, port: Number(DB_PORT), database: DB_NAME, user: DB_USER,
  password: DB_PASSWORD, connectionTimeoutMillis: 4000,
};
const schemaName = 'import_check_' + randomBytes(6).toString('hex');
const form = {
  client_type: 'individual', product_type: 'consumer', region: 'Краснодарский край',
  profession: 1, workplace: 'СИНТЕТИКА: тест импорта', income: '10000',
  loan_amount: '1000', loan_term: 12, purpose: 'home_repair',
};
const observer = new pg.Client(connection);
let date;
let appPool;
let server;

async function request(route, body, headers) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${route}`, {
    method: 'POST', body, headers, signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() };
}

function upload(records) {
  const lines = records.map(([id, amount]) => COLUMNS.map(key => {
    const row = { ...form, id, loan_amount: amount, created_at: date };
    return row[key] ?? '';
  }).join(';'));
  const data = new FormData();
  data.append('file', new Blob([[COLUMNS.join(';'), ...lines].join('\n') + '\n']), 'synthetic.csv');
  return request('upload', data);
}

function postForm() {
  return request('applications', JSON.stringify(form), { 'Content-Type': 'application/json' });
}

async function readRows(ids) {
  const result = await observer.query(
    'SELECT id, loan_amount::integer AS amount FROM applications WHERE id = ANY($1) ORDER BY id', [ids],
  );
  return result.rows.map(({ id, amount }) => [id, amount]);
}

// Запись без COMMIT удерживает запросы на уникальном ключе. Сначала убеждаемся,
// что обе HTTP-операции действительно ждут в PostgreSQL, затем отпускаем их.
async function overlap(gateId, startRequests, waitForFirst = false) {
  const gate = new pg.Client(connection);
  await gate.connect();
  const pending = [];
  const track = promise => { pending.push(promise); promise.catch(() => {}); };
  const waitForLocks = async expectedCount => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const { rows: [locks] } = await observer.query(`
        SELECT count(*)::integer AS total,
               coalesce(bool_or($1 = ANY(pg_blocking_pids(pid))), false) AS gate_seen
        FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
      `, [gate.processID]);
      if (locks.total >= expectedCount && locks.gate_seen) return;
      await delay(40);
    }
    throw new Error('Не удалось подтвердить пересечение HTTP-операций в PostgreSQL');
  };
  try {
    await gate.query(`SET search_path TO ${schemaName}`);
    await gate.query('BEGIN');
    await gate.query(`
      INSERT INTO applications (id, client_type, product_type, region, profession,
        workplace, income, loan_amount, loan_term, purpose, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [gateId, form.client_type, form.product_type, form.region, form.profession,
      form.workplace, form.income, form.loan_amount, form.loan_term, form.purpose, date]);
    track(startRequests[0]());
    if (waitForFirst) await waitForLocks(1);
    track(startRequests[1]());
    await waitForLocks(2);
  } finally {
    await gate.end(); // Завершение сессии откатывает служебную заявку.
  }
  return Promise.all(pending);
}

function checkUpload(result, accepted, rejected) {
  assert.equal(result.status, 200);
  assert.equal(result.body.accepted, accepted);
  assert.equal(result.body.rejected, rejected);
  assert.equal(result.body.errors.length, rejected);
  assert.ok(result.body.errors.every(error => error.code === 'duplicate_id'));
}

async function checkAnalytics(expectedCount) {
  const result = await request('analytics', JSON.stringify({
    client_type: 'individual', date_from: date, date_to: date, region: form.region,
  }), { 'Content-Type': 'application/json' });
  assert.equal(result.status, 200);
  const { rows: [saved] } = await observer.query(
    'SELECT count(*)::integer AS count, round(avg(loan_amount), 2)::float8 AS mean FROM applications',
  );
  assert.equal(saved.count, expectedCount);
  assert.equal(result.body.metrics.count, expectedCount);
  assert.equal(result.body.metrics.all_individual_count, expectedCount);
  assert.equal(result.body.metrics.amount_mean, saved.mean);
  assert.equal(result.body.monthly[0].count, expectedCount);
}

await observer.connect();
try {
  const { rows: [identity] } = await observer.query(
    "SELECT current_database() AS name, (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date::text AS date",
  );
  assert.equal(identity.name, 'agrocredit_concurrency');
  date = identity.date;
  // Новая схема на каждый запуск оставляет предыдущие результаты доступными для разбора.
  await observer.query(`CREATE SCHEMA ${schemaName}`);
  await observer.query(`SET search_path TO ${schemaName}`);
  const schemaSql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await observer.query(schemaSql);
  for (const table of ['professions', 'company_industries']) {
    for (const { id, name, is_agricultural: agricultural } of readDictFile(`${table}.csv`)) {
      await observer.query(`INSERT INTO ${table} VALUES ($1, $2, $3)`, [id, name, agricultural]);
    }
  }
  process.env.PGOPTIONS = `-c search_path=${schemaName} -c statement_timeout=12000`;
  appPool = require('../server/db');
  server = require('../server/app').listen(0, '127.0.0.1');
  await once(server, 'listening');

  const duplicate = await overlap(41001, [
    () => upload([[41001, 1100], [41002, 1200]]),
    () => upload([[41001, 2100], [41003, 2300]]),
  ]);
  const winner = duplicate.findIndex(result => result.body.accepted === 2);
  assert.notEqual(winner, -1);
  checkUpload(duplicate[winner], 2, 0);
  checkUpload(duplicate[1 - winner], 1, 1);
  assert.deepEqual(await readRows([41001, 41002, 41003]), [
    [41001, winner === 0 ? 1100 : 2100], [41002, 1200], [41003, 2300],
  ]);
  await checkAnalytics(3);
  console.log('Два CSV с общим ID: 3 сохранены, 1 дубль, суммы и аналитика совпали.');

  const [imported, savedForm] = await overlap(100010, [
    () => upload([[100001, 3100], [100010, 3200]]),
    postForm,
  ], true);
  checkUpload(imported, 2, 0);
  assert.equal(savedForm.status, 201);
  const nextForm = await postForm();
  assert.equal(nextForm.status, 201);
  assert.ok(savedForm.body.id > 100010 && nextForm.body.id > savedForm.body.id);
  assert.deepEqual(await readRows([100001, 100010, savedForm.body.id, nextForm.body.id]),
    [[100001, 3100], [100010, 3200], [savedForm.body.id, 1000], [nextForm.body.id, 1000]]);
  await checkAnalytics(7);
  console.log(`CSV + форма: 2 строки CSV, ID формы ${savedForm.body.id}, следующий ID ${nextForm.body.id}.`);

  // Один и тот же набор ключей идёт в противоположном порядке.
  const reverse = await overlap(120002, [
    () => upload([[120001, 4100], [120002, 4200], [120003, 4300]]),
    () => upload([[120003, 5300], [120002, 5200], [120001, 5100]]),
  ]);
  await checkAnalytics(10);
  const stored = await readRows([120001, 120002, 120003]);
  const reverseWinner = reverse.findIndex(result => result.body.accepted === 3);
  assert.notEqual(reverseWinner, -1);
  checkUpload(reverse[reverseWinner], 3, 0);
  assert.deepEqual(stored.map(([, amount]) => amount),
    reverseWinner === 0 ? [4100, 4200, 4300] : [5100, 5200, 5300]);
  console.log('CSV с обратным порядком: HTTP ' + reverse.map(result => result.status).join(' / '));
  checkUpload(reverse[1 - reverseWinner], 0, 3);
  console.log('Все три сценария конкурентного импорта прошли.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (appPool) await appPool.end();
  await observer.end();
}
