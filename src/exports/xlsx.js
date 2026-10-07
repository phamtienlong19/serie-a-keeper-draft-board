// Minimal OOXML workbook: typed cells, inline strings, frozen headers, filters.
// Stored ZIP entries avoid a compression dependency for these small exports.
const encoder = new TextEncoder();
const xml = (value) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function bytes(length, fields) {
  const result = new Uint8Array(length), view = new DataView(result.buffer);
  for (const [offset, value, size = 4] of fields) size === 2 ? view.setUint16(offset, value, true) : view.setUint32(offset, value, true);
  return result;
}
function join(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function zip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = encoder.encode(path), data = encoder.encode(content), crc = crc32(data);
    const header = bytes(30, [[0, 0x04034b50], [4, 20, 2], [12, 33, 2], [14, crc], [18, data.length], [22, data.length], [26, name.length, 2]]);
    local.push(header, name, data);
    central.push(bytes(46, [[0, 0x02014b50], [4, 20, 2], [6, 20, 2], [14, 33, 2], [16, crc], [20, data.length], [24, data.length], [28, name.length, 2], [42, offset]]), name);
    offset += header.length + name.length + data.length;
  }
  const directory = join(central), count = Object.keys(files).length;
  return join([...local, directory, bytes(22, [[0, 0x06054b50], [8, count, 2], [10, count, 2], [12, directory.length], [16, offset]])]);
}
function column(index) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export function buildXlsx(sheets) {
  const files = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="styles" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  };
  sheets.forEach((sheet, i) => {
    const headers = Object.keys(sheet.rows[0] ?? { Status: "" });
    const rows = [headers, ...sheet.rows.map((row) => headers.map((key) => row[key]))];
    files[`xl/worksheets/sheet${i + 1}.xml`] = `<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${headers.map((h, j) => `<col min="${j + 1}" max="${j + 1}" width="${Math.min(45, Math.max(13, h.length + 2, ...sheet.rows.map((r) => String(r[h] ?? "").length + 2)))}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${column(c)}${r + 1}" s="${r === 0 ? 1 : 0}" t="${typeof value === "number" && Number.isFinite(value) ? "n" : "inlineStr"}">${typeof value === "number" && Number.isFinite(value) ? `<v>${value}</v>` : `<is><t xml:space="preserve">${xml(value)}</t></is>`}</c>`).join("")}</row>`).join("")}</sheetData><autoFilter ref="A1:${column(headers.length - 1)}${rows.length}"/></worksheet>`;
  });
  return zip(files);
}
