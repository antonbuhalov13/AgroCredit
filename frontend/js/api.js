// Демо открывается напрямую. Режим сервера включается через ?mode=api.
const agroApi = (() => {
   const enabled = new URLSearchParams(location.search).get('mode') === 'api';
   const liveServer = location.port === '5500' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
   const base = location.protocol === 'file:' ? 'http://localhost:3000/api'
      : liveServer ? `http://${location.hostname}:3000/api` : '/api';

   async function request(path, options) {
      let response;
      try {
         response = await fetch(base + path, options);
      } catch (error) {
         if (error.name === 'AbortError') throw error;
         throw new Error('Сервер недоступен. Проверьте подключение и попробуйте ещё раз.');
      }
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
         throw new Error(data?.errors?.map(({ message }) => message).join(' ')
            || data?.error?.message || `Сервер вернул некорректный ответ (HTTP ${response.status}).`);
      }
      return data;
   }

   function post(path, body, signal) {
      return request(path, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body),
         signal,
      });
   }

   function setupNavigation() {
      if (!enabled) return;
      document.querySelector('.demo').textContent = 'Сервер';
      for (const link of document.querySelectorAll('.site-header a')) link.search = '?mode=api';
   }

   return {
      enabled,
      setupNavigation,
      getDictionaries: () => request('/dictionaries'),
      getAnalytics: (filters, signal) => post('/analytics', filters, signal),
      submitApplication: (application) => post('/applications', application),
      uploadCsv(file) {
         const body = new FormData();
         body.append('file', file);
         return request('/upload', { method: 'POST', body });
      },
   };
})();
