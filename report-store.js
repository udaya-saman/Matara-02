/* Offline-first, per-outlet report storage. No network calls. */
(function (global) {
  'use strict';
  var DB_KEY = 'ph_report_database_v3';
  var OUTLET_KEY = 'ph_report_selected_outlet_v1';
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
      return {version: 3, outlets: {}};
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
  function area(db, outlet) {
    if (OUTLETS.indexOf(outlet) < 0) throw new Error('Unknown outlet');
    if (!db.outlets[outlet]) db.outlets[outlet] = {reports: {}, backup: null, mis: null};
    if (!db.outlets[outlet].reports || typeof db.outlets[outlet].reports !== 'object') db.outlets[outlet].reports = {};
    return db.outlets[outlet];
  }
  function rollover(previous, oldDate, newDate) {
    var next = clone(previous);
    if (!next.values || typeof next.values !== 'object') next.values = {};
    DAY_FIELDS.forEach(function (key) { delete next.values[key]; });
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
  function getMIS(outlet) {
    var mis = area(getDB(), outlet).mis;
    return mis ? clone(mis) : null;
  }
  function setMIS(outlet, value) {
    if (!value || !value.data || typeof value.data !== 'object' || !Object.keys(value.data).length) {
      throw new Error('Invalid MIS report');
    }
    var db = getDB();
    area(db, outlet).mis = clone(value);
    saveDB(db);
  }
  function exportBackup() {
    return JSON.stringify({format: 'PH-Daily-Report-Backup', version: 3, exportedAt: new Date().toISOString(),
      outlet: getOutlet(), database: getDB()}, null, 2);
  }
  function importBackup(json) {
    var payload = typeof json === 'string' ? JSON.parse(json) : json;
    if (!payload || payload.format !== 'PH-Daily-Report-Backup' || payload.version !== 3 ||
        !payload.database || payload.database.version !== 3 || !payload.database.outlets) {
      throw new Error('This is not a compatible report backup.');
    }
    var db = getDB(), incoming = payload.database.outlets;
    Object.keys(incoming).forEach(function (outlet) {
      if (OUTLETS.indexOf(outlet) < 0) return;
      var src = incoming[outlet], dest = area(db, outlet);
      if (!src || typeof src !== 'object' || !src.reports || typeof src.reports !== 'object') return;
      Object.keys(src.reports).forEach(function (date) {
        var record = src.reports[date];
        if (!validDate(date) || !record || !record.values || typeof record.values !== 'object' ||
            Array.isArray(record.values)) return;
        if (!dest.reports[date] || (Number(record.updatedAt) || 0) > (Number(dest.reports[date].updatedAt) || 0)) {
          dest.reports[date] = {values: clone(record.values), customCalcs: clone(record.customCalcs || {}),
            updatedAt: Number(record.updatedAt) || Date.now()};
        }
      });
      if (!dest.mis && src.mis && src.mis.data) dest.mis = clone(src.mis);
    });
    saveDB(db);
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
    getMIS: getMIS, setMIS: setMIS, exportBackup: exportBackup, importBackup: importBackup,
    operationalDate: operationalDate, rollover: rollover, validDate: validDate
  };
})(globalThis);
