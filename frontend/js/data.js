// Небольшой демосправочник. Коды совпадают с контрактом API.
let catalog = {
   regions: ['Краснодарский край', 'Республика Татарстан', 'Ростовская область', 'Алтайский край'],
   products: {
      "individual": {
         "consumer": "Потребительский кредит",
         "auto": "Автокредит",
         "mortgage": "Ипотечный кредит",
         "education": "Образовательный кредит",
         "refinancing": "Рефинансирование кредитов",
         "personal_farming": "Кредит на личное подсобное хозяйство"
      },
      "company": {
         "investment": "Инвестиционный кредит",
         "working_capital": "Кредит на оборотные средства",
         "equipment": "Кредит на сельхозтехнику и оборудование",
         "seasonal": "Кредит на сезонные работы",
         "commercial_mortgage": "Кредит на коммерческую недвижимость",
         "refinancing": "Рефинансирование бизнес-кредитов"
      }
   },
   purposes: {
      "individual": {
         "home_repair": "Ремонт жилья",
         "car_purchase": "Покупка автомобиля",
         "education": "Образование",
         "home_purchase": "Покупка жилья",
         "home_construction": "Строительство жилого дома",
         "loan_refinancing": "Погашение действующих кредитов",
         "livestock_purchase": "Покупка сельскохозяйственных животных",
         "farm_supplies": "Покупка кормов, семян и инвентаря",
         "other": "Другое"
      },
      "company": {
         "equipment_purchase": "Покупка сельскохозяйственной техники",
         "sowing": "Подготовка к посевной",
         "working_capital": "Пополнение оборотных средств",
         "equipment_modernization": "Модернизация оборудования",
         "farm_construction": "Строительство сельскохозяйственных объектов",
         "seed_fertilizer_purchase": "Покупка семян и удобрений",
         "harvesting": "Проведение уборочных работ",
         "feed_purchase": "Закупка кормов",
         "business_property_purchase": "Покупка коммерческой недвижимости",
         "loan_refinancing": "Погашение действующих кредитов",
         "other": "Другое"
      }
   },
   product_purposes: {
      "individual": {
         "consumer": [
            "home_repair",
            "car_purchase",
            "education",
            "other"
         ],
         "auto": [
            "car_purchase",
            "other"
         ],
         "mortgage": [
            "home_purchase",
            "home_construction",
            "other"
         ],
         "education": [
            "education",
            "other"
         ],
         "refinancing": [
            "loan_refinancing",
            "other"
         ],
         "personal_farming": [
            "livestock_purchase",
            "farm_supplies",
            "other"
         ]
      },
      "company": {
         "investment": [
            "equipment_purchase",
            "equipment_modernization",
            "farm_construction",
            "other"
         ],
         "working_capital": [
            "sowing",
            "working_capital",
            "seed_fertilizer_purchase",
            "feed_purchase",
            "other"
         ],
         "equipment": [
            "equipment_purchase",
            "equipment_modernization",
            "other"
         ],
         "seasonal": [
            "sowing",
            "seed_fertilizer_purchase",
            "harvesting",
            "other"
         ],
         "commercial_mortgage": [
            "business_property_purchase",
            "other"
         ],
         "refinancing": [
            "loan_refinancing",
            "other"
         ]
      }
   },
   professions: {
      1: 'Агроном', 2: 'Механизатор сельскохозяйственной техники', 3: 'Животновод', 4: 'Фермер',
      5: 'Учитель', 6: 'Программист', 7: 'Врач', 8: 'Парикмахер', 9: 'Ветеринарный врач сельскохозяйственных животных',
      10: 'Зоотехник', 11: 'Птицевод', 12: 'Пчеловод', 13: 'Ветеринарный врач домашних животных',
      14: 'Автомеханик легковых автомобилей', 15: 'Бухгалтер', 16: 'Водитель легкового такси', 17: 'Другое',
   },
   other_profession_id: 17,
   industries: {
      1: 'Растениеводство', 2: 'Животноводство', 3: 'Смешанное сельское хозяйство',
      4: 'Переработка сельскохозяйственного сырья', 5: 'Торговля сельскохозяйственной продукцией',
      6: 'Производство сельскохозяйственной техники', 7: 'Другое',
   },
   other_company_industry_id: 7,
   sizes: { micro: 'Микро', small: 'Малое', medium: 'Среднее', large: 'Крупное' },
};

