// Автономная проверка учебных CSV. Не серверный импортёр и не API аналитики.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { columns, generateDemoRows, toCsv, monthCounts } from './generate-demo-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFile(path.join(root,'data',name),'utf8');
const json = async name => JSON.parse(await read(name));
const reference = await json('reference-values.json');

// Учитываем разделитель внутри кавычек и удвоенные кавычки.
function parseLine(line) {
  const fields = [];
  let value = '', quoted = false, closed = false;
  for (let i=0;i<line.length;i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i+1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else value += c;
    } else if (c === ';') { fields.push(value); value = ''; closed = false; }
    else if (c === '"' && value === '' && !closed) quoted = true;
    else {
      assert(!closed && c !== '"','Некорректные кавычки CSV');
      value += c;
    }
  }
  assert(!quoted,'Незакрытые кавычки CSV');
  fields.push(value);
  return fields;
}
async function csv(name, header) {
  const text = await read(name);
  assert.ok(text.startsWith('\uFEFF'), `${name}: для открытия в Excel нужен UTF-8 BOM`);
  const lines = text.slice(1).split(/\r?\n/);
  while (lines.at(-1) === '') lines.pop();
  assert.deepEqual(parseLine(lines.shift()),header,`${name}: заголовок`);
  return lines.map((line,index) => {
    assert(line !== '',`${name}: пустая строка ${index+2}`);
    const fields = parseLine(line);
    assert.equal(fields.length,header.length,`${name}: столбцы в строке ${index+2}`);
    return Object.fromEntries(header.map((key,i) => [key,fields[i]]));
  });
}
const dictionaryHeader = ['id','name','is_agricultural'];
const professions = await csv('professions.csv',dictionaryHeader);
const industries = await csv('company_industries.csv',dictionaryHeader);
for (const dictionary of [professions,industries]) {
  assert.equal(new Set(dictionary.map(r=>r.id)).size,dictionary.length,'Повтор ID справочника');
  assert.equal(new Set(dictionary.map(r=>r.name)).size,dictionary.length,'Повтор названия');
  assert(dictionary.every(r=>/^[1-9]\d*$/.test(r.id) && r.name && ['true','false'].includes(r.is_agricultural)));
}
const professionMap = new Map(professions.map(r=>[r.id,r]));
const industryMap = new Map(industries.map(r=>[r.id,r]));
assert.deepEqual(reference.columns,columns,'Порядок полей генератора и формата различается');

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
const positiveInt = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
const money = value => /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value) && Number.isFinite(Number(value));

function rowError(row, seen) {
  if (!positiveInt(row.id)) return 'invalid_id';
  if (!Object.hasOwn(reference.client_types,row.client_type)) return 'invalid_client_type';
  if (!reference.regions.includes(row.region)) return 'invalid_region';
  if (!Object.hasOwn(reference.products[row.client_type],row.product_type)) return 'invalid_product_type';
  if (!Object.hasOwn(reference.purposes[row.client_type],row.purpose)) return 'invalid_purpose';
  if (!money(row.loan_amount) || Number(row.loan_amount) <= 0) return 'invalid_loan_amount';
  if (!positiveInt(row.loan_term)) return 'invalid_loan_term';
  if (!validDate(row.created_at)) return 'invalid_created_at';
  if (row.client_type === 'individual') {
    if (!professionMap.has(row.profession)) return 'invalid_profession';
    if (!row.workplace || row.workplace.trim() !== row.workplace) return 'invalid_workplace';
    if (!money(row.income)) return 'invalid_income';
    for (const field of ['company_industry','company_size','company_revenue']) if (row[field] !== '') return `unexpected_${field}`;
  } else {
    if (!industryMap.has(row.company_industry)) return 'invalid_company_industry';
    if (!Object.hasOwn(reference.company_sizes,row.company_size)) return 'invalid_company_size';
    if (!money(row.company_revenue)) return 'invalid_company_revenue';
    for (const field of ['profession','workplace','income']) if (row[field] !== '') return `unexpected_${field}`;
  }
  if (Object.values(row).some(v => v.trim() !== v)) return 'unexpected_whitespace';
  if (seen.has(row.id)) return 'duplicate_id';
  return null;
}

