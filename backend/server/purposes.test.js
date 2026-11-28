const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { reference, contextFromFiles, COLUMNS } = require('./reference');
const { validateApplication } = require('./validate');
const { validateCsv, insertApplication } = require('./importer');

const ctx = contextFromFiles();
const base = { client_type: 'individual', product_type: 'auto', purpose: 'car_purchase',
  region: 'Краснодарский край', profession: 1, workplace: 'Тест', income: '50000', loan_amount: '100000', loan_term: 12 };
const codes = raw => validateApplication(raw, ctx).errors.map(error => error.code);

test('цели согласованы с продуктом для физлиц и предприятий', () => {
  assert.deepEqual(codes(base), []);
  assert.ok(codes({ ...base, purpose: 'home_repair' }).includes('incompatible_purpose'));
  assert.ok(codes({ ...base, purpose: 'education' }).includes('incompatible_purpose'));
  for (const [product, allowed] of Object.entries(reference.product_purposes.company)) {
    for (const purpose of ['equipment_purchase', 'sowing', 'working_capital']) {
      const company = { client_type: 'company', product_type: product, purpose, region: base.region,
        company_industry: 1, company_size: 'small', company_revenue: '1000000', loan_amount: '100000', loan_term: 12 };
      assert.equal(codes(company).includes('incompatible_purpose'), !allowed.includes(purpose));
    }
  }
});

test('все продукты принимают свои цели и отклоняют несовместимые', () => {
  for (const type of ['individual', 'company']) {
    assert.equal(Object.keys(reference.products[type]).length, 6);
    for (const product of Object.keys(reference.products[type])) {
      const allowed = reference.product_purposes[type][product];
      assert.ok(allowed.includes('other'));
      assert.ok(allowed.some(code => code !== 'other'));
      for (const purpose of Object.keys(reference.purposes[type])) {
        const raw = type === 'individual' ? { ...base } : {
          client_type: 'company', region: base.region, company_industry: 1, company_size: 'small',
          company_revenue: '1000000', loan_amount: '100000', loan_term: 12,
        };
        Object.assign(raw, { product_type: product, purpose });
        if (purpose === 'other') raw.purpose_details = 'Иная подходящая цель';
        const result = validateApplication(raw, ctx);
        assert.equal(result.errors.length === 0, allowed.includes(purpose), `${type}/${product}/${purpose}`);
      }
    }
  }
});

test('своя цель обязательна, ограничена по длине и не допускает управляющие символы', () => {
  for (const text of [undefined, null, 12345, {}, '', '  ', 'аб', 'а'.repeat(201), 'Ремонт\nжилья', 'А\u200bвто']) {
    assert.ok(codes({ ...base, purpose: 'other', purpose_details: text }).includes('invalid_purpose_details'));
  }
  const valid = validateApplication({ ...base, purpose: 'other', purpose_details: '  Покупка прицепа  ' }, ctx);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.value.purpose_details, 'Покупка прицепа');
  assert.equal(valid.value.purpose, 'other');
  assert.equal(validateApplication(base, ctx).value.purpose_details, null);
  assert.ok(codes({ ...base, purpose_details: 'Лишний текст' }).includes('unexpected_purpose_details'));
});

test('«Другое» не обходит ограничения известной цели; известная допустимая цель нормализуется', () => {
  for (const text of ['Ремонт жилья', '  РЕМОНТ   ЖИЛЬЯ! ', 'home_repair', 'Образование', 'education', 'Покупка сельскохозяйственной техники']) {
    assert.ok(codes({ ...base, purpose: 'other', purpose_details: text }).includes('incompatible_purpose'), text);
  }
  const result = validateApplication({ ...base, purpose: 'other', purpose_details: 'Покупка автомобиля' }, ctx);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.purpose, 'car_purchase');
  assert.equal(result.value.purpose_details, null);
});

test('импорт сохраняет старый формат и проверяет дополнительный столбец своей цели', () => {
  const columns = [...COLUMNS, 'purpose_details'];
  const make = details => {
    const row = { ...base, id: 90001, created_at: '2026-03-01', purpose: 'other', purpose_details: details };
    return Buffer.from(columns.join(';') + '\n' + columns.map(key => row[key] ?? '').join(';') + '\n');
  };
  assert.deepEqual(validateCsv(make('Покупка прицепа'), ctx)[0].errors, []);
  assert.equal(validateCsv(make('Покупка прицепа'), ctx)[0].value.purpose_details, 'Покупка прицепа');
  assert.equal(validateCsv(make(''), ctx)[0].errors[0].code, 'invalid_purpose_details');
  assert.equal(validateCsv(make('Ремонт жилья'), ctx)[0].errors[0].code, 'incompatible_purpose');
});