const columns = [
   'id', 'client_type', 'product_type', 'region', 'profession', 'workplace', 'income',
   'company_industry', 'company_size', 'company_revenue', 'loan_amount', 'loan_term', 'purpose', 'created_at',
];
const extendedColumns = [...columns, 'purpose_details', 'profession_details', 'profession_classification',
   'company_industry_details', 'company_industry_classification'];
const individualFields = ['profession', 'profession_details', 'profession_classification', 'workplace', 'income'];
const companyFields = ['company_industry', 'company_industry_details', 'company_industry_classification', 'company_size', 'company_revenue'];
const categories = { individual: 'profession', company: 'company_industry' };
const money = /^\d+(\.\d{1,2})?$/;
const positiveInteger = (value) => /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 2147483647;
const purposeKey = (text) => text.normalize('NFKC').toLowerCase().replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function validateCustomCategory(record, field, otherId, label) {
   const details = record[`${field}_details`];
   const classification = record[`${field}_classification`];
   if (Number(record[field]) !== otherId) {
      return details || classification ? 'Дополнительные поля заполняются только при выборе «Другое».' : '';
   }
   const text = typeof details === 'string' ? details.trim() : '';
   const length = [...text].length;
   if (length < 2 || length > 200 || /[\p{Cc}\p{Cf}]/u.test(text)) {
      return `Укажите ${label}: от 2 до 200 символов, без переносов строк и управляющих символов.`;
   }
   if (!['yes', 'no', 'unsure'].includes(classification)) return 'Укажите связь с сельским хозяйством: Да, Нет или Не уверен.';
   return '';
}

function validate(record) {
   const type = record.client_type;
   if (!Object.hasOwn(catalog.products, type)) return 'Укажите тип заявителя individual или company.';
   if (!catalog.regions.includes(record.region)) return 'Выберите регион из демосправочника.';
   if (!Object.hasOwn(catalog.products[type], record.product_type)) return 'Проверьте кредитный продукт для выбранного типа.';
   if (!Object.hasOwn(catalog.purposes[type], record.purpose)) return 'Проверьте цель кредита для выбранного типа.';
   const allowed = catalog.product_purposes[type][record.product_type] || [];
   if (!allowed.includes(record.purpose)) return 'Цель не соответствует выбранному кредитному продукту.';
   if (record.purpose === 'other') {
      const text = typeof record.purpose_details === 'string' ? record.purpose_details.trim() : '';
      const length = [...text].length;
      if (length < 3 || length > 200 || /[\p{Cc}\p{Cf}]/u.test(text)) {
         return 'Укажите свою цель: от 3 до 200 символов, без переносов строк и управляющих символов.';
      }
      const known = Object.values(catalog.purposes).flatMap((items) => Object.entries(items))
         .find(([code, label]) => code !== 'other' && [code, label].some((value) => purposeKey(value) === purposeKey(text)));
      if (known && !allowed.includes(known[0])) return 'Указанная цель не соответствует выбранному кредитному продукту.';
   } else if (record.purpose_details) {
      return 'Своя цель заполняется только при выборе «Другое».';
   }
   if (!money.test(record.loan_amount) || !Number.isFinite(Number(record.loan_amount)) || Number(record.loan_amount) <= 0) {
      return 'Сумма кредита должна быть больше нуля. Используйте точку и до двух знаков после неё.';
   }
   if (!positiveInteger(record.loan_term)) return 'Укажите положительный целый срок в месяцах.';
   const otherFields = type === 'individual' ? companyFields : individualFields;
   if (otherFields.some((field) => record[field])) return 'Оставьте поля другого типа заявителя пустыми.';
   if (type === 'individual') {
      if (!Object.hasOwn(catalog.professions, record.profession)) return 'Проверьте ID профессии в демосправочнике.';
      const problem = validateCustomCategory(record, 'profession', catalog.other_profession_id, 'профессию');
      if (problem) return problem;
      if (!record.workplace || record.workplace !== record.workplace.trim()) return 'Укажите место работы без пробелов по краям.';
      if (!money.test(record.income)) return 'Укажите месячный доход. Допускается ноль и до двух знаков после точки.';
   } else {
      if (!Object.hasOwn(catalog.industries, record.company_industry)) return 'Проверьте ID сферы в демосправочнике.';
      const problem = validateCustomCategory(record, 'company_industry', catalog.other_company_industry_id, 'сферу деятельности');
      if (problem) return problem;
      if (!Object.hasOwn(catalog.sizes, record.company_size)) return 'Выберите размер предприятия.';
      if (!money.test(record.company_revenue)) return 'Укажите годовую выручку. Допускается ноль и до двух знаков после точки.';
   }
   return '';
}

