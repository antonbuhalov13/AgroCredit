// Учебный генератор: только вымышленные заявки, без сетевых запросов.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const seed = 20261014;
export const monthCounts = [35, 40, 45, 50, 60, 70];
export const columns = ['id','client_type','product_type','region','profession','workplace','income','company_industry','company_size','company_revenue','loan_amount','loan_term','purpose','created_at'];

// При одинаковом seed последовательность одинакова: результат воспроизводим.
export function generateDemoRows(reference) {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  const pick = list => list[Math.floor(random() * list.length)];
  const agriculturalProfessions = [1,2,3,4,9,10,11,12];
  const otherProfessions = [5,6,7,8,13,14,15,16];
  const rows = [];
  let id = 2001, agIndex = 0, nonAgIndex = 0, companyIndex = 0;
  monthCounts.forEach((count, month) => {
    const companies = Math.floor(count / 5);
    const otherIndividuals = Math.floor(count / 5);
    const agIndividuals = count - companies - otherIndividuals;
    for (let index = 0; index < count; index++) {
      const company = index >= count - companies;
      const row = Object.fromEntries(columns.map(key => [key, '']));
      Object.assign(row, { id: id++, client_type: company ? 'company' : 'individual',
        region: reference.regions[(index + month) % reference.regions.length],
        created_at: `2026-${String(month + 1).padStart(2,'0')}-${String(1 + Math.floor(random()*28)).padStart(2,'0')}`,
        loan_term: pick([6,12,18,24,36,48,60]) });
      if (!company) {
        row.profession = index < agIndividuals ? agriculturalProfessions[agIndex++ % 8] : otherProfessions[nonAgIndex++ % 8];
        row.workplace = `СИНТЕТИКА: место работы ${row.id}`;
        row.income = index === 0 ? 0 : (25000 + Math.floor(random()*125000));
        row.loan_amount = 50000 + Math.floor(random()*1950000) + 0.5;
        // Фиксированный контрольный набор остаётся воспроизводимым при расширении справочников.
        row.purpose = pick(['home_repair', 'car_purchase', 'education']);
        row.product_type = row.purpose === 'car_purchase' ? 'auto' : 'consumer';
      } else {
        // Последняя компания каждого месяца — известная неаграрная сфера.
        row.company_industry = index === count - 1 ? 4 + month % 3 : 1 + companyIndex++ % 3;
        row.company_size = pick(Object.keys(reference.company_sizes));
        row.company_revenue = index === count - companies ? 0 : 1000000 + Math.floor(random()*199000000);
        row.loan_amount = 500000 + Math.floor(random()*29500000) + 0.75;
        row.purpose = pick(['equipment_purchase', 'sowing', 'working_capital']);
        row.product_type = row.purpose === 'equipment_purchase' ? 'investment' : 'working_capital';
      }
      rows.push(row);
    }
  });
  return rows;
}

export function toCsv(rows) {
  const escape = value => /[;"\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"','""')}"` : String(value);
  // Метка помогает Excel распознать UTF-8 при обычном открытии файла.
  return '\uFEFF' + [columns, ...rows.map(row => columns.map(key => row[key]))]
    .map(row => row.map(escape).join(';')).join('\r\n') + '\r\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reference = JSON.parse(await fs.readFile(path.join(root,'data/reference-values.json'),'utf8'));
  const rows = generateDemoRows(reference);
  // Записывается только вымышленный демонстрационный набор; БД не затрагивается.
  await fs.writeFile(path.join(root,'data/demo_applications.csv'),toCsv(rows),'utf8');
  console.log(`Создано ${rows.length} синтетических заявок. Seed: ${seed}. Файл: data/demo_applications.csv`);
}
