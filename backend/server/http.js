// Общие мелочи HTTP-слоя. В Express 4 ошибки внутри async-функций сами не ловятся,
// поэтому маршруты оборачиваем в wrap(), а ошибки обрабатывает errorHandler.
const { CsvFileError } = require('./csv');

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Формат ошибок общий с аналитикой: { error: { code, message } }
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = 500, code = 'INTERNAL_ERROR', message = 'Внутренняя ошибка сервера';
  if (err.type === 'entity.parse.failed') [status, code, message] = [400, 'INVALID_JSON', 'Некорректный JSON'];
  else if (err.type === 'entity.too.large') [status, code, message] = [413, 'PAYLOAD_TOO_LARGE', 'Слишком большое тело запроса'];
  else if (err.code === 'LIMIT_FILE_SIZE') [status, code, message] = [413, 'FILE_TOO_LARGE', 'Файл больше 5 МБ'];
  else if (err instanceof CsvFileError) [status, code, message] = [400, err.code, err.message];
  // В лог — только тип ошибки: сообщения БД могут содержать данные заявок.
  if (status === 500) console.error('[server]', err.name, err.code || '');
  res.status(status).json({ error: { code, message } });
}

module.exports = { wrap, errorHandler };