test('своя цель передаётся в SQL параметром, без подстановки в текст запроса', async () => {
  const text = "Покупка прицепа'); DROP TABLE applications; --";
  const { value, errors } = validateApplication({ ...base, purpose: 'other', purpose_details: text }, ctx);
  assert.deepEqual(errors, []);
  let call;
  await insertApplication({ async query(sql, parameters) { call = { sql, parameters }; return { rows: [{ id: 42 }] }; } }, value);
  assert.ok(call.sql.includes('purpose_details'));
  assert.ok(!call.sql.includes(text));
  assert.ok(call.parameters.includes(text));
});

// Проверяем реальный код формы без запуска браузера. DOM-объекты моделируют только используемые API.
function openForm() {
  class Element {
    constructor() { this.value = ''; this.disabled = false; this.hidden = false; this.listeners = {}; this.dataset = {}; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    replaceChildren(...children) { this.children = children; this.value = children[0]?.value ?? ''; }
    querySelector() { return new Element(); }
  }
  const elements = Object.fromEntries(['client_type', 'product_type', 'purpose', 'purpose_details', 'region',
    'profession_name', 'profession_classification', 'company_industry_name',
    'company_industry_classification', 'company_size'].map(name => [name, new Element()]));
  elements.client_type.value = 'individual';
  const nodes = new Map();
  const form = new Element();
  form.elements = elements;
  nodes.set('#application', form);
  const sandbox = vm.createContext({
    document: { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, new Element()); return nodes.get(selector); },
      querySelectorAll() { return []; } },
    agroApi: { enabled: false },
    Option: class { constructor(label, value) { this.label = label; this.value = value; } },
    TextDecoder,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../frontend/js/data.js'), 'utf8'), sandbox);
  return { sandbox, elements, nodes, run: code => vm.runInContext(code, sandbox) };
}

test('форма фильтрует цели, включает обязательное поле и сбрасывает его при смене продукта/типа', () => {
  const { elements, nodes } = openForm();
  assert.equal(elements.purpose.disabled, true);
  elements.product_type.value = 'auto';
  elements.product_type.listeners.change();
  assert.deepEqual(elements.purpose.children.map(item => item.value), ['', 'car_purchase', 'other']);
  elements.purpose.value = 'other';
  elements.purpose.listeners.change();
  assert.equal(elements.purpose_details.required, true);
  assert.equal(elements.purpose_details.disabled, false);
  assert.equal(nodes.get('#purpose-details-field').hidden, false);
  elements.purpose_details.value = 'Покупка прицепа';
  elements.product_type.value = 'consumer';
  elements.product_type.listeners.change();
  assert.equal(elements.purpose.value, '');
  assert.equal(elements.purpose_details.value, '');
  assert.equal(elements.purpose_details.disabled, true);
  assert.equal(elements.purpose_details.required, false);
  elements.client_type.value = 'company';
  elements.client_type.listeners.change();
  assert.equal(elements.product_type.value, '');
  assert.equal(elements.purpose.disabled, true);
});

test('демосправочник формы совпадает с сервером; клиент отклоняет несовместимую свою цель', () => {
  const { run } = openForm();
  assert.deepEqual(JSON.parse(run('JSON.stringify(catalog.product_purposes)')), reference.product_purposes);
  assert.deepEqual(JSON.parse(run('JSON.stringify(catalog.products)')), reference.products);
  assert.deepEqual(JSON.parse(run('JSON.stringify(catalog.purposes)')), reference.purposes);
  const record = { ...base, purpose: 'other', purpose_details: 'Ремонт жилья' };
  assert.match(run(`validate(${JSON.stringify(record)})`), /не соответствует/);
  assert.equal(run(`validate(${JSON.stringify({ ...record, purpose_details: 'Покупка прицепа' })})`), '');
});

test('свои цели учитываются в аналитике одной категорией other', async () => {
  const { fixturePool } = await import('../../analytics/scripts/lib/analytics-fixture.mjs');
  const { getAnalytics } = await import('../../analytics/analytics/service.mjs');
  const rows = [1, 2].map(id => ({ ...Object.fromEntries(COLUMNS.map(key => [key, ''])), ...base, id, created_at: '2026-03-01', purpose: 'other',
    purpose_details: id === 1 ? 'Покупка прицепа' : 'Покупка микроавтобуса' }));
  const fixture = await fixturePool(rows);
  try {
    const result = await getAnalytics(fixture.pool, { client_type: 'individual', date_from: '2026-03-01', date_to: '2026-03-31' });
    assert.equal(result.metrics.count, 2);
    const purposes = result.distributions.filter(row => row.dimension === 'purpose');
    assert.equal(purposes.length, 1);
    assert.equal(purposes[0].category, 'other');
    assert.equal(purposes[0].count, 2);
    assert.equal(purposes[0].share_pct, 100);
    assert.equal(result.monthly[0].count, 2);
    assert.ok(!JSON.stringify(result).includes('Покупка прицепа'));
  } finally { fixture.close(); }
});

test('новые продукты участвуют в аналитике физлиц и предприятий', async () => {
  const { fixturePool } = await import('../../analytics/scripts/lib/analytics-fixture.mjs');
  const { getAnalytics } = await import('../../analytics/analytics/service.mjs');
  for (const type of ['individual', 'company']) {
    const rows = Object.keys(reference.products[type]).map((product, index) => {
      const raw = type === 'individual' ? { ...base } : {
        client_type: 'company', region: base.region, company_industry: 1, company_size: 'small',
        company_revenue: '1000000', loan_amount: '100000', loan_term: 12,
      };
      Object.assign(raw, { product_type: product, purpose: reference.product_purposes[type][product][0] });
      const result = validateApplication(raw, ctx);
      assert.deepEqual(result.errors, []);
      return { ...result.value, id: index + 1, created_at: '2026-03-01' };
    });
    const fixture = await fixturePool(rows);
    try {
      const result = await getAnalytics(fixture.pool, { client_type: type, date_from: '2026-03-01', date_to: '2026-03-31' });
      assert.equal(result.metrics.count, 6);
      const products = result.distributions.filter(row => row.dimension === 'product_type');
      assert.deepEqual(products.map(row => row.category).sort(), Object.keys(reference.products[type]).sort());
      assert.ok(products.every(row => row.count === 1));
    } finally { fixture.close(); }
  }
});

test('своя профессия: обязательный текст и явный ответ, без изменения известных профессий', () => {
  const custom = { ...base, profession: 17, profession_details: 'Оператор доильной установки' };
  for (const choice of ['yes', 'no', 'unsure']) {
    const result = validateApplication({ ...custom, profession_classification: choice }, ctx);
    assert.deepEqual(result.errors, []);
    assert.equal(result.value.profession_classification, choice);
  }
  for (const bad of ['', null, true, false, 'agricultural']) {
    assert.ok(codes({ ...custom, profession_classification: bad }).includes('invalid_profession_classification'));
  }
  for (const text of ['', ' ', 'А', 123, 'а'.repeat(201), 'Оператор\nфермы']) {
    assert.ok(codes({ ...custom, profession_details: text, profession_classification: 'yes' }).includes('invalid_profession_details'));
  }
  assert.ok(codes({ ...base, profession_classification: 'yes' }).includes('unexpected_profession_classification'));
  assert.ok(codes({ ...base, profession_details: 'Лишний текст' }).includes('unexpected_profession_details'));
  assert.equal(validateApplication(base, ctx).value.profession_classification, null);
});

test('форма распознаёт названия из подсказок и запрашивает классификацию для нового текста', () => {
  const { elements, nodes, run } = openForm();
  for (const [type, field, known, custom, otherId] of [
    ['individual', 'profession', 'Агроном', 'Оператор фермы', 17],
    ['company', 'company_industry', 'Растениеводство', 'Выращивание грибов', 7],
  ]) {
    elements.client_type.value = type;
    elements.client_type.listeners.change();
    const input = elements[`${field}_name`];
    const classificationName = `${field}_classification`;
    const classification = elements[classificationName];
    const prefix = field.replaceAll('_', '-');
    const suggestions = nodes.get(`#${prefix}-options`).children;
    assert.ok(suggestions.some(option => option.value === known));
    assert.ok(!suggestions.some(option => option.value === 'Другое'));

    function inputRecord(text, choice) {
      const record = { client_type: type, [`${field}_name`]: text, [classificationName]: choice };
      return JSON.parse(run(`{ const record = ${JSON.stringify(record)}; applyCategoryToRecord(record); JSON.stringify(record); }`));
    }

    input.value = custom;
    input.listeners.input();
    assert.equal(nodes.get(`#${prefix}-extra`).hidden, false);
    assert.equal(classification.required, true);
    assert.equal(classification.value, '');
    assert.deepEqual(inputRecord(` ${custom} `, 'yes'), {
      client_type: type, [field]: otherId, [`${field}_details`]: custom, [classificationName]: 'yes',
    });

    classification.value = 'yes';
    input.value = `${custom} и другое`;
    input.listeners.input();
    assert.equal(classification.value, '');
    input.value = ` ${known.toUpperCase()} `;
    input.listeners.change();
    assert.equal(nodes.get(`#${prefix}-extra`).hidden, true);
    assert.equal(classification.disabled, true);
    assert.deepEqual(inputRecord(input.value, 'yes'), { client_type: type, [field]: '1' });
  }
});

test('CSV: своя профессия и классификация сохраняются, пропущенный ответ отклоняется', () => {
  const columns = [...COLUMNS, 'purpose_details', 'profession_details', 'profession_classification'];
  const row = { ...base, id: 90001, created_at: '2026-03-01', profession: 17,
    profession_details: 'Оператор доильной установки', profession_classification: 'yes' };
  const make = raw => Buffer.from(columns.join(';') + '\n' + columns.map(key => raw[key] ?? '').join(';') + '\n');
  const [result] = validateCsv(make(row), ctx);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.profession_details, row.profession_details);
  assert.equal(result.value.profession_classification, 'yes');
  assert.equal(validateCsv(make({ ...row, profession_classification: '' }), ctx)[0].errors[0].code, 'invalid_profession_classification');
});

