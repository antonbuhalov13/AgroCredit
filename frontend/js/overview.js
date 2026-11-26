const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const numbers = new Intl.NumberFormat('ru-RU');
const rubles = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const percentages = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 });
const metrics = document.querySelector('#metrics');
const trend = document.querySelector('#trend');
const regions = document.querySelector('#regions');
const filters = document.querySelector('#filters');
const fields = filters.elements;
const filterError = document.querySelector('#filter-error');
const categoryLabel = document.querySelector('#category-label');
const detailButtons = document.querySelectorAll('.detail-modes button');
const details = document.querySelector('#details');
const summary = document.querySelector('#selection-summary');
const charts = document.querySelector('#charts');
const detailsPanel = document.querySelector('#details-panel');
const emptyResults = document.querySelector('#empty-results');
const announcement = document.querySelector('#announcement');
let groups = overviewDemo.groups;
let defaultPeriod = ['0', '5'];
let pendingRequest;
let appliedFilters;
let currentData;
let detailView = 'monthly';

const formatValue = (formatter, value) => value === null ? '—' : formatter.format(value);
const escapeText = (text) => String(text).replace(/[&<>"']/g, (character) => ({
   '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function monthLabel(month, short = false) {
   if (typeof month === 'number') return short ? months[month].slice(0, 3) : months[month];
   const [year, index] = month.split('-');
   const name = months[Number(index) - 1];
   return short ? `${name.slice(0, 3)} ${year.slice(2)}` : `${name} ${year}`;
}

function renderTrend(monthly) {
   const step = Math.max(1, Math.ceil(Math.max(...monthly.map(({ count }) => count)) / 4));
   const baseline = 228;
   const points = monthly.map(({ month, count }, index) => ({
      x: monthly.length === 1 ? 292 : 52 + index * 480 / (monthly.length - 1),
      y: baseline - count * 200 / (step * 4),
      label: monthLabel(month, true),
      count,
   }));
   const grid = Array.from({ length: 5 }, (_, index) => {
      const y = baseline - index * 50;
      return `<line class="gridline" x1="49" x2="548" y1="${y}" y2="${y}"/>
         <text class="axis-label" x="39" y="${y + 5}" text-anchor="end">${index * step}</text>`;
   }).join('');
   const labelStep = Math.ceil(points.length / 6);
   const labels = points.filter((_, index) => index % labelStep === 0).map(({ x, label }) =>
      `<text class="axis-label" x="${x}" y="261" text-anchor="middle">${label}</text>`).join('');
   const line = points.map(({ x, y }) => `${x},${y}`).join(' ');
   const dots = points.map(({ x, y, label, count }) =>
      `<circle class="chart-point" cx="${x}" cy="${y}" r="3.5"><title>${label}: ${escapeText(count)}</title></circle>`
   ).join('');
   const description = monthly.map(({ month, count }) => `${monthLabel(month)}: ${count}`).join(', ');
   trend.innerHTML = `<svg viewBox="0 0 560 274" role="img" aria-label="Количество заявок по месяцам. ${escapeText(description)}">
      ${grid}
      <polyline class="chart-line" points="${line}"/>
      ${dots}${labels}
   </svg>`;
}

function renderDetails() {
   if (!currentData) return;
   const monthly = detailView === 'monthly';
   details.classList.toggle('distribution-table', !monthly);
   const titles = {
      monthly: 'Итоги по месяцам',
      category: appliedFilters.type === 'individual' ? 'Распределение по профессиям' : 'Распределение по сферам',
      purpose: 'Распределение по целям кредита',
      product: 'Распределение по кредитным продуктам',
   };
   const headers = monthly
      ? ['Месяц', 'Заявки', 'Изменение к прошлому месяцу', agroApi.enabled ? 'Средняя сумма' : 'Медианная сумма']
      : ['Категория', 'Заявки', 'Доля в выборке'];
   const dataRows = monthly ? currentData.monthly.map(({ month, count, amountMedian, amountMean, countChange }, index) => {
      const previous = currentData.monthly[index - 1]?.count;
      const change = agroApi.enabled ? countChange : previous ? (count - previous) / previous : null;
      return [monthLabel(month), numbers.format(count), formatValue(percentages, change), formatValue(rubles, agroApi.enabled ? amountMean : amountMedian)];
   }) : currentData[detailView].map(({ label, count, share }) => [label, numbers.format(count), percentages.format(share)]);
   const body = dataRows.map(([label, ...cells]) =>
      `<tr><th scope="row">${escapeText(label)}</th>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`
   ).join('');
   details.innerHTML = `<caption>${titles[detailView]}</caption>
      <thead><tr>${headers.map((header) => `<th scope="col">${header}</th>`).join('')}</tr></thead>
      <tbody>${body || `<tr><td colspan="${headers.length}">Нет данных</td></tr>`}</tbody>`;
}

function render(selection, data) {
   currentData = data;
   const { count } = data;
   const isIndividual = selection.type === 'individual';
   const countCard = [isIndividual ? 'Аграрные заявки' : 'Заявки предприятий', numbers.format(count), 'За выбранный период'];
   const amountCard = ['Медианная сумма кредита', formatValue(rubles, data.amountMedian), 'Запрашиваемая сумма'];
   const cards = isIndividual
      ? [countCard, ['Доля аграрных заявок', formatValue(percentages, data.agriculturalShare), 'Среди всех заявок физлиц за тот же период и регион'], amountCard]
      : [countCard, amountCard, ['Медианная выручка', formatValue(rubles, data.revenueMedian), 'Годовая выручка предприятий']];

   metrics.innerHTML = cards.map(([title, value, hint]) =>
      `<article class="metric"><h2>${title}</h2><strong>${value}</strong><p class="caption">${hint}</p></article>`
   ).join('');

   charts.hidden = !count;
   emptyResults.hidden = Boolean(count);
   detailsPanel.hidden = false;
   if (count) {
      renderTrend(data.monthly);
      regions.innerHTML = data.region.map(({ label, count, share }) =>
         `<li><div class="rank-label"><span>${escapeText(label)}</span>
            <strong>${numbers.format(count)} · ${percentages.format(share)}</strong></div>
            <div class="bar" aria-hidden="true"><span style="width: ${share * 100}%"></span></div></li>`
      ).join('');
   }
   const start = monthLabel(selection.from);
   const period = selection.from === selection.to ? start : `${start} — ${monthLabel(selection.to)}`;
   const group = groups[selection.type];
   summary.textContent = [
      isIndividual ? 'Физлица' : 'Предприятия',
      agroApi.enabled ? period : `${period} 2026`,
      selection.region || 'Все регионы',
      group.categories[selection.category] || 'Все категории',
   ].join(' · ');
   announcement.textContent = `Показатели обновлены. Заявок: ${count}.`;
   renderDetails();
}

function setCategories(type) {
   const individual = type === 'individual';
   categoryLabel.textContent = individual ? 'Профессия' : 'Сфера деятельности';
   document.querySelector('[data-view="category"]').textContent = individual ? 'Профессии' : 'Сферы';
   fields.category.replaceChildren(
      new Option('Все категории', ''),
      ...Object.entries(groups[type].categories).map(([id, label]) => new Option(label, id)),
   );
}

function readFilters() {
   return {
      type: fields.client_type.value,
      from: agroApi.enabled ? fields.from.value : Number(fields.from.value),
      to: agroApi.enabled ? fields.to.value : Number(fields.to.value),
      region: fields.region.value,
      category: fields.category.value,
   };
}

function mapAnalytics(response, type) {
   const { metrics, monthly, distributions } = response;
   const group = groups[type];
   const share = (percent) => percent === null ? null : percent / 100;
   const mapDimension = (dimension, labels) => distributions.filter((row) => row.dimension === dimension)
      .map(({ category, count, share_pct }) => ({ label: labels?.[category] || category, count, share: share(share_pct) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
   return {
      count: metrics.count,
      agriculturalShare: share(metrics.agricultural_share_pct ?? null),
      amountMedian: metrics.amount_median,
      revenueMedian: metrics.revenue_median ?? null,
      monthly: monthly.map(({ month, count, count_change_pct, amount_mean }) => ({
         month, count, countChange: share(count_change_pct), amountMean: amount_mean,
      })),
      region: mapDimension('region'),
      category: mapDimension(type === 'individual' ? 'profession' : 'company_industry', group.categories),
      purpose: mapDimension('purpose', group.purposes),
      product: mapDimension('product_type', group.products),
   };
}

async function loadOverview(selection) {
   appliedFilters = selection;
   if (!agroApi.enabled) {
      render(selection, overviewDemo.summarize(selection));
      return;
   }
   pendingRequest?.abort();
   const controller = new AbortController();
   pendingRequest = controller;
   currentData = null;
   metrics.replaceChildren();
   charts.hidden = detailsPanel.hidden = emptyResults.hidden = true;
   summary.textContent = announcement.textContent = 'Загружаем аналитику…';
   const end = new Date(selection.to + '-01T00:00:00Z');
   end.setUTCMonth(end.getUTCMonth() + 1, 0);
   try {
      const result = await agroApi.getAnalytics({
         client_type: selection.type,
         date_from: selection.from + '-01',
         date_to: end.toISOString().slice(0, 10),
         region: selection.region || null,
         profession: selection.type === 'individual' && selection.category ? Number(selection.category) : null,
         company_industry: selection.type === 'company' && selection.category ? Number(selection.category) : null,
      }, controller.signal);
      if (!controller.signal.aborted) render(selection, mapAnalytics(result, selection.type));
   } catch (error) {
      if (controller.signal.aborted) return;
      summary.textContent = announcement.textContent = '';
      filterError.textContent = error.message;
   }
}

async function initialize() {
   let regionNames = overviewDemo.regions;
   if (agroApi.enabled) {
      agroApi.setupNavigation();
      document.querySelector('#source-caption').textContent = 'Данные командного сервера · Для профессий и сфер из группы «Другое» связь с сельским хозяйством указывает сотрудник при вводе заявки.';
      const controls = Array.from(filters.elements);
      controls.forEach((control) => { control.disabled = true; });
      summary.textContent = 'Загружаем справочники…';
      try {
         const dictionaries = await agroApi.getDictionaries();
         const agricultural = (items, otherId, otherLabel) => Object.fromEntries(items.filter((item) => item.is_agricultural || item.id === otherId)
            .map(({ id, name }) => [id, id === otherId ? otherLabel : name]));
         groups = Object.fromEntries([
            ['individual', dictionaries.professions, dictionaries.other_profession_id, 'Другое (аграрные профессии)'],
            ['company', dictionaries.company_industries, dictionaries.other_company_industry_id, 'Другое (аграрные сферы)'],
         ].map(([type, items, otherId, otherLabel]) => [type, {
            categories: agricultural(items, otherId, otherLabel), products: dictionaries.products[type], purposes: dictionaries.purposes[type],
         }]));
         regionNames = dictionaries.regions;
         const today = new Date();
         const year = today.getFullYear();
         defaultPeriod = [`${year}-01`, `${year}-${String(today.getMonth() + 1).padStart(2, '0')}`];
         for (const select of [fields.from, fields.to]) {
            const years = [];
            for (let optionYear = year + 1; optionYear >= year - 9; optionYear--) {
               const group = document.createElement('optgroup');
               group.label = String(optionYear);
               group.append(...months.map((month, index) =>
                  new Option(`${month} ${optionYear}`, `${optionYear}-${String(index + 1).padStart(2, '0')}`)));
               years.push(group);
            }
            select.replaceChildren(...years);
         }
         controls.forEach((control) => { control.disabled = false; });
      } catch (error) {
         summary.textContent = '';
         filterError.textContent = `Не удалось загрузить справочники. ${error.message} Обновите страницу, чтобы повторить.`;
         return;
      }
   } else {
      for (const select of [fields.from, fields.to]) {
         select.replaceChildren(...months.map((month, index) => new Option(month, index)));
      }
   }
   fields.region.replaceChildren(new Option('Все регионы', ''), ...regionNames.map((name) => new Option(name, name)));
   [fields.from.value, fields.to.value] = defaultPeriod;
   setCategories(fields.client_type.value);
   loadOverview(readFilters());
}

filters.addEventListener('submit', (event) => {
   event.preventDefault();
   const selection = readFilters();
   if (selection.from > selection.to) {
      filterError.textContent = 'Начало периода должно быть не позже конца.';
      fields.to.focus();
      return;
   }
   filterError.textContent = '';
   loadOverview(selection);
});

filters.addEventListener('change', (event) => {
   if (event.target.name !== 'client_type') return;
   const type = fields.client_type.value;
   setCategories(type);
   fields.from.value = appliedFilters.from;
   fields.to.value = appliedFilters.to;
   fields.region.value = appliedFilters.region;
   filterError.textContent = '';
   loadOverview(readFilters());
});

document.querySelector('#reset-filters').addEventListener('click', () => {
   [fields.from.value, fields.to.value] = defaultPeriod;
   fields.region.value = '';
   fields.category.value = '';
   filterError.textContent = '';
   loadOverview(readFilters());
});

for (const button of detailButtons) {
   button.addEventListener('click', () => {
      detailView = button.dataset.view;
      for (const item of detailButtons) item.setAttribute('aria-pressed', String(item === button));
      renderDetails();
   });
}

initialize();
