// Справочники. Единый источник — файлы Богдана в analytics/data/ (reference-values.json, professions.csv,
// company_industries.csv). Для работы сервера они загружаются в БД (npm run db:reference).
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./csv');

const DATA = path.join(__dirname, '..', '..', 'analytics', 'data');
const reference = JSON.parse(fs.readFileSync(path.join(DATA, 'reference-values.json'), 'utf8'));
const DICT_COLUMNS = ['id', 'name', 'is_agricultural'];

function readDictFile(file) {
  return parseCsv(fs.readFileSync(path.join(DATA, file)), DICT_COLUMNS)
    .map(({ record: r }) => ({ id: Number(r.id), name: r.name, is_agricultural: r.is_agricultural === 'true' }));
}

// Контекст проверки: всё, с чем сравниваются значения заявки.
function buildContext(professions, industries) {
  return {
    regions: reference.regions, products: reference.products, purposes: reference.purposes,
    productPurposes: reference.product_purposes,
    otherProfessionId: reference.other_profession_id,
    otherCompanyIndustryId: reference.other_company_industry_id,
    sizes: Object.keys(reference.company_sizes),
    professionIds: new Set(professions.map(p => p.id)), industryIds: new Set(industries.map(i => i.id))
  };
}
const contextFromFiles = () => buildContext(readDictFile('professions.csv'), readDictFile('company_industries.csv'));
async function contextFromDb(db) {
  const prof = await db.query('SELECT id FROM professions');
  const ind = await db.query('SELECT id FROM company_industries');
  return buildContext(prof.rows, ind.rows);
}

module.exports = { reference, COLUMNS: reference.columns, readDictFile, contextFromFiles, contextFromDb };