function parseLine(line, row) {
   // Поддерживаем разделитель в кавычках и удвоенные кавычки внутри поля.
   if (!/^(?:"(?:[^"]|"")*"|[^;"]*)(?:;(?:"(?:[^"]|"")*"|[^;"]*))*$/.test(line)) {
      throw new Error(`Строка ${row}: некорректные кавычки.`);
   }
   return Array.from((';' + line).matchAll(/;("(?:[^"]|"")*"|[^;"]*)/g), ([, cell]) =>
      cell.startsWith('"') ? cell.slice(1, -1).replaceAll('""', '"') : cell);
}

function checkCsv(text) {
   const lines = text.split(/\r?\n/);
   while (lines.at(-1) === '') lines.pop();
   const header = lines.length ? parseLine(lines[0], 1) : [];
   const csvColumns = header.length >= columns.length && header.length <= extendedColumns.length
      && header.every((name, index) => name === extendedColumns[index]) ? extendedColumns.slice(0, header.length) : columns;
   if (!lines.length || JSON.stringify(header) !== JSON.stringify(csvColumns)) {
      throw new Error('Заголовок CSV не совпадает с шаблоном.');
   }
   let accepted = 0;
   const seen = new Set();
   const errors = [];
   for (let index = 1; index < lines.length; index++) {
      const row = index + 1;
      if (!lines[index]) throw new Error(`Строка ${row}: пустая строка внутри файла.`);
      const cells = parseLine(lines[index], row);
      if (cells.length !== csvColumns.length) throw new Error(`Строка ${row}: ожидается ${csvColumns.length} столбцов.`);
      const record = Object.fromEntries(csvColumns.map((name, position) => [name, cells[position]]));
      const date = new Date(record.created_at + 'T00:00:00Z');
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(record.created_at) && !record.created_at.startsWith('0000')
         && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === record.created_at;
      const reason = !positiveInteger(record.id) || record.id.startsWith('0') ? 'Проверьте ID заявки.'
         : !validDate ? 'Проверьте дату в формате ГГГГ-ММ-ДД.'
         : validate(record) || (seen.has(record.id) ? 'Повтор ID внутри файла.' : '');
      if (reason) errors.push({ row, reason });
      else {
         accepted++;
         seen.add(record.id);
      }
   }
   return { accepted, errors };
}

const application = document.querySelector('#application');
const upload = document.querySelector('#upload');
const fileInput = document.querySelector('#csv-file');
const applicationResult = document.querySelector('#application-result');
const applicationSubmit = document.querySelector('#application-submit');
const uploadSubmit = document.querySelector('#upload-submit');
const uploadResult = document.querySelector('#upload-result');
const errorTable = document.querySelector('#upload-errors');
const errorRows = errorTable.querySelector('tbody');

function showResult(target, message, error = false) {
   target.textContent = message;
   target.dataset.error = String(error);
}

function fillSelect(field, entries) {
   application.elements[field].replaceChildren(new Option('Выберите значение', ''), ...entries.map(([value, label]) => new Option(label, value)));
}

const categoryKey = (text) => text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase().replaceAll('ё', 'е');

function categoryOptions(field) {
   const source = field === 'profession' ? catalog.professions : catalog.industries;
   return Object.entries(source).filter(([id]) => Number(id) !== catalog[`other_${field}_id`]);
}

function findCategory(field, text) {
   const key = categoryKey(text);
   return categoryOptions(field).find(([, label]) => categoryKey(label) === key);
}

function setCategoryClassification(type, field) {
   const text = application.elements[`${field}_name`].value;
   const key = categoryKey(text);
   const custom = application.elements.client_type.value === type && [...key].length >= 2 && !findCategory(field, text);
   const classification = application.elements[`${field}_classification`];
   document.querySelector(`#${field.replaceAll('_', '-')}-extra`).hidden = !custom;
   classification.disabled = !custom;
   classification.required = custom;
   if (!custom || classification.dataset.category !== key) classification.value = '';
   classification.dataset.category = custom ? key : '';
}

