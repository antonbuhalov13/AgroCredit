// POST /api/analytics — подключение модуля аналитики (analytics/analytics/service.mjs в корне репозитория).
// Модуль написан как ES-модуль (.mjs), а сервер на CommonJS, поэтому подключаем через import().
const express = require('express');
const pool = require('../db');
const { wrap } = require('../http');

const router = express.Router();
let service;
const load = () => (service ??= import('../../../analytics/analytics/service.mjs'));

router.post('/analytics', wrap(async (req, res) => {
  const { getAnalytics, publicError } = await load();
  try { res.json(await getAnalytics(pool, req.body)); }
  catch (error) { const r = publicError(error); res.status(r.status).json(r.body); }
}));

module.exports = router;
