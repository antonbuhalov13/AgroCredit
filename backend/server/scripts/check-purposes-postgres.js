// Проверка HTTP + PostgreSQL во временных таблицах одной сессии. Рабочие заявки не изменяются.
const assert = require('node:assert/strict');
const pool = require('../db');
const { COLUMNS } = require('../reference');

async function check() {
  const client = await pool.connect();
  let server;
  try {
    await client.query(`
      CREATE TEMP TABLE professions AS SELECT * FROM public.professions;
      CREATE TEMP TABLE company_industries AS SELECT * FROM public.company_industries;
      CREATE TEMP TABLE applications (LIKE public.applications INCLUDING ALL);
    `);
    // Все маршруты и модуль аналитики используют одну изолированную сессию.
    pool.query = client.query.bind(client);
    pool.connect = async () => ({ query: client.query.bind(client), release() {} });
    const app = require('../app');
    server = await new Promise(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
    const post = (route, body) => fetch(baseUrl + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const dictionaries = await (await fetch(baseUrl + '/dictionaries')).json();
    assert.deepEqual(dictionaries.product_purposes.individual.auto, ['car_purchase', 'other']);
    assert.equal(dictionaries.purposes.individual.other, 'Другое');
    const record = { client_type: 'individual', product_type: 'auto', purpose: 'other', purpose_details: 'Покупка прицепа',
      region: 'Краснодарский край', profession: 1, workplace: 'Тест', income: '50000', loan_amount: '100000', loan_term: 12 };
    for (const bad of [{ purpose: 'home_repair', purpose_details: '' }, { purpose_details: '' }, { purpose_details: 'Ремонт жилья' }]) {
      assert.equal((await post('/applications', { ...record, ...bad })).status, 400);
    }
    assert.equal((await client.query('SELECT count(*) FROM applications')).rows[0].count, '0');
    const response = await post('/applications', record);
    assert.equal(response.status, 201);
    const { id } = await response.json();
    const stored = await client.query('SELECT purpose, purpose_details FROM applications WHERE id = $1', [id]);
    assert.deepEqual(stored.rows[0], { purpose: 'other', purpose_details: 'Покупка прицепа' });
    const csvColumns = [...COLUMNS, 'purpose_details'];
    const csvRecord = { ...record, id: 800001, created_at: '2026-03-01', purpose_details: 'Покупка микроавтобуса' };
    const csv = csvColumns.join(';') + '\n' + csvColumns.map(key => csvRecord[key] ?? '').join(';') + '\n';
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'test.csv');
    const uploaded = await fetch(baseUrl + '/upload', { method: 'POST', body: form });
    assert.equal(uploaded.status, 200);
    assert.equal((await uploaded.json()).accepted, 1);
    const analytics = await post('/analytics', { client_type: 'individual', date_from: '2026-01-01', date_to: '2030-12-31' });
    assert.equal(analytics.status, 200);
    const result = await analytics.json();
    assert.equal(result.metrics.count, 2);
    const purposes = result.distributions.filter(row => row.dimension === 'purpose');
    assert.equal(purposes.length, 1);
    assert.equal(purposes[0].category, 'other');
    assert.equal(purposes[0].count, 2);
    assert.equal(purposes[0].share_pct, 100);
    assert.equal(dictionaries.other_profession_id, 17);
    const custom = { ...record, profession: 17, profession_details: 'Оператор доильной установки' };
    for (const choice of ['yes', 'no', 'unsure']) {
      const saved = await post('/applications', { ...custom, profession_classification: choice });
      assert.equal(saved.status, 201);
      const savedId = (await saved.json()).id;
      const row = (await client.query('SELECT profession_details, profession_classification FROM applications WHERE id = $1', [savedId])).rows[0];
      assert.deepEqual(row, { profession_details: custom.profession_details, profession_classification: choice });
    }
    for (const bad of [custom, { ...custom, profession_details: '', profession_classification: 'yes' }, { ...record, profession_classification: 'yes' }]) {
      assert.equal((await post('/applications', bad)).status, 400);
    }
    const all = await (await post('/analytics', { client_type: 'individual', date_from: '2026-01-01', date_to: '2030-12-31' })).json();
    assert.equal(all.metrics.count, 3);
    assert.equal(all.metrics.all_individual_count, 5);
    assert.equal(all.metrics.agricultural_share_pct, 60);
    assert.equal(all.monthly.reduce((sum, row) => sum + row.count, 0), 3);
    const customOnly = await post('/analytics', { client_type: 'individual', date_from: '2026-01-01', date_to: '2030-12-31', profession: 17 });
    assert.equal(customOnly.status, 200);
    const other = await customOnly.json();
    assert.equal(other.metrics.count, 1);
    assert.equal(other.metrics.all_individual_count, 5);
    assert.equal(other.distributions.find(row => row.dimension === 'profession').category, '17');
    assert.ok(other.monthly_structure.every(row => row.category === '17'));
    assert.equal((await client.query('SELECT is_agricultural FROM professions WHERE id = 17')).rows[0].is_agricultural, false);
    await assert.rejects(client.query("INSERT INTO applications (client_type, product_type, region, profession, workplace, income, loan_amount, loan_term, purpose) VALUES ('individual', 'auto', 'Тест', 17, 'Тест', 100, 100, 12, 'car_purchase')"), error => error.code === '23514');
    await assert.rejects(client.query("INSERT INTO applications (client_type, product_type, region, loan_amount, loan_term, purpose) VALUES ('individual', 'auto', 'Тест', 100, 12, 'other')"), error => error.code === '23514');

    assert.equal(dictionaries.other_company_industry_id, 7);
    const company = { client_type: 'company', product_type: 'investment', purpose: 'equipment_purchase',
      region: record.region, company_industry: 7, company_industry_details: 'Выращивание грибов',
      company_size: 'small', company_revenue: '1000000', loan_amount: '100000', loan_term: 12 };
    assert.equal((await post('/applications', company)).status, 400);
    for (const choice of ['yes', 'no', 'unsure']) {
      const saved = await post('/applications', { ...company, company_industry_classification: choice });
      assert.equal(saved.status, 201);
      const savedId = (await saved.json()).id;
      const stored = await client.query('SELECT company_industry_details, company_industry_classification FROM applications WHERE id = $1', [savedId]);
      assert.deepEqual(stored.rows[0], { company_industry_details: company.company_industry_details, company_industry_classification: choice });
    }
    const companyCsvColumns = [...csvColumns, 'profession_details', 'profession_classification', 'company_industry_details', 'company_industry_classification'];
    const companyCsvRecord = { ...company, id: 800010, created_at: '2026-03-01', company_industry_classification: 'yes' };
    const companyCsv = companyCsvColumns.join(';') + '\n' + companyCsvColumns.map(key => companyCsvRecord[key] ?? '').join(';') + '\n';
    const companyForm = new FormData();
    companyForm.append('file', new Blob([companyCsv], { type: 'text/csv' }), 'company-test.csv');
    const companyUpload = await fetch(baseUrl + '/upload', { method: 'POST', body: companyForm });
    assert.equal(companyUpload.status, 200);
    assert.equal((await companyUpload.json()).accepted, 1);
    const companyAnalytics = await post('/analytics', { client_type: 'company', date_from: '2026-01-01', date_to: '2030-12-31', company_industry: 7 });
    assert.equal(companyAnalytics.status, 200);
    const companyResult = await companyAnalytics.json();
    assert.equal(companyResult.metrics.count, 2);
    assert.equal(companyResult.distributions.find(row => row.dimension === 'company_industry').category, '7');
    assert.equal(companyResult.monthly.reduce((sum, row) => sum + row.count, 0), 2);
    await assert.rejects(client.query(`UPDATE applications SET company_industry_classification = NULL WHERE id = $1`, [companyCsvRecord.id]), error => error.code === '23514');
    console.log('HTTP + PostgreSQL: цели, свои профессии и сферы предприятий, CSV, аналитика и ограничения БД проверены.');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    client.release(true); // временные таблицы удаляются вместе с сессией
    await pool.end();
  }
}

check().catch(error => { console.error(error); process.exitCode = 1; });
