/* Run with: node tests/report-store.test.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const storage = new Map();
const localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); }
};
const context = {localStorage, Date, Intl};
vm.createContext(context);
vm.runInContext(fs.readFileSync('report-store.js', 'utf8'), context);
const app = context.ReportStore;
assert.equal(app.OUTLETS.length, 6);
assert.equal(app.getOutlet(), 'Matara 02');
assert.throws(() => app.setOutlet('Unknown'), /Unknown outlet/);
app.setOutlet('Akuressa');
assert.equal(app.getOutlet(), 'Akuressa');
app.setOutlet('Matara 02');
assert.equal(app.operationalDate(new Date('2026-11-15T00:29:59Z')), '2026.11.14');
assert.equal(app.operationalDate(new Date('2026-11-15T00:30:00Z')), '2026.11.15');
assert.equal(app.operationalDate(new Date('2027-01-01T00:29:59Z')), '2026.12.31');
assert.equal(app.operationalDate(new Date('2027-01-01T00:30:00Z')), '2027.01.01');
assert.equal(app.validDate('2026.02.29'), false);
assert.equal(app.validDate('2028.02.29'), true);
app.save('Matara 02', '2026.11.14', {
  mtdSale:'5000',mtdTx:'25',todaySale:'200',star1:'2',star5:'10',mtdWinScore:'95%',
  mtdDel200:'95%',mtdU12:'35%',hutMtdOnTime:'95%',monthlyTarget:'100000',
  hutYtdOnTime:'98%',overallRating:'4.6',mtdTarget:'40000'
}, {ADS:200, 'MTD Top Box':80});
const today = app.load('Matara 02','2026.11.15',true);
for (const field of ['mtdSale','mtdTx','todaySale','star1','star5','mtdWinScore','mtdDel200','mtdU12']) {
  assert.equal(today.values[field], undefined, 'Cleared on new day: ' + field);
}
assert.equal(today.values.hutMtdOnTime,'95%');
assert.equal(today.values.monthlyTarget,'100000');
assert.equal(today.values.overallRating,'4.6');
assert.equal(today.values.hutYtdOnTime,'98%');
assert.equal(Object.keys(today.customCalcs).length,0);
const newMonth=app.load('Matara 02','2026.12.01',true);
assert.equal(newMonth.values.monthlyTarget,undefined);
assert.equal(newMonth.values.hutMtdOnTime,undefined);
assert.equal(newMonth.values.hutYtdOnTime,'98%');
const newYear=app.load('Matara 02','2027.01.01',true);
assert.equal(newYear.values.hutYtdOnTime,undefined);
app.save('Akuressa','2026.11.15',{todaySale:'50'}, {});
assert.equal(app.load('Akuressa','2026.11.15',false).values.todaySale,'50');
assert.equal(app.load('Matara 02','2026.11.15',false).values.todaySale,undefined);
app.reset('Akuressa','2026.11.15');
assert.equal(app.getOutlet(),'Matara 02');
assert.equal(app.load('Akuressa','2026.11.15',false).values.todaySale,undefined);
assert.equal(app.canRestore('Akuressa','2026.11.15'),true);
assert.equal(app.canRestore('Akuressa','2026.11.14'),false);
assert.equal(app.restore('Akuressa','2026.11.15'),true);
assert.equal(app.load('Akuressa','2026.11.15',false).values.todaySale,'50');
app.setMIS('Akuressa',{filename:'outlet.csv',data:{'15-Nov':{day:300,mtd:2000}}});
assert.equal(app.getMIS('Matara 02'),null);
assert.equal(app.getMIS('Akuressa').filename,'outlet.csv');
const backup=app.exportBackup();
app.importBackup(backup);
assert.equal(app.load('Akuressa','2026.11.15',false).values.todaySale,'50');
assert.throws(()=>app.importBackup('{"hello":1}'),/compatible/);
// Legacy migration is non-destructive and survives upgrades.
storage.clear();
localStorage.setItem('ph_daily_report_v2', JSON.stringify({date:'2026.11.14',todaySale:'451',mtdSale:'1200',_customCalcs:{ADS:90}}));
localStorage.setItem('ph_saved_day','2026.11.14');
assert.equal(app.load('Matara 02','2026.11.14',false).values.todaySale,'451');
assert.equal(localStorage.getItem('ph_daily_report_v2') !== null,true);
assert.equal(app.load('Matara 02','2026.11.14',false).customCalcs.ADS,90);

// Reset reports must not be silently repopulated by a stored MIS file.
storage.clear();
app.save('Matara 02','2026.11.14',{dayTarget:'500',todaySale:'400',mtdSale:'1200'},{});
app.reset('Matara 02','2026.11.14');
assert.equal(app.load('Matara 02','2026.11.14',false).values._skipMISAutoFill,true);
assert.equal(app.load('Matara 02','2026.11.14',false).values.dayTarget,undefined);
// Marker must clear when the operational day changes.
const nextReport=app.load('Matara 02','2026.11.15',true);
assert.equal(nextReport.values._skipMISAutoFill,undefined);
// Backup preview rejects malformed files before mutating existing reports.
const originalBackup=app.exportBackup();
const payload=JSON.parse(originalBackup);
const before=localStorage.getItem('ph_report_database_v3');
payload.database.outlets['Matara 02'].reports['2026.02.30']={
  values:{todaySale:'999'},customCalcs:{},updatedAt:1
};
assert.throws(()=>app.previewBackup(JSON.stringify(payload)),/Invalid date/);
assert.equal(localStorage.getItem('ph_report_database_v3'),before);
delete payload.database.outlets['Matara 02'].reports['2026.02.30'];
payload.database.outlets['Matara 02'].reports['2026.11.14'].values.todaySale='999';
payload.database.outlets['Matara 02'].reports['2026.11.14'].updatedAt=9999999999999;
assert.equal(app.previewBackup(JSON.stringify(payload)).conflicts >= 1,true);
const safeMerge=app.importBackup(JSON.stringify(payload));
assert.equal(safeMerge.keptExisting>=1,true);
assert.equal(app.load('Matara 02','2026.11.14',false).values.todaySale,undefined);
// Forced replacement is explicit, and can be undone.
const overwrite=app.importBackup(JSON.stringify(payload),true);
assert.equal(overwrite.replaced>=1,true);
assert.equal(app.load('Matara 02','2026.11.14',false).values.todaySale,'999');
assert.equal(app.canUndoImport(),true);
assert.equal(app.undoImport(),true);
assert.equal(app.canUndoImport(),false);
assert.equal(app.load('Matara 02','2026.11.14',false).values.todaySale,undefined);
assert.throws(()=>app.importBackup(JSON.stringify({...payload,version:5})),/compatible/);
// Corrupted stored databases must not be reset to empty without warning.
storage.set('ph_report_database_v3','{"broken":true}');
assert.throws(()=>app.load('Matara 02','2026.11.14',false),/not valid/);

console.log('PASS: six outlets, Colombo 6 AM, date validation, rollover, restore, isolation, MIS, backups, migration, reset protection, safe backup preview, conflicting reports, import undo, corrupted storage');
