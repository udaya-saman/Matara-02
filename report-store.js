/* Offline-first, per-outlet report storage. No network calls. */
(function (global) {
  'use strict';
  var DB_KEY = 'ph_report_database_v3';
  var OUTLET_KEY = 'ph_report_selected_outlet_v1';
  var IMPORT_UNDO_KEY = 'ph_report_pre_import_v3';
  var OUTLETS = ['Akuressa', 'Embilipitiya', 'Monaragala', 'Matara', 'Matara 02', 'Tangalle'];
  var DEFAULT_OUTLET = 'Matara 02';
  var DAY_FIELDS = [
    'dayTarget', 'todaySale', 'under30', 'hotFresh', 'outOfDoor',
    'productionU3', 'deliveryTx', 'dispatchDev', 'todayRiders',
    'todayDriveTime', 'todayStar1', 'todayStar2', 'todayStar3',
    'todayStar4', 'todayStar5', 'todayGes', 'hutTodayOnTime',
    'hutTodayLate', 'hutTodayMissed',
    'mtdSale', 'mtdTx', 'mtdDel200', 'mtdDel500', 'mtdU3',
    'mtdU12', 'mtdU20', 'mtdU30', 'star1', 'star2', 'star3',
    'star4', 'star5', 'smartGes', 'totalResponses', 'mtdWinScore'
  ];
  var MONTH_FIELDS = [
    'monthlyTarget', 'mtdTarget', 'hutMtdOnTime', 'hutMtdLate', 'hutMtdMissed'
  ];
  var YEAR_FIELDS = ['hutYtdOnTime'];
  function validDate(s) {
    if (typeof s !== 'string' || !/^\d{4}\.\d{2}\.\d{2}$/.test(s)) return false;
    var p = s.split('.').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.getUTCFullYear() === p[0] && d.getUTCMonth() + 1 === p[1] && d.getUTCDate() === p[2];
  }
  function period(s) { return s.slice(0, 7); }
  function year(s) { return s.slice(0, 4); }
  function blank() { return {values: {}, customCalcs: {}, updatedAt: Date.now()}; }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function getOutlet() {
    var selected = global.localStorage.getItem(OUTLET_KEY);
    return OUTLETS.indexOf(selected) >= 0 ? selected : DEFAULT_OUTLET;
  }
  function setOutlet(name) {
    if (OUTLETS.indexOf(name) < 0) throw new Error('Unknown outlet');
    global.localStorage.setItem(OUTLET_KEY, name);
  }
  function normaliseDB(db) {
    if (!db || db.version !== 3 || !db.outlets || typeof db.outlets !== 'object' || Array.isArray(db.outlets)) {
      throw new Error('Saved report database is not valid; no data has been overwritten.');
    }
    return db;
  }
  function getDB() {
    var raw = global.localStorage.getItem(DB_KEY);
    if (raw) {
      try { return normaliseDB(JSON.parse(raw)); }
      catch (err) { throw new Error('Saved reports could not be read. Export a backup before making more changes.'); }
    }
    var db = {version: 3, outlets: {}};
    // Read the old storage WITHOUT deleting or overwriting it.
    try {
      var saved = JSON.parse(global.localStorage.getItem('ph_daily_report_v2') || 'null');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        var date = validDate(saved.date) ? saved.date : global.localStorage.getItem('ph_saved_day');
        if (validDate(date)) {
          var outlet = getOutlet();
          var values = {};
          Object.keys(saved).forEach(function (key) {
            if (key !== '_customCalcs' && key !== 'date') values[key] = saved[key];
          });
          var entry = blank();
          entry.values = values;
          entry.customCalcs = saved._customCalcs && typeof saved._customCalcs === 'object' ? saved._customCalcs : {};
          db.outlets[outlet] = {reports: {}, backup: null, mis: null};
          db.outlets[outlet].reports[date] = entry;
          try {
            var mis = JSON.parse(global.localStorage.getItem('ph_mis_data') || 'null');
            if (mis && mis.data) db.outlets[outlet].mis = mis;
          } catch (ignored) {}
        }
      }
    } catch (ignored) {}
    // Even an empty database is written so migration is never repeated.
    global.localStorage.setItem(DB_KEY, JSON.stringify(db));
    return db;
  }
  function saveDB(db) { global.localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  function validMonthKey(s) {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(String(s || ''))) return false;
    return Number(s.slice(0,4)) >= 2000 && Number(s.slice(0,4)) <= 2200;
  }
  function inferMISMonth(mis) {
    if (!mis || typeof mis !== 'object') return null;
    var direct = mis.period || (mis.reportYear && mis.reportMonth
      ? String(mis.reportYear) + '-' + String(mis.reportMonth).padStart(2,'0') : '');
    if (validMonthKey(direct)) return direct;
    var entries = mis.data && Object.values(mis.data);
    if (entries) {
      for (var i = 0; i < entries.length; i++) {
        var r = entries[i];
        if (r && Number.isInteger(r.dateYear) && Number.isInteger(r.dateMonth)) {
          var k = String(r.dateYear) + '-' + String(r.dateMonth).padStart(2,'0');
          if (validMonthKey(k)) return k;
        }
      }
    }
    var name = String(mis.filename || '');
    var match = name.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*[-_ ]*\s*(20\d{2})\b/i);
    if (match) {
      var months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      return match[2] + '-' + String(months.indexOf(match[1].toLowerCase().slice(0,3)) + 1).padStart(2,'0');
    }
    return null;
  }
  function area(db, outlet) {
    if (OUTLETS.indexOf(outlet) < 0) throw new Error('Unknown outlet');
    if (!db.outlets[outlet]) db.outlets[outlet] = {reports: {}, backup: null, mis: null};
    if (!db.outlets[outlet].reports || typeof db.outlets[outlet].reports !== 'object') db.outlets[outlet].reports = {};
    var a = db.outlets[outlet];
    if (!a.misByMonth || typeof a.misByMonth !== 'object' || Array.isArray(a.misByMonth)) a.misByMonth = {};
    // The original single MIS report is preserved, while being lazily indexed by month.
    var oldMonth = inferMISMonth(a.mis);
    if (oldMonth && !a.misByMonth[oldMonth]) a.misByMonth[oldMonth] = clone(a.mis);
    return a;
  }
  function rollover(previous, oldDate, newDate) {
    var next = clone(previous);
    if (!next.values || typeof next.values !== 'object') next.values = {};
    DAY_FIELDS.forEach(function (key) { delete next.values[key]; });
    delete next.values._skipMISAutoFill;
    if (period(oldDate) !== period(newDate)) MONTH_FIELDS.forEach(function (key) { delete next.values[key]; });
    if (year(oldDate) !== year(newDate)) YEAR_FIELDS.forEach(function (key) { delete next.values[key]; });
    // None of the previous day's manual calculation overrides may leak into the new day.
    next.customCalcs = {};
    next.updatedAt = Date.now();
    return next;
  }
  function load(outlet, date, seedFromPrevious) {
    if (!validDate(date)) throw new Error('Invalid report date');
    var db = getDB(), a = area(db, outlet), found = a.reports[date];
    if (!found) {
      var previousDates = Object.keys(a.reports).filter(function (d) { return validDate(d) && d < date; }).sort();
      var previous = previousDates.length ? previousDates[previousDates.length - 1] : null;
      found = previous && seedFromPrevious ? rollover(a.reports[previous], previous, date) : blank();
      a.reports[date] = found;
      saveDB(db);
    }
    return clone(found);
  }
  function save(outlet, date, values, customCalcs) {
    if (!validDate(date)) throw new Error('Invalid report date');
    var db = getDB(), a = area(db, outlet);
    a.reports[date] = {
      values: clone(values || {}),
      customCalcs: clone(customCalcs || {}),
      updatedAt: Date.now()
    };
    saveDB(db);
  }
  function reset(outlet, date) {
    var db = getDB(), a = area(db, outlet);
    a.backup = {date: date, record: clone(a.reports[date] || blank())};
    a.reports[date] = blank();
    // An explicit reset must remain empty after app reload, even with an MIS file loaded.
    a.reports[date].values._skipMISAutoFill = true;
    saveDB(db);
  }
  function canRestore(outlet, date) {
    var a = area(getDB(), outlet);
    return !!(a.backup && a.backup.date === date && a.backup.record);
  }
  function restore(outlet, date) {
    var db = getDB(), a = area(db, outlet);
    if (!a.backup || a.backup.date !== date || !a.backup.record) return false;
    a.reports[date] = clone(a.backup.record);
    a.backup = null;
    saveDB(db);
    return true;
  }
  function getMIS(outlet, monthKey) {
    var a = area(getDB(), outlet);
    if (monthKey != null) {
      if (!validMonthKey(monthKey)) return null;
      var periodMIS = a.misByMonth[monthKey];
      // Never use undated legacy MIS as a fallback for a specific month.
      // An unknown reporting period cannot be safely matched to an outlet/date.
      return periodMIS ? clone(periodMIS) : null;
    }
    if (a.mis) return clone(a.mis);
    var months = Object.keys(a.misByMonth).filter(validMonthKey).sort();
    return months.length ? clone(a.misByMonth[months[months.length - 1]]) : null;
  }
  function getMISMonths(outlet) {
    return Object.keys(area(getDB(),outlet).misByMonth).filter(validMonthKey).sort();
  }
  function setMIS(outlet, value) {
    if (!value || !value.data || typeof value.data !== 'object' ||
        Array.isArray(value.data) || !Object.keys(value.data).length) {
      throw new Error('Invalid MIS report');
    }
    var monthKey = inferMISMonth(value);
    var db = getDB(), a = area(db, outlet);
    var next = clone(value);
    if (monthKey) {
      next.period = monthKey;
      a.misByMonth[monthKey] = next;
    }
    // An old report without year metadata stays accessible by the legacy
    // single-MIS API. Only identifiable reporting periods are indexed.
    a.mis = clone(next);
    saveDB(db);
  }
  function exportBackup() {
    return JSON.stringify({format: 'PH-Daily-Report-Backup', version: 3, exportedAt: new Date().toISOString(),
      outlet: getOutlet(), database: getDB()}, null, 2);
  }
  function isRecordMap(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }
  function validateImportPayload(json) {
    var payload;
    try {
      payload = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (err) {
      throw new Error('Backup is not valid JSON.');
    }
    if (!payload || payload.format !== 'PH-Daily-Report-Backup' || payload.version !== 3 ||
        !payload.database || payload.database.version !== 3 ||
        !isRecordMap(payload.database.outlets)) {
      throw new Error('This is not a compatible report backup.');
    }
    var data = payload.database.outlets;
    if (Object.keys(data).some(function (outlet) {return OUTLETS.indexOf(outlet) < 0;})) {
      throw new Error('Backup contains an unknown outlet.');
    }
    var total = 0, maxReports = 12000;
    Object.keys(data).forEach(function (outlet) {
      var source = data[outlet];
      if (!isRecordMap(source) || !isRecordMap(source.reports)) {
        throw new Error('Backup outlet reports have an invalid structure: ' + outlet);
      }
      Object.keys(source.reports).forEach(function (date) {
        if (!validDate(date)) throw new Error('Invalid date in backup: ' + date);
        total++;
        if (total > maxReports) throw new Error('Backup includes too many reports.');
        validateRecord(source.reports[date], date);
      });
      if (source.mis != null && (!isRecordMap(source.mis) || !isRecordMap(source.mis.data))) {
        throw new Error('Backup contains an invalid MIS report for ' + outlet);
      }
      if (source.misByMonth != null) {
        if (!isRecordMap(source.misByMonth)) throw new Error('Invalid monthly MIS collection for ' + outlet);
        Object.keys(source.misByMonth).forEach(function (month) {
          var mis = source.misByMonth[month];
          if (!validMonthKey(month) || !isRecordMap(mis) || !isRecordMap(mis.data) || !Object.keys(mis.data).length) {
            throw new Error('Invalid monthly MIS data for ' + outlet + ' (' + month + ')');
          }
        });
      }
      if (source.backup != null) {
        if (!isRecordMap(source.backup) || !validDate(source.backup.date)) {
          throw new Error('Backup contains an invalid reset record for ' + outlet);
        }
        validateRecord(source.backup.record, source.backup.date);
      }
    });
    return payload;
  }
  function validateRecord(record, date) {
    if (!isRecordMap(record) || !isRecordMap(record.values) ||
        (record.customCalcs != null && !isRecordMap(record.customCalcs))) {
      throw new Error('Invalid report structure for ' + date);
    }
    Object.keys(record.values).forEach(function (key) {
      if (['__proto__','constructor','prototype'].indexOf(key) >= 0) throw new Error('Invalid field name in backup');
      var val = record.values[key];
      if (key === '_skipMISAutoFill') {
        if (typeof val !== 'boolean') throw new Error('Invalid MIS reset flag');
      } else if (!(typeof val === 'string' || typeof val === 'number' || val === null) ||
                 (typeof val === 'string' && val.length > 200) ||
                 (typeof val === 'number' && !Number.isFinite(val))) {
        throw new Error('Invalid stored value for ' + key);
      }
    });
    Object.keys(record.customCalcs || {}).forEach(function (key) {
      if (['__proto__','constructor','prototype'].indexOf(key) >= 0) throw new Error('Invalid calculation key');
      var val = record.customCalcs[key];
      if (!(typeof val === 'number' && Number.isFinite(val)) &&
          !(typeof val === 'string' && val.trim() !== '' && Number.isFinite(Number(val)))) {
        throw new Error('Invalid saved calculated value for ' + key);
      }
    });
    if (record.updatedAt != null && (!Number.isFinite(Number(record.updatedAt)) || Number(record.updatedAt) < 0)) {
      throw new Error('Invalid report timestamp for ' + date);
    }
  }
  function previewBackup(json) {
    var payload = validateImportPayload(json), db = getDB();
    var stats = {incoming: 0, newReports: 0, conflicts: 0, outlets: 0};
    Object.keys(payload.database.outlets).forEach(function (outlet) {
      stats.outlets++;
      var source = payload.database.outlets[outlet].reports;
      var existing = db.outlets[outlet] && db.outlets[outlet].reports || {};
      Object.keys(source).forEach(function (date) {
        stats.incoming++;
        if (existing[date]) stats.conflicts++; else stats.newReports++;
      });
    });
    return stats;
  }
  function importBackup(json, preferBackup) {
    var payload = validateImportPayload(json);
    var db = getDB(), incoming = payload.database.outlets;
    var stats = {added: 0, keptExisting: 0, replaced: 0, outlets: 0};
    // Validate all incoming reports before modifying anything. Keep a local undo snapshot.
    var originalJSON = JSON.stringify(db);
    Object.keys(incoming).forEach(function (outlet) {
      var src = incoming[outlet], dest = area(db, outlet);
      stats.outlets++;
      Object.keys(src.reports).forEach(function (date) {
        var record = src.reports[date];
        if (dest.reports[date] && !preferBackup) {
          stats.keptExisting++;
          return;
        }
        if (dest.reports[date]) stats.replaced++; else stats.added++;
        dest.reports[date] = {
          values: clone(record.values),
          customCalcs: clone(record.customCalcs || {}),
          updatedAt: Number(record.updatedAt) || Date.now()
        };
      });
      if (!dest.mis && src.mis && src.mis.data) dest.mis = clone(src.mis);
      if (src.misByMonth) Object.keys(src.misByMonth).forEach(function (month) {
        if (!dest.misByMonth[month]) dest.misByMonth[month] = clone(src.misByMonth[month]);
      });
      if (!dest.backup && src.backup) dest.backup = clone(src.backup);
    });
    // Fail safely if storage is full, rather than importing without an undo snapshot.
    global.localStorage.setItem(IMPORT_UNDO_KEY, originalJSON);
    try { saveDB(db); }
    catch (err) {
      global.localStorage.removeItem(IMPORT_UNDO_KEY);
      throw err;
    }
    return stats;
  }
  function canUndoImport() {
    return !!global.localStorage.getItem(IMPORT_UNDO_KEY);
  }
  function undoImport() {
    var previous = global.localStorage.getItem(IMPORT_UNDO_KEY);
    if (!previous) return false;
    // Undo is explicit because any edits made since importing will also be undone.
    var db = normaliseDB(JSON.parse(previous));
    saveDB(db);
    global.localStorage.removeItem(IMPORT_UNDO_KEY);
    return true;
  }
  // Sri Lankan operating day: 06:00 to 05:59, independent of the device timezone.
  function operationalDate(reference) {
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(reference || new Date());
    var p = {};
    parts.forEach(function (item) { p[item.type] = item.value; });
    var y = Number(p.year), m = Number(p.month), d = Number(p.day);
    if (Number(p.hour) < 6) {
      var prev = new Date(Date.UTC(y, m - 1, d - 1));
      y = prev.getUTCFullYear(); m = prev.getUTCMonth() + 1; d = prev.getUTCDate();
    }
    return String(y).padStart(4, '0') + '.' + String(m).padStart(2, '0') + '.' + String(d).padStart(2, '0');
  }
  global.ReportStore = {
    OUTLETS: OUTLETS.slice(), getOutlet: getOutlet, setOutlet: setOutlet,
    load: load, save: save, reset: reset, canRestore: canRestore, restore: restore,
    getMIS: getMIS, getMISMonths: getMISMonths, setMIS: setMIS, exportBackup: exportBackup, importBackup: importBackup,
    previewBackup: previewBackup, canUndoImport: canUndoImport, undoImport: undoImport,
    operationalDate: operationalDate, rollover: rollover, validDate: validDate
  };
})(globalThis);