const control = await csv('control_applications.csv',columns);
const demo = await csv('demo_applications.csv',columns);
const invalid = await csv('invalid_applications.csv',columns);
for (const [name,rows] of [['control',control],['demo',demo]]) {
  const seen = new Set();
  rows.forEach((row,index)=>{
    assert.equal(rowError(row,seen),null,`${name}, строка ${index+2}`);
    if (row.client_type === 'individual') assert(row.workplace.startsWith('СИНТЕТИКА:'),'Нет маркировки вымышленного места работы');
    seen.add(row.id);
  });
}
assert.equal(control.length,14);
assert.equal(demo.length,300);
assert.equal(new Set([...control,...demo].map(r=>r.id)).size,314,'Диапазоны ID пересекаются');
assert.equal(await read('demo_applications.csv'),toCsv(generateDemoRows(reference)),'CSV отличается от воспроизводимого генератора');
monthCounts.forEach((count,index)=>assert.equal(demo.filter(r=>r.created_at.slice(0,7)===`2026-${String(index+1).padStart(2,'0')}`).length,count));
assert.equal(demo.filter(r=>r.client_type==='individual').length,240);
assert.equal(demo.filter(r=>r.client_type==='company').length,60);
assert.equal(demo.filter(r=>r.client_type==='individual' && professionMap.get(r.profession).is_agricultural==='true').length,180);
assert.equal(demo.filter(r=>r.client_type==='company' && industryMap.get(r.company_industry).is_agricultural==='true').length,54);
assert.equal(new Set(demo.filter(r=>r.client_type==='individual').map(r=>r.profession)).size,16);
assert.equal(new Set(demo.filter(r=>r.client_type==='company').map(r=>r.company_industry)).size,6);
assert.equal(new Set(demo.map(r=>r.region)).size,4);

const importExpected = await json('invalid-expected.json');
const seen = new Set();
let accepted = 0;
invalid.forEach((row,index)=>{
  const error = rowError(row,seen);
  const expected = importExpected.rows[index];
  assert.equal(expected.line,index+2);
  assert.equal(String(expected.id),row.id);
  assert.equal(error,expected.code,`Ошибка в строке ${index+2}`);
  assert.equal(error ? 'rejected' : 'accepted',expected.status);
  if (error === null) { seen.add(row.id); accepted++; }
});
assert.equal(accepted,importExpected.accepted);
assert.equal(invalid.length-accepted,importExpected.rejected);
assert.equal(invalid.length,importExpected.total);
assert.equal(invalid[0].workplace,'СИНТЕТИКА: тест; участок "А"');
// Повторная загрузка в уже заполненную таблицу: ID 9001 существует.
const repeatSeen = new Set(['9001']);
assert(invalid.every(row=>rowError(row,repeatSeen)!==null),'Повторный импорт должен отклонить все 22 строки');