test('аграрная статистика: Да включается, Нет и Не уверен остаются в общем числе; фильтр Другое работает', async () => {
  const { fixturePool } = await import('../../analytics/scripts/lib/analytics-fixture.mjs');
  const { getAnalytics } = await import('../../analytics/analytics/service.mjs');
  const raw = [base, ...['yes', 'yes', 'no', 'unsure'].map(choice => ({ ...base, profession: 17,
    profession_details: 'Оператор фермы', profession_classification: choice })), { ...base, profession: 5 }];
  const rows = raw.map((record, index) => ({ ...validateApplication(record, ctx).value, id: index + 1, created_at: '2026-03-01' }));
  const fixture = await fixturePool(rows);
  const filters = { client_type: 'individual', date_from: '2026-03-01', date_to: '2026-03-31' };
  try {
    const all = await getAnalytics(fixture.pool, filters);
    assert.equal(all.metrics.count, 3);
    assert.equal(all.metrics.all_individual_count, 6);
    assert.equal(all.metrics.agricultural_share_pct, 50);
    assert.equal(all.monthly[0].count, 3);
    assert.equal(all.distributions.find(row => row.dimension === 'profession' && row.category === '17').count, 2);
    assert.equal(all.monthly_structure.find(row => row.category === '17').count, 2);
    const custom = await getAnalytics(fixture.pool, { ...filters, profession: 17 });
    assert.equal(custom.metrics.count, 2);
    assert.equal(custom.metrics.all_individual_count, 6);
    assert.equal(custom.monthly[0].count, 2);
    assert.equal(custom.distributions.find(row => row.dimension === 'profession').category, '17');
    assert.deepEqual(custom.monthly_structure.map(row => row.category), ['17']);
    assert.equal((await getAnalytics(fixture.pool, { ...filters, profession: 1 })).metrics.count, 1);
  } finally { fixture.close(); }
});

