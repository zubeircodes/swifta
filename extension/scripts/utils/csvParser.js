const normalizeLineEndings = (text) => text.replace(/\r\n?/g, "\n");
const stripByteOrderMark = (text) =>
  text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

const tokenize = (text) => {
  const rows = [];
  let currentField = "";
  let currentRow = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      const nextChar = text[i + 1];
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = "";
      continue;
    }

    if (char === '\n' && !inQuotes) {
      currentRow.push(currentField.trim());
      rows.push(currentRow);
      currentField = "";
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((value) => value !== ""));
};

export const parseCSV = (rawText) => {
  if (!rawText || typeof rawText !== "string") {
    return [];
  }

  const sanitizedText = stripByteOrderMark(rawText);
  const rows = tokenize(normalizeLineEndings(sanitizedText));
  if (rows.length === 0) {
    return [];
  }

  const header = rows[0].map((cell) => cell.toLowerCase());
  const dataRows = rows.slice(1);

  return dataRows
    .map((row) => {
      if (row.length === 0) {
        return null;
      }

      const record = {};
      header.forEach((key, index) => {
        record[key] = row[index] ?? "";
      });
      return record;
    })
    .filter(Boolean);
};
