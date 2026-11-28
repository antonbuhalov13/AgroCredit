// Маршруты: словари, приём заявки из формы, загрузка CSV.
const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { wrap } = require('../http');
const { reference, contextFromDb } = require('../reference');
const { validateApplication } = require('../validate');
const { importCsv, insertApplication } = require('../importer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // файл в памяти, до 5 МБ

// GET /api/dictionaries — коды и русские подписи для форм и фильтров
router.get('/dictionaries', wrap(async (req, res) => {
  const [professions, industries] = await Promise.all([
    pool.query('SELECT id, name, is_agricultural FROM professions ORDER BY id'),
    pool.query('SELECT id, name, is_agricultural FROM company_industries ORDER BY id')]);
  const { client_types, regions, products, purposes, product_purposes, company_sizes, other_profession_id, other_company_industry_id } = reference;
  res.json({ client_types, regions, products, purposes, product_purposes, company_sizes, other_profession_id, other_company_industry_id, professions: professions.rows, company_industries: industries.rows });
}));

// POST /api/applications — заявка из формы (JSON). id и дату ставит сервер.
router.post('/applications', wrap(async (req, res) => {
  const { errors, value } = validateApplication(req.body || {}, await contextFromDb(pool));
  if (errors.length) return res.status(400).json({ errors });
  let id = null;
  for (let attempt = 0; attempt < 3 && id === null; attempt++) id = await insertApplication(pool, value); // повтор на случай гонки id с импортом
  if (id === null) throw new Error('id allocation failed');
  res.status(201).json({ id });
}));

// POST /api/upload — CSV (multipart, поле "file")
router.post('/upload', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: { code: 'NO_FILE', message: 'Файл не передан (поле "file")' } });
  res.json(await importCsv(req.file.buffer, pool));
}));

module.exports = router;