test('своя сфера предприятия проверяется и попадает в аграрную аналитику только при ответе Да', async () => {
  const { fixturePool } = await import('../../analytics/scripts/lib/analytics-fixture.mjs');
  const { getAnalytics } = await import('../../analytics/analytics/service.mjs');
  const otherId = reference.other_company_industry_id;
  const company = { client_type: 'company', product_type: 'investment', purpose: 'equipment_purchase',
    region: base.region, company_industry: 1, company_size: 'small', company_revenue: '1000000',
    loan_amount: '100000', loan_term: 12 };
  const custom = { ...company, company_industry: otherId, company_industry_details: 'Выращивание грибов' };
  assert.deepEqual(codes({ ...custom, company_industry_details: '' }), ['invalid_company_industry_details', 'invalid_company_industry_classification']);
  assert.deepEqual(codes({ ...company, company_industry_classification: 'yes' }), ['unexpected_company_industry_classification']);
  const records = [company, ...['yes', 'no', 'unsure'].map(choice => ({ ...custom, company_industry_classification: choice }))];
  const rows = records.map((record, index) => {
    const result = validateApplication(record, ctx);
    assert.deepEqual(result.errors, []);
    return { ...result.value, id: index + 1, created_at: '2026-03-01' };
  });
  const fixture = await fixturePool(rows);
  const filters = { client_type: 'company', date_from: '2026-03-01', date_to: '2026-03-31' };
  try {
    assert.equal((await getAnalytics(fixture.pool, filters)).metrics.count, 2);
    const result = await getAnalytics(fixture.pool, { ...filters, company_industry: otherId });
    assert.equal(result.metrics.count, 1);
    assert.equal(result.monthly[0].count, 1);
    assert.equal(result.distributions.find(row => row.dimension === 'company_industry').category, String(otherId));
    assert.deepEqual(result.monthly_structure.map(row => row.category), [String(otherId)]);
  } finally { fixture.close(); }
});