function applyCategoryToRecord(record) {
   const field = categories[record.client_type];
   const inputName = `${field}_name`;
   const text = record[inputName].trim();
   delete record[inputName];
   const known = findCategory(field, text);
   if (known) {
      record[field] = known[0];
      delete record[`${field}_classification`];
   } else {
      record[field] = catalog[`other_${field}_id`];
      record[`${field}_details`] = text;
   }
}

function setApplicant() {
   const type = application.elements.client_type.value;
   for (const group of ['individual', 'company']) {
      const fieldset = document.querySelector('#' + group + '-fields');
      fieldset.hidden = fieldset.disabled = group !== type;
   }
   fillSelect('product_type', Object.entries(catalog.products[type]));
   for (const [group, field] of Object.entries(categories)) {
      application.elements[`${field}_name`].value = '';
      setCategoryClassification(group, field);
   }
   setProduct();
}

function setPurpose() {
   const custom = application.elements.purpose.value === 'other';
   const input = application.elements.purpose_details;
   document.querySelector('#purpose-details-field').hidden = !custom;
   input.disabled = !custom;
   input.required = custom;
   if (!custom) input.value = '';
}

function setProduct() {
   const type = application.elements.client_type.value;
   const product = application.elements.product_type.value;
   const allowed = catalog.product_purposes[type][product] || [];
   fillSelect('purpose', allowed.map((code) => [code, catalog.purposes[type][code]]));
   application.elements.purpose.disabled = !product;
   setPurpose();
   document.querySelector('#purpose-help').textContent = product
      ? `Укажите цель, связанную с продуктом «${catalog.products[type][product]}».`
      : 'Сначала выберите кредитный продукт.';
}

async function initializeApplication() {
   if (agroApi.enabled) {
      agroApi.setupNavigation();
      document.querySelector('#data-intro').textContent = 'Добавьте заявку или импортируйте CSV.';
      applicationSubmit.textContent = 'Сохранить заявку';
      uploadSubmit.textContent = 'Загрузить CSV';
      const typeSelect = application.elements.client_type;
      applicationSubmit.disabled = typeSelect.disabled = true;
      showResult(applicationResult, 'Загружаем справочники…');
      try {
         const result = await agroApi.getDictionaries();
         if (!result.product_purposes) throw new Error('Обновите сервер: отсутствуют правила соответствия целей продуктам.');
         if (!Number.isInteger(result.other_profession_id) || !result.professions.some(item => item.id === result.other_profession_id)) {
            throw new Error('Обновите сервер и выполните миграции для варианта профессии «Другое».');
         }
         if (!Number.isInteger(result.other_company_industry_id) || !result.company_industries.some(item => item.id === result.other_company_industry_id)) {
            throw new Error('Обновите сервер и выполните миграции для варианта сферы деятельности «Другое».');
         }
         const names = (items) => Object.fromEntries(items.map(({ id, name }) => [id, name]));
         catalog = {
            regions: result.regions,
            products: result.products,
            purposes: result.purposes,
            product_purposes: result.product_purposes,
            professions: names(result.professions),
            other_profession_id: result.other_profession_id,
            industries: names(result.company_industries),
            other_company_industry_id: result.other_company_industry_id,
            sizes: result.company_sizes,
         };
      } catch (error) {
         showResult(applicationResult, `Не удалось загрузить справочники. ${error.message} Обновите страницу, чтобы повторить.`, true);
         return;
      }
      applicationSubmit.disabled = typeSelect.disabled = false;
      showResult(applicationResult, '');
   }
   fillSelect('region', catalog.regions.map((region) => [region, region]));
   for (const field of Object.values(categories)) {
      const suggestions = document.querySelector(`#${field.replaceAll('_', '-')}-options`);
      suggestions.replaceChildren(...categoryOptions(field).map(([, label]) => new Option(label, label)));
   }
   fillSelect('company_size', Object.entries(catalog.sizes));
   setApplicant();
}

