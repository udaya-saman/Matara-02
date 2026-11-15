'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const full=html.split('<script>').at(-1).split('</script>')[0];
function part(start,end){
  const i=full.indexOf(start),j=full.indexOf(end,i+start.length);
  assert.ok(i>=0&&j>i,'Missing test source: '+start);
  return full.slice(i,j);
}
const parser=part('function parseCSVLine(text) {','function getMatchingMISForDate(');
const matching=part('function getMatchingMISForDate(', 'function calcAndRender() {');
const normalise=part('function normaliseMISRecord(', 'function autoFillFromMIS(');
const fill=part('function autoFillFromMIS()', '// ==========================================\n// CALENDAR PICKER LOGIC');
const mem=new Map();
const storage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
const context={localStorage:storage,Date,Intl};
vm.createContext(context);
vm.runInContext(fs.readFileSync('report-store.js','utf8'),context);
const store=context.ReportStore;
const fields={
  date:{value:'2026.04.15'},
  dayTarget:{value:'9000'},mtdTarget:{value:'12000'},monthlyTarget:{value:'800000'},
  todaySale:{value:'111'},mtdSale:{value:'222'},totalResponses:{value:'9'},
  misUploadStatus:{textContent:'',innerText:'',style:{}}
};
const notices=[];let updates=0,saves=0,imports=0;
context.document={getElementById:id=>fields[id]||null};
context.selectedOutlet='Akuressa';
context.reportSkipMIS=false;
context.calcAndRender=()=>updates++;
context.autoSave=()=>saves++;
context.saveToStorage=()=>true;
context.toast=(msg)=>notices.push(String(msg));
context.fmt=n=>Number(n).toLocaleString('en-US');
context.console={error(){}};
vm.runInContext(parser+matching+normalise+fill,context);
function call(expr){return vm.runInContext(expr,context);}
const rows={
 '1-Apr':{dateDay:1,dateMonth:4,dateYear:2026,day:105,mtd:110},
 '15-Apr':{dateDay:15,dateMonth:4,dateYear:2026,day:180,mtd:2100},
 '16-Apr':{dateDay:16,dateMonth:4,dateYear:2026,day:190,mtd:2200},
 '30-Apr':{dateDay:30,dateMonth:4,dateYear:2026,day:250,mtd:5500}
};
store.setMIS('Akuressa',{filename:'Gamma April 2026.csv',period:'2026-04',reportYear:2026,
  reportMonth:4,sourceOutlet:'Akuressa',data:rows});
call('autoFillFromMIS()');
assert.equal(fields.dayTarget.value,'180');
assert.equal(fields.mtdTarget.value,'2,100');
assert.equal(fields.monthlyTarget.value,'5,500');
assert.equal(call("getTomorrowTarget('2026.04.15')"),'190');
assert.equal(call("getTomorrowTarget('2026.04.30')"),'---');
// Different month; any stale targets are cleared. Independent saved values survive.
fields.date.value='2026.11.15';
fields.dayTarget.value='550';fields.mtdTarget.value='800';fields.monthlyTarget.value='5,500';
call('autoFillFromMIS()');
for(const id of ['dayTarget','mtdTarget','monthlyTarget'])assert.equal(fields[id].value,'',id+' cleared on month mismatch');
assert.equal(fields.todaySale.value,'111');
assert.equal(fields.mtdSale.value,'222');
assert.equal(fields.totalResponses.value,'9');
assert.equal(call("getTomorrowTarget('2026.11.15')"),'---');
// Even the same calendar month must not cross years.
fields.date.value='2027.04.15';
fields.dayTarget.value='14';fields.mtdTarget.value='15';fields.monthlyTarget.value='16';
call('autoFillFromMIS()');
for(const id of ['dayTarget','mtdTarget','monthlyTarget'])assert.equal(fields[id].value,'',id+' cleared on year mismatch');
assert.equal(call("getTomorrowTarget('2027.04.15')"),'---');
// Same period but no precise daily row: day/MTD blank; monthly only from last date.
fields.date.value='2026.04.17';
call('autoFillFromMIS()');
assert.equal(fields.dayTarget.value,'');
assert.equal(fields.mtdTarget.value,'');
assert.equal(fields.monthlyTarget.value,'5,500');
// Known source outlet disagreement must not populate fields.
store.setMIS('Akuressa',{filename:'Gamma April 2026.csv',period:'2026-04',reportYear:2026,
 reportMonth:4,sourceOutlet:'Matara 02',data:rows});
