// Строгий разбор CSV формата 0.1 (UTF-8, разделитель ;, без переносов строк внутри поля).
// Любая ошибка САМОГО файла (кодировка, заголовок, кавычки, число полей, пустая строка внутри)
// бросает CsvFileError: тогда ничего не загружается. Ошибки значений проверяет validate.js построчно.
class CsvFileError extends Error {
  constructor(code, message) { super(message); this.code = code; this.status = 400; }
}

function splitLine(line, lineNo) {
  const cells = [];
  let cell = '', quoted = false, closed = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else cell += ch;
    } else if (ch === ';') { cells.push(cell); cell = ''; closed = false; }
    else if (ch === '"' && !cell && !closed) quoted = true;
    else {
      if (ch === '"' || closed) throw new CsvFileError('INVALID_QUOTES', `Строка ${lineNo}: некорректные кавычки`);
      cell += ch;
    }
  }
  if (quoted) throw new CsvFileError('INVALID_QUOTES', `Строка ${lineNo}: не закрыты кавычки`);
  cells.push(cell);
  return cells;
}

// buffer — содержимое файла. columns — ожидаемый заголовок. Возвращает [{ line, record }].
function parseCsv(buffer, columns, optionalColumns = []) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } // BOM при этом отбрасывается
  catch { throw new CsvFileError('INVALID_ENCODING', 'Файл должен быть в кодировке UTF-8'); }
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();     // пустые строки в конце игнорируем
  const header = lines.length ? splitLine(lines[0], 1) : [];
  const extended = [...columns, ...optionalColumns];
  if (header.length > columns.length && header.length <= extended.length && header.every((name, index) => name === extended[index])) {
    columns = extended.slice(0, header.length);
  }
  if (!lines.length || JSON.stringify(header) !== JSON.stringify(columns))
    throw new CsvFileError('INVALID_HEADER', 'Неверный заголовок: ожидаются ' + columns.length + ' полей в порядке формата 0.1');
  return lines.slice(1).map((l, i) => {
    const line = i + 2;                                                    // номер физической строки файла
    if (l === '') throw new CsvFileError('EMPTY_LINE', `Строка ${line}: пустая строка внутри набора`);
    const cells = splitLine(l, line);
    if (cells.length !== columns.length) throw new CsvFileError('INVALID_COLUMNS', `Строка ${line}: ожидается полей ${columns.length}, найдено ${cells.length}`);
    return { line, record: Object.fromEntries(columns.map((c, j) => [c, cells[j]])) };
  });
}

module.exports = { parseCsv, CsvFileError };