application.elements.client_type.addEventListener('change', setApplicant);
application.elements.product_type.addEventListener('change', setProduct);
application.elements.purpose.addEventListener('change', setPurpose);
for (const [type, field] of Object.entries(categories)) {
   const input = application.elements[`${field}_name`];
   const updateClassification = () => setCategoryClassification(type, field);
   input.addEventListener('input', updateClassification);
   input.addEventListener('change', updateClassification);
}
application.addEventListener('input', () => {
   if (!applicationSubmit.disabled) showResult(applicationResult, '');
});
application.addEventListener('submit', async (event) => {
   event.preventDefault();
   if (applicationSubmit.disabled) return;
   const record = Object.fromEntries(new FormData(application));
   applyCategoryToRecord(record);
   const problem = validate(record);
   if (problem || !agroApi.enabled) {
      showResult(applicationResult, problem || 'Заявка прошла проверку в деморежиме.', Boolean(problem));
      return;
   }
   for (const field of ['loan_term', 'profession', 'company_industry']) {
      if (Object.hasOwn(record, field)) record[field] = Number(record[field]);
   }
   applicationSubmit.disabled = true;
   showResult(applicationResult, 'Сохраняем заявку…');
   try {
      const { id } = await agroApi.submitApplication(record);
      showResult(applicationResult, `Заявка сохранена. Номер: ${id}.`);
   } catch (error) {
      showResult(applicationResult, error.message, true);
   } finally {
      applicationSubmit.disabled = false;
   }
});

const modeButtons = document.querySelectorAll('.modes button');
for (const button of modeButtons) {
   button.addEventListener('click', () => {
      for (const item of modeButtons) {
         item.setAttribute('aria-pressed', String(item === button));
         document.getElementById(item.getAttribute('aria-controls')).hidden = item !== button;
      }
   });
}

fileInput.addEventListener('change', () => {
   errorTable.hidden = true;
   showResult(uploadResult, '');
});
upload.addEventListener('submit', async (event) => {
   event.preventDefault();
   if (uploadSubmit.disabled) return;
   const file = fileInput.files[0];
   if (!file) return;
   errorTable.hidden = true;
   errorRows.replaceChildren();
   if (!/\.csv$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      showResult(uploadResult, 'Выберите CSV-файл размером до 5 МБ.', true);
      return;
   }
   uploadSubmit.disabled = fileInput.disabled = true;
   showResult(uploadResult, agroApi.enabled ? 'Загружаем файл…' : 'Проверяем файл…');
   try {
      let result;
      if (agroApi.enabled) {
         result = await agroApi.uploadCsv(file);
      } else {
         const bytes = await file.arrayBuffer();
         let text;
         try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
         catch { throw new Error('Сохраните CSV в кодировке UTF-8.'); }
         result = checkCsv(text);
      }
      const { accepted, errors, rejected = errors.length } = result;
      const limit = 200;
      const note = rejected > Math.min(errors.length, limit) ? ' Показана часть ошибок.' : '';
      const action = agroApi.enabled ? 'Загружены' : 'Прошли проверку';
      showResult(uploadResult, `${action}: ${accepted}. Отклонены: ${rejected}.${note}`);
      for (const { row, reason, message } of errors.slice(0, limit)) {
         const entry = errorRows.insertRow();
         entry.insertCell().textContent = row;
         entry.insertCell().textContent = reason || message;
      }
      errorTable.hidden = errors.length === 0;
   } catch (error) {
      showResult(uploadResult, error.message, true);
   } finally {
      uploadSubmit.disabled = fileInput.disabled = false;
   }
});

initializeApplication();

document.querySelector('#download-template').addEventListener('click', () => {
   const example = [
      extendedColumns.join(';'),
      '1;individual;consumer;Краснодарский край;17;Демо-ферма;65000;;;;480000;24;home_repair;2026-03-01;;Оператор доильной установки;yes;;',
      '2;company;investment;Алтайский край;;;;7;small;19600000;4200000;36;other;2026-03-02;Строительство зернохранилища;;;Выращивание грибов;yes',
   ].join('\r\n');
   const url = URL.createObjectURL(new Blob(['\uFEFF', example, '\r\n'], { type: 'text/csv;charset=utf-8' }));
   const link = document.createElement('a');
   link.href = url;
   link.download = 'agrocredit-template.csv';
   link.click();
   setTimeout(() => URL.revokeObjectURL(url), 1000);
});