fields.date.value='2026.04.15';fields.dayTarget.value='44';
call('autoFillFromMIS()');
assert.equal(fields.dayTarget.value,'');
assert.equal(fields.monthlyTarget.value,'');
// Restore valid source and test missing last-day MTD leaves Monthly Target blank.
const partial={...rows};delete partial['30-Apr'];
store.setMIS('Akuressa',{filename:'Gamma April 2026.csv',period:'2026-04',
 reportYear:2026,reportMonth:4,sourceOutlet:'Akuressa',data:partial});
fields.date.value='2026.04.15';
call('autoFillFromMIS()');
assert.equal(fields.dayTarget.value,'180');
assert.equal(fields.monthlyTarget.value,'');
assert.equal(call("getTomorrowTarget('2026.04.15')"),'190');
// Undated legacy MIS must not act as an arbitrary-month fallback.
store.setMIS('Tangalle',{filename:'unlabeled.csv',data:{'1-Apr':{dateDay:1,dateMonth:4,dateYear:null,day:90,mtd:100}}});
assert.equal(store.getMIS('Tangalle','2026-04'),null);
const parsedCases=[
  ['1-Apr',4,1],['30-Apr',4,30],['01-Jun',6,1]
];
for(const [str,month,day] of parsedCases){
 const parsed=call("parseMISDateHeader('"+str+"')");
 assert.equal(parsed.month,month);assert.equal(parsed.day,day);
}
assert.ok(updates>0&&saves>0);
// Exercise the real lightweight Gamma upload handler with a selected-outlet check.
const uploader=part('function handleMISUpload(event) {','function normaliseMISRecord(');
class FakeReader {
 readAsText(file){this.onload({target:{result:file.csv}});}
}
context.FileReader=FakeReader;
let attempted=0;
const origSet=store.setMIS.bind(store);
store.setMIS=(outlet,data)=>{attempted++;origSet(outlet,data);};
function csv(outlet,year,labelMonth='Apr'){
 const headers=['TOTAL SYSTEM',...Array.from({length:30},(_,i)=>(i+1)+'-'+labelMonth),'1-May','1-Jun'].join(',');
 const day=['Net Sales - Target',...Array.from({length:30},(_,i)=>i+100),'0','0'].join(',');
 const mtd=['MTD Net Sales - Target',...Array.from({length:30},(_,i)=>i===29?5537226:i+100),'0','0'].join(',');
 return ['LOCATION: ,'+outlet,headers,day,mtd,'DELIVERY'].join('\r\n');
}
function upload(name,txt){const event={target:{files:[{name,csv:txt}]}};call('handleMISUpload')(event);}
upload('Gamma April 2026.csv',csv('Matara 02',2026));
assert.equal(attempted,0,'Wrong-outlet file should not be stored');
upload('Gamma April.csv',csv('Akuressa',2026));
assert.equal(attempted,0,'Unknown-year file must not be assigned selected year');
upload('Gamma April 2026.csv',csv('Akuressa',2026));
assert.equal(attempted,1,'Correct file stored under selected outlet');
assert.equal(store.getMIS('Akuressa','2026-04').data['1-Apr'].dateYear,2026);
assert.equal(Object.keys(store.getMIS('Akuressa','2026-04').data).length,30,'Trailing columns ignored');
// Wrong CSV cannot replace a previously saved valid MIS period.
upload('Gamma April 2025.csv',csv('Matara 02',2025));
assert.equal(attempted,1,'Wrong-outlet/year file cannot replace a valid report');
assert.ok(notices.some(msg=>msg.includes('different outlet')));
assert.ok(notices.some(msg=>msg.includes('year is missing')));
assert.equal(fields.todaySale.value,'111');
assert.equal(fields.mtdSale.value,'222');
assert.equal(fields.totalResponses.value,'9');
assert.match(html,/onclick="sendWA\(1\)"/);
assert.match(html,/onclick="sendWA\(2\)"/);
console.log('PASS: month/year/outlet match, unmatched targets blank, next-day isolation, other values preserved, mismatched uploads rejected');