// Независимый от будущего SQL простой расчёт для сверки ручного эталона.
// Этот код проверяет подготовленные примеры; он не подключается к серверу.
const round = (value,digits=2) => value === null ? null : Math.round((value + Number.EPSILON)*10**digits)/10**digits;
const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
const median = values => {
  if (!values.length) return null;
  const s = [...values].sort((a,b)=>a-b), middle = Math.floor(s.length/2);
  return s.length%2 ? s[middle] : (s[middle-1]+s[middle])/2;
};
const change = (current,previous) => current===null || previous===null || previous===0 ? null : round((current-previous)/previous*100,1);
function select(filters) {
  const f = {date_from:'2026-01-01',date_to:'2026-03-31',...filters};
  const base = control.filter(r=>r.client_type===f.client_type && r.created_at>=f.date_from && r.created_at<=f.date_to && (!f.region || r.region===f.region));
  const group = base.filter(r=>f.client_type==='individual'
    ? professionMap.get(r.profession).is_agricultural==='true' && (f.profession===undefined || r.profession===String(f.profession))
    : industryMap.get(r.company_industry).is_agricultural==='true' && (f.company_industry===undefined || r.company_industry===String(f.company_industry)));
  return {base,group};
}
function metrics(filters) {
  const {base,group} = select(filters);
  const amounts = group.map(r=>Number(r.loan_amount));
  const result = {selected_ids:group.map(r=>Number(r.id)),count:group.length,amount_mean:round(mean(amounts)),amount_median:round(median(amounts)),term_mean:round(mean(group.map(r=>Number(r.loan_term))))};
  if (filters.client_type==='individual') {
    const incomes = group.map(r=>Number(r.income));
    const positive = group.filter(r=>Number(r.income)>0);
    Object.assign(result,{all_individual_count:base.length,agricultural_share_pct:base.length ? round(group.length/base.length*100,1) : null,income_mean:round(mean(incomes)),income_median:round(median(incomes)),amount_income_ratio_mean:round(mean(positive.map(r=>Number(r.loan_amount)/Number(r.income)))),ratio_excluded:group.length-positive.length});
  } else {
    const revenues = group.map(r=>Number(r.company_revenue));
    Object.assign(result,{revenue_mean:round(mean(revenues)),revenue_median:round(median(revenues))});
  }
  return result;
}
const expected = await json('control-expected.json');
let metricChecks = 0;
for (const test of expected.cases) {
  const actual = metrics(test.filters);
  for (const [key,value] of Object.entries(test.expected)) { assert.deepEqual(actual[key],value,`${test.id}: ${key}`); metricChecks++; }
}
for (const type of ['individual','company']) {
  const group = select({client_type:type}).group;
  for (const [field,value] of Object.entries(expected.distributions[type])) {
    if (field==='leading_purposes') continue;
    const counts = {};
    group.forEach(r=>counts[r[field]]=(counts[r[field]]??0)+1);
    assert.deepEqual(counts,value,`${type}: ${field}`);
  }
  const purposeCounts = expected.distributions[type].purpose;
  const maximum = Math.max(...Object.values(purposeCounts));
  assert.deepEqual(Object.keys(purposeCounts).filter(k=>purposeCounts[k]===maximum).sort(),expected.distributions[type].leading_purposes);
  let previous = null;
  for (const month of expected.monthly[type]) {
    const n = Number(month.month.slice(5));
    const end = new Date(Date.UTC(2026,n,0)).toISOString().slice(0,10);
    const result = metrics({client_type:type,date_from:`${month.month}-01`,date_to:end});
    const financial = type==='individual' ? 'income' : 'revenue';
    Object.assign(result,{month:month.month,count_change_pct:previous ? change(result.count,previous.count) : null,amount_change_pct:previous ? change(result.amount_mean,previous.amount_mean) : null,[`${financial}_change_pct`]:previous ? change(result[`${financial}_mean`],previous[`${financial}_mean`]) : null});
    for (const [key,value] of Object.entries(month)) assert.deepEqual(result[key],value,`${type} ${month.month}: ${key}`);
    previous = result;
  }
}
const zeroCount = change(metrics({client_type:'individual',profession:4,date_from:'2026-02-01',date_to:'2026-02-28'}).count,metrics({client_type:'individual',profession:4,date_from:'2026-01-01',date_to:'2026-01-31'}).count);
const zeroRevenue = change(metrics({client_type:'company',company_industry:3,date_from:'2026-03-01',date_to:'2026-03-31'}).revenue_mean,metrics({client_type:'company',company_industry:3,date_from:'2026-02-01',date_to:'2026-02-28'}).revenue_mean);
assert.equal(zeroCount,null);
assert.equal(zeroRevenue,null);
console.log('Справочники и CSV: структура, ссылки, значения и уникальность проверены.');
console.log(`Контрольный набор: 14 строк, ${expected.cases.length} сценариев, ${metricChecks} сравнений показателей — без расхождений.`);
console.log('Дополнительно проверены распределения, все лидирующие цели, месяцы и нулевая база.');
console.log('Демонстрационный набор: 300 строк, 6 месяцев, 4 региона; генератор воспроизводит файл побайтно.');
console.log(`Ошибочный набор: ${accepted} принято, ${invalid.length-accepted} отклонено — все причины совпали с эталоном.`);
console.log('Это проверка файлов и эталонов. Сервер, БД, интерфейс и ИИ ещё не проверены.');
