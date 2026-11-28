// Общий каркас Express: подключаем модули. Своя строка у каждого участника, чужие файлы не правим.
const express = require('express');
const { errorHandler } = require('./http');
const app = express();

// Фронтенд может быть открыт на другом адресе (например Live Server :5500)
app.use((req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '100kb' }));                  // общий разбор JSON для всех маршрутов

app.use('/api', require('./routes/applications'));          // словари, заявки, загрузка CSV
app.use('/api', require('./routes/analytics'));             // POST /api/analytics (модуль аналитики)
// app.use('/api/ai', require('./routes/ai'));              // ИИ — когда будет готов

app.use(errorHandler);                                       // всегда последним
module.exports = app;
