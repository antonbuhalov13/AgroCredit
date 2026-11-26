// Независимый синтетический набор для проверки фильтров и визуализации.
const overviewDemo = (() => {
   const regions = ['Краснодарский край', 'Ростовская область', 'Республика Татарстан', 'Алтайский край'];
   const groups = {
      individual: {
         counts: [31, 42, 38, 57, 49, 68],
         otherCounts: [60, 65, 74, 67, 78, 83],
         categories: { 1: 'Агроном', 2: 'Механизатор сельхозтехники', 3: 'Животновод', 4: 'Фермер' },
         products: { consumer: 'Потребительский кредит', auto: 'Автокредит' },
         purposes: { home_repair: 'Ремонт жилья', car_purchase: 'Покупка автомобиля', education: 'Образование' },
      },
      company: {
         counts: [12, 17, 14, 24, 20, 29],
         otherCounts: [0, 0, 0, 0, 0, 0],
         categories: { 1: 'Растениеводство', 2: 'Животноводство', 3: 'Смешанное сельское хозяйство' },
         products: { investment: 'Инвестиционный кредит', working_capital: 'Кредит на оборотные средства' },
         purposes: { equipment_purchase: 'Покупка сельхозтехники', sowing: 'Подготовка к посевной', working_capital: 'Пополнение оборотных средств' },
      },
   };
   let seed = 63;
   function pick(items) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return items[Math.floor(seed / 2 ** 32 * items.length)];
   }
   const amounts = [12, 21, 29, 36, 43, 48, 54, 62, 71, 85, 95];
   const revenue = [6, 10, 14, 18, 20, 24, 30, 35, 42];
   const regionWeights = [0, 0, 0, 1, 1, 2, 2, 3];
   const rows = Object.fromEntries(Object.entries(groups).map(([type, group]) => [
      type,
      group.counts.flatMap((count, month) => Array.from({ length: count + group.otherCounts[month] }, (_, index) => {
         const agricultural = index < count;
         return {
            month,
            agricultural,
            region: regions[pick(regionWeights)],
            category: agricultural ? pick(Object.keys(group.categories)) : null,
            product: pick(Object.keys(group.products)),
            purpose: pick(Object.keys(group.purposes)),
            amount: pick(amounts) * (type === 'individual' ? 10000 : 90000),
            revenue: type === 'company' ? pick(revenue) * 1000000 : null,
         };
      })),
   ]));

   function median(rows, field) {
      if (!rows.length) return null;
      const values = rows.map((row) => row[field]).sort((a, b) => a - b);
      const middle = Math.floor(values.length / 2);
      return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
   }

   function distribution(rows, field, labels = {}) {
      const counts = new Map();
      for (const row of rows) counts.set(row[field], (counts.get(row[field]) || 0) + 1);
      return Array.from(counts, ([key, count]) => ({
         label: labels[key] || key,
         count,
         share: count / rows.length,
      })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
   }

   function summarize({ type, from, to, region, category }) {
      const base = rows[type].filter((row) => row.month >= from && row.month <= to && (!region || row.region === region));
      const selected = base.filter((row) => row.agricultural && (!category || row.category === category));
      const count = selected.length;
      const group = groups[type];
      return {
         count,
         agriculturalShare: base.length ? count / base.length : null,
         amountMedian: median(selected, 'amount'),
         revenueMedian: type === 'company' ? median(selected, 'revenue') : null,
         monthly: Array.from({ length: to - from + 1 }, (_, index) => {
            const month = from + index;
            const monthRows = selected.filter((row) => row.month === month);
            return { month, count: monthRows.length, amountMedian: median(monthRows, 'amount') };
         }),
         region: distribution(selected, 'region'),
         category: distribution(selected, 'category', group.categories),
         purpose: distribution(selected, 'purpose', group.purposes),
         product: distribution(selected, 'product', group.products),
      };
   }

   return { regions, groups, summarize };
})();
