const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const birthdaySheet = {};
const otherSheet = {};
const calls = [];
const window = {
  XLSX: {
    read(buffer, options) {
      calls.push({ kind: 'read', buffer, options });
      return { SheetNames: ['BIZ Birthdays', 'Notes'], Sheets: { 'BIZ Birthdays': birthdaySheet, Notes: otherSheet } };
    },
    utils: {
      sheet_to_json(sheet, options) {
        calls.push({ kind: 'sheet', sheet, options });
        if (sheet === birthdaySheet) return [
          ['BIZ Agent Birthdays'],
          [],
          ['Agent Name', 'Birthday'],
          ['Devyanie Mangru', new Date(2008, 1, 28)]
        ];
        return [['Prior Report'], ['Agent', 'Date']];
      }
    }
  }
};
const document = { createElement() { throw new Error('The preloaded reader should be reused.'); } };
vm.runInNewContext(fs.readFileSync(require.resolve('../js/spreadsheet-import.js'), 'utf8'), { window, document });

(async () => {
  const buffer = new Uint8Array([80, 75, 3, 4]).buffer;
  const rows = await window.SpreadsheetImport.readRows({ arrayBuffer: async () => buffer });
  assert.equal(calls[0].kind, 'read');
  assert.equal(calls[0].buffer, buffer);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options)), { type: 'array', cellDates: true });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.filter(call => call.kind === 'sheet').map(call => call.options))), [
    { header: 1, raw: true, defval: '', blankrows: true },
    { header: 1, raw: true, defval: '', blankrows: true }
  ]);
  assert.equal(rows[2][0], 'Agent Name');
  assert.ok(rows[3][1] instanceof Date);
  assert.equal(rows[5][0], 'Prior Report', 'rows from all worksheets remain available to the report importer');
  console.log('Spreadsheet import: SheetJS workbook decoding keeps blank rows and typed Excel dates across sheets.');
})().catch(error => { console.error(error); process.exitCode = 1; });
