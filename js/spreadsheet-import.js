(function (g) {
    'use strict';

    let loadPromise = null;

    function hasSheetJS() {
        return !!(g.XLSX && typeof g.XLSX.read === 'function' && g.XLSX.utils && typeof g.XLSX.utils.sheet_to_json === 'function');
    }

    function loadSheetJS() {
        if (hasSheetJS()) return Promise.resolve(g.XLSX);
        if (loadPromise) return loadPromise;

        loadPromise = new Promise(function (resolve, reject) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            script.async = true;
            script.onload = function () {
                if (hasSheetJS()) resolve(g.XLSX);
                else reject(new Error('Excel workbook support did not load.'));
            };
            script.onerror = function () {
                loadPromise = null;
                reject(new Error('Excel workbook support did not load. Check the internet connection and try again.'));
            };
            document.head.appendChild(script);
        });
        return loadPromise;
    }

    async function readRows(file) {
        if (!file || typeof file.arrayBuffer !== 'function') {
            throw new Error('This browser could not read the Excel file.');
        }
        const xlsx = await loadSheetJS();
        const workbook = xlsx.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        const names = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
        const rows = [];
        names.forEach(function (name) {
            const sheet = workbook.Sheets && workbook.Sheets[name];
            if (!sheet) return;
            if (rows.length) rows.push([]);
            const sheetRows = xlsx.utils.sheet_to_json(sheet, {
                header: 1,
                raw: true,
                defval: '',
                blankrows: true
            });
            if (Array.isArray(sheetRows)) Array.prototype.push.apply(rows, sheetRows);
        });
        if (!rows.some(function (row) { return Array.isArray(row) && row.some(function (cell) { return String(cell == null ? '' : cell).trim() !== ''; }); })) {
            throw new Error('This workbook does not contain a readable worksheet.');
        }
        return rows;
    }

    g.SpreadsheetImport = { readRows: readRows };
})(window);
