'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const script=html.split('<script>').at(-1).split('</script>')[0];
const start=script.indexOf('function parseCSVLine(text) {');
const end=script.indexOf('function normaliseMISRecord(',start);
assert.ok(start>=0&&end>start,'Original Gamma MIS import functions are present');
const source=script.slice(start,end);
const expected=[
  {month:'Apr',days:30,target:5537226,file:'4 Gamma MIS Report - April 2026.csv',other:['1-May','1-Jun']},
  {month:'May',days:31,target:4979780,file:'5 Gamma MIS Report - May 2026.csv',other:['1-Jun']},
  {month:'Jun',days:30,target:4620516,file:'6 Gamma MIS Report - June 2026.csv',other:['1-Jul','1-Jun']},
  {month:'Jul',days:31,target:4417789,file:'7 Gamma MIS Report - July 2026.csv',other:['1-Jun']}
];
const stored={};let currentOutlet='Akuressa',count=0;
const context={
  Date,Math,Number,JSON,Object,String,parseInt,parseFloat,
  selectedOutlet:currentOutlet,
  reportSkipMIS:false,
  toast:(msg,type)=>{if(type==='error')throw Error(msg);},
  document:{getElementById:id=>id==='date'?{value:'2026.11.15'}:{innerText:'',style:{},value:''}},
  ReportStore:{setMIS:(outlet,mis)=>{stored[mis.period]=mis;assert.equal(outlet,'Akuressa');count++;}},
  autoFillFromMIS:()=>{},saveToStorage:()=>true,
  clearMISAutoFilledTargets:()=>{throw Error('Should not discard saved data')}
};
class FileReader {
  readAsText(file){this.onload({target:{result:file.contents}});}
}
context.FileReader=FileReader;
vm.createContext(context);
vm.runInContext(source,context);
function buildCSV(f){
 const dates=Array.from({length:f.days},(_,i)=>(i+1)+'-'+f.month).concat(f.other);
 const daily=dates.map((_,i)=>i< f.days?String(100+i):'0');
 const mtd=dates.map((_,i)=>i===f.days-1?String(f.target):i<f.days?String((i+1)*1000):'0');
 return ['DAILY REVENUE UPDATE','LOCATION: ,Akuressa',
  ['TOTAL SYSTEM',...dates].join(','),
  ['NET SALES - TARGET',...daily].join(','),
  ['MTD NET SALES - TARGET',...mtd].join(','),
  'DELIVERY',''].join('\r\n');
}
for(const f of expected){
 const input={target:{files:[{name:f.file,contents:buildCSV(f)}],value:'x'}};
 vm.runInContext('handleMISUpload',context)(input);
 const key='2026-'+String(expected.indexOf(f)+4).padStart(2,'0');
 const m=stored[key];
 assert.ok(m,'Stored month '+key);
 assert.equal(m.reportYear,2026);
 assert.equal(m.reportMonth,expected.indexOf(f)+4);
 assert.equal(Object.values(m.data).filter(row=>row.dateMonth===expected.indexOf(f)+4 && row.dateYear===2026).length,f.days);
 const lastKey=String(f.days)+'-'+f.month;
 assert.equal(m.data[lastKey].mtd,f.target);
}
// June's additional "1-Jun" must not overwrite the first day's data.
assert.equal(stored['2026-06'].data['1-Jun'].day,100);
assert.equal(count,4);
assert.equal(context.selectedOutlet,'Akuressa','Import did not silently change the outlet');
assert.match(html,/id="selectedOutletLabel"/);
assert.match(html,/id="outletSelect"/);
assert.doesNotMatch(html,/class="mis-panel"/);
assert.doesNotMatch(html,/DAILY OPERATIONS/);
assert.match(script,/window\.open\('https:\/\/wa\.me\/\?text='/);
console.log('PASS: original MIS upload for April, May, June, July; duplicate date safety; simple UI; outlet selector; WhatsApp');
