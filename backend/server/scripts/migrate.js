const fs = require('node:fs');
const path = require('node:path');
const pool = require('../db');

async function migrate() {
  const client = await pool.connect();
  try {
    const directory = path.join(__dirname, '../../db/migrations');
    for (const file of fs.readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.query(fs.readFileSync(path.join(directory, file), 'utf8'));
    }
    console.log('Миграции выполнены. Существующие заявки сохранены.');
  } finally {
    client.release();
  }
}

migrate().catch(error => {
  console.error(`Не удалось обновить схему БД (${error.code || 'ошибка подключения'}). Проверьте запуск PostgreSQL и настройки .env.`);
  process.exitCode = 1;
}).finally(() => pool.end());
