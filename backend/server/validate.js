// Проверка одной заявки по таблице полей из docs/data-format.md (раздел 2).
// Чистая функция: без БД и Express. Возвращает { errors:[{field,code,message}], value }.
// Сообщения не содержат самих значений (в логи и ответы не копируем содержимое анкет).
const MONEY = /^\d+(\.\d{1,2})?$/;          // точка, максимум 2 знака, без пробелов и экспоненты
const INT = /^\d+$/;
const INT_MAX = 2147483647;                  // предел INTEGER в PostgreSQL
const str = v => (v === undefined || v === null) ? '' : String(v);   // пропуск = '' (не 0)
const purposeKey = text => text.normalize('NFKC').toLowerCase().replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function realDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s.startsWith('0000')) return false;
  const d = new Date(s + 'T00:00:00.000Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validateApplication(raw, ctx, { fromCsv = false } = {}) {
  const errors = [];
  const err = (field, code, message) => errors.push({ field, code, message });
  const g = f => str(raw[f]);
  const v = {
    profession: null, profession_details: null, profession_classification: null, workplace: null, income: null,
    company_industry: null, company_industry_details: null, company_industry_classification: null,
    company_size: null, company_revenue: null,
  };

  if (fromCsv) {
    if (!/^[1-9]\d*$/.test(g('id')) || Number(g('id')) > INT_MAX) err('id', 'invalid_id', 'ID: положительное целое число');
    else v.id = Number(g('id'));
    if (!realDate(g('created_at'))) err('created_at', 'invalid_created_at', 'Дата: существующая дата ГГГГ-ММ-ДД');
    else v.created_at = g('created_at');
  } else {                                                  // форма: id и дату назначает сервер
    if (g('id') !== '') err('id', 'unexpected_id', 'ID назначает сервер');
    if (g('created_at') !== '') err('created_at', 'unexpected_created_at', 'Дату назначает сервер');
  }

  const type = g('client_type');
  if (type !== 'individual' && type !== 'company') {
    err('client_type', 'invalid_client_type', 'Тип заявителя: individual или company');
    return { errors, value: v };                            // дальше проверки зависят от типа
  }
  v.client_type = type;

  if (Object.hasOwn(ctx.products[type], g('product_type'))) v.product_type = g('product_type');
  else err('product_type', 'invalid_product_type', 'Продукта нет в справочнике для этого типа заявителя');
  if (ctx.regions.includes(g('region'))) v.region = g('region');
  else err('region', 'invalid_region', 'Региона нет в справочнике');
  if (Object.hasOwn(ctx.purposes[type], g('purpose'))) v.purpose = g('purpose');
  else err('purpose', 'invalid_purpose', 'Цели нет в справочнике для этого типа заявителя');

  const allowed = ctx.productPurposes[type][v.product_type] || [];
  if (v.product_type && v.purpose && !allowed.includes(v.purpose)) {
    err('purpose', 'incompatible_purpose', 'Цель не соответствует выбранному кредитному продукту');
  }
  v.purpose_details = null;
  if (v.purpose === 'other') {
    const details = g('purpose_details').trim();
    const length = [...details].length;
    if (typeof raw.purpose_details !== 'string' || length < 3 || length > 200 || /[\p{Cc}\p{Cf}]/u.test(details)) {
      err('purpose_details', 'invalid_purpose_details', 'Укажите свою цель: от 3 до 200 символов, без переносов строк и управляющих символов');
    } else {
      // Известная цель, введённая вручную, проходит те же правила и не дробит статистику.
      const known = Object.values(ctx.purposes).flatMap(items => Object.entries(items))
        .find(([code, label]) => code !== 'other' && [code, label].some(text => purposeKey(text) === purposeKey(details)));
      if (known && !allowed.includes(known[0])) {
        err('purpose_details', 'incompatible_purpose', 'Указанная цель не соответствует выбранному кредитному продукту');
      } else if (known) {
        v.purpose = known[0];
      } else {
        v.purpose_details = details;
      }
    }
  } else if (g('purpose_details') !== '') {
    err('purpose_details', 'unexpected_purpose_details', 'Своя цель заполняется только при выборе «Другое»');
  }

  if (MONEY.test(g('loan_amount')) && Number(g('loan_amount')) > 0) v.loan_amount = g('loan_amount');
  else err('loan_amount', 'invalid_loan_amount', 'Сумма: число больше нуля, не более 2 знаков после точки');
  if (INT.test(g('loan_term')) && Number(g('loan_term')) > 0 && Number(g('loan_term')) <= INT_MAX) v.loan_term = Number(g('loan_term'));
  else err('loan_term', 'invalid_loan_term', 'Срок: целое число месяцев больше нуля');

  const mustBeEmpty = fields => fields.forEach(f => { if (g(f) !== '') err(f, 'unexpected_' + f, 'Поле другого типа заявителя должно быть пустым'); });

  function validateCustomCategory(field, otherId, label) {
    const detailsField = `${field}_details`;
    const classificationField = `${field}_classification`;
    if (v[field] !== otherId) {
      for (const name of [detailsField, classificationField]) {
        if (g(name) !== '') err(name, 'unexpected_' + name, 'Дополнительные поля заполняются только при выборе «Другое»');
      }
      return;
    }
    const details = g(detailsField).trim();
    const length = [...details].length;
    if (typeof raw[detailsField] !== 'string' || length < 2 || length > 200 || /[\p{Cc}\p{Cf}]/u.test(details)) {
      err(detailsField, 'invalid_' + detailsField, `Укажите ${label}: от 2 до 200 символов, без переносов строк и управляющих символов`);
    } else v[detailsField] = details;
    const classification = raw[classificationField];
    if (!['yes', 'no', 'unsure'].includes(classification)) {
      err(classificationField, 'invalid_' + classificationField, 'Укажите связь с сельским хозяйством: Да, Нет или Не уверен');
    } else v[classificationField] = classification;
  }

  if (type === 'individual') {
    if (INT.test(g('profession')) && ctx.professionIds.has(Number(g('profession')))) v.profession = Number(g('profession'));
    else err('profession', 'invalid_profession', 'Профессия: ID из справочника');
    validateCustomCategory('profession', ctx.otherProfessionId, 'профессию');
    if (g('workplace') !== '' && g('workplace') === g('workplace').trim()) v.workplace = g('workplace');
    else err('workplace', 'invalid_workplace', 'Место работы: непустой текст без пробелов по краям');
    if (MONEY.test(g('income'))) v.income = g('income');
    else err('income', 'invalid_income', 'Доход: число не меньше нуля (руб./месяц), обязателен');
    mustBeEmpty(['company_industry', 'company_industry_details', 'company_industry_classification', 'company_size', 'company_revenue']);
  } else {
    if (INT.test(g('company_industry')) && ctx.industryIds.has(Number(g('company_industry')))) v.company_industry = Number(g('company_industry'));
    else err('company_industry', 'invalid_company_industry', 'Сфера: ID из справочника');
    validateCustomCategory('company_industry', ctx.otherCompanyIndustryId, 'сферу деятельности');
    if (ctx.sizes.includes(g('company_size'))) v.company_size = g('company_size');
    else err('company_size', 'invalid_company_size', 'Размер: micro, small, medium или large');
    if (MONEY.test(g('company_revenue'))) v.company_revenue = g('company_revenue');
    else err('company_revenue', 'invalid_company_revenue', 'Выручка: число не меньше нуля (руб./год), обязательна');
    mustBeEmpty(['profession', 'profession_details', 'profession_classification', 'workplace', 'income']);
  }
  return { errors, value: v };
}

module.exports = { validateApplication };
