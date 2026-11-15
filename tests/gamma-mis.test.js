'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const context={localStorage,Date,Intl};
vm.createContext(context);
vm.runInContext(fs.readFileSync('report-store.js','utf8'),context);
vm.runInContext(fs.readFileSync('gamma-mis.js','utf8'),context);
const db=context.ReportStore, parser=context.GammaMIS;
const fixtures=[
  {file:'4 Gamma MIS Report - April 2026.csv',month:4,last:30,target:5537226,extras:['1-May','1-Jun']},
  {file:'5 Gamma MIS Report - May 2026.csv',month:5,last:31,target:4979780,extras:['1-Jun']},
  {file:'6 Gamma MIS Report - June 2026.csv',month:6,last:30,target:4620516,extras:['1-Jul','1-Jun']},
  {file:'7 Gamma MIS Report - July 2026.csv',month:7,last:31,target:4417789,extras:['1-Jun']}
];
function sample(f) {
  const mon=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][f.month-1];
  const dateHeaders=Array.from({length:f.last},(_,i)=>String(i+1)+'-'+mon).concat(f.extras);
  const daily=Array.from({length:f.last},(_,i)=>i+100).concat(f.extras.map(_=>'#N/A'));
  const mtd=Array.from({length:f.last},(_,i)=>i===f.last-1?f.target:i*1000+500).concat(f.extras.map(_=>'-'));
  return [
    'GAMMAPIZZAKRAFT LANKA (PVT) LTD',
    'DAILY REVENUE UPDATE',
    'LOCATION: ,Akuressa',
    f.target.toLocaleString('en-US')+',,,,,',
    'Wednesday,Thursday,Friday',
    ['TOTAL SYSTEM',...dateHeaders].join(','),
    ['Net Sales - Actual',...daily].join(','),
    ['Net Sales - Target',...daily].join(','),
    'Net Sales - Bold Goal Target',
    'Net Sales - Variance',
    'MTD Net Sales - Actual',
    ['MTD Net Sales - Target',...mtd].join(','),
    'DELIVERY',
    ...Array(8).fill('')
  ].join('\r\n');
}
for(const f of fixtures){
  const p=parser.parse(sample(f),f.file);
  assert.equal(p.outlet,'Akuressa');
  assert.equal(p.month,f.month);
  assert.equal(p.year,2026);
  assert.equal(p.period,'2026-'+String(f.month).padStart(2,'0'));
  assert.equal(p.monthlyTarget,f.target);
  assert.equal(p.days,f.last);
  assert.equal(Object.keys(p.data).length,f.last);
  db.setMIS(p.outlet,{period:p.period,filename:f.file,reportMonth:p.month,reportYear:p.year,data:p.data});
}
assert.equal(db.getMISMonths('Akuressa').length,4);
for(const f of fixtures) {
  const period='2026-'+String(f.month).padStart(2,'0');
  const value=db.getMIS('Akuressa',period);
  const last=period+'-'+String(f.last).padStart(2,'0');
  assert.equal(value.data[last].mtd,f.target,'Stored separate month: '+period);
}
assert.equal(db.getMIS('Matara 02','2026-04'),null);
const exported=db.exportBackup();
storage.clear();
db.importBackup(exported);
assert.equal(db.getMISMonths('Akuressa').length,4);
assert.equal(db.getMIS('Akuressa','2026-06').data['2026-06-30'].mtd,4620516);
storage.clear();
localStorage.setItem('ph_report_database_v3',JSON.stringify({
  version:3,outlets:{Akuressa:{reports:{},backup:null,
  mis:{filename:'Old April 2026.csv',data:{'2026-04-30':{dateDay:30,dateMonth:4,dateYear:2026,day:99,mtd:101}}}}}
}));
assert.equal(db.getMIS('Akuressa','2026-04').data['2026-04-30'].mtd,101);
assert.throws(()=>parser.parse(sample(fixtures[0]).replace('LOCATION: ,Akuressa','LOCATION: ,Unknown'),fixtures[0].file),/not supported/);
const wrongName=parser.parse(sample(fixtures[0]),fixtures[1].file);
assert.equal(wrongName.period,'2026-04');
const quoted='LOCATION: ,"Akuressa"';
assert.equal(parser.parse(sample(fixtures[0]).replace('LOCATION: ,Akuressa',quoted),fixtures[0].file).outlet,'Akuressa');
console.log('PASS: four Gamma MIS structures, trailing columns, outlet detection, four-month storage, legacy MIS, backups');
