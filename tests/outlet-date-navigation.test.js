'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('index.html','utf8').split('<script>').at(-1).split('</script>')[0];
function fn(name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,'missing '+name);
  const end=source.indexOf('\n}',start);
  assert.ok(end>start,'missing closing brace '+name);
  return source.slice(start,end+2);
}
const elements=new Map();
function el(id) {
  if(!elements.has(id)) elements.set(id,{
    value:'',style:{},classList:{set:new Set(),add(n){this.set.add(n);},remove(n){this.set.delete(n);},contains(n){return this.set.has(n);}},
    setAttribute(n,v){this[n]=v;},
    focus(){},isConnected:true
  });
  return elements.get(id);
}
const records={
 'Matara 02':{
  '2026.11.15':{values:{todaySale:'500',mtdSale:'1000'},customCalcs:{}},
  '2026.11.20':{values:{todaySale:'777',mtdSale:'2000'},customCalcs:{}}
 },
 Akuressa:{'2026.11.15':{values:{todaySale:'30',mtdSale:'100'},customCalcs:{}}}
};
const notifications=[],calls=[];
let confirmation=null;
const store={
 OUTLETS:['Akuressa','Embilipitiya','Monaragala','Matara','Matara 02','Tangalle'],
 selected:'Matara 02',
 setOutlet(outlet){this.selected=outlet;},
 validDate(s){return /^\d{4}\.\d{2}\.\d{2}$/.test(s);},
 load(outlet,date){calls.push('load '+outlet+' '+date); if(date==='2026.11.19') throw Error('Simulated damaged record');return JSON.parse(JSON.stringify(records[outlet]?.[date]||{values:{},customCalcs:{}}));},
 canRestore(){return false;}
};
const ctx={
 ReportStore:store,document:{getElementById:el,title:'',activeElement:el('settingsButton')},
 FIELDS:[{id:'todaySale'},{id:'mtdSale'}],DEFAULTS:{},LEGACY_CALC_MAP:{},
 lastValidValues:Object.create(null),customCalcs:{},reportSkipMIS:false,
 isInputValidForSave:()=>true,
 selectedOutlet:'Matara 02',activeDate:'2026.11.15',todayStr:'2026.11.15',
 lastModalFocus:null,requestAnimationFrame:cb=>cb(),updateUndoImportButton:()=>{},
 updateReportingDateNotice:()=>{},console:{error(){}},
 showModal:args=>{confirmation=args;calls.push('confirm');},
 toast:msg=>notifications.push(msg),
 calcAndRender:()=>{},autoFillFromMIS:()=>{},
 saveToStorage:()=>{records[ctx.selectedOutlet][ctx.activeDate]=
 {values:{todaySale:el('todaySale').value,mtdSale:el('mtdSale').value},customCalcs:{}};return true;}
};
vm.createContext(ctx);
const names=['updateOutletDisplay','refreshRestoreButton','applyReportData',
 'collectReportValues','loadSelectedReport','openSettings','closeSettings','changeOutlet',
 'selectDate','openReportDate'];
const snippets=names.map(n=>fn(n)).join('\n');
vm.runInContext(snippets,ctx);
assert.doesNotMatch(source,/renderMISMonthList\s*\(/,'stale removed function is never called');
assert.doesNotMatch(fn('selectDate'),/showModal|Future reporting date/,
 'future date confirmation is removed');
vm.runInContext('loadSelectedReport("2026.11.15",false)',ctx);
assert.equal(el('todaySale').value,'500');
vm.runInContext('openSettings()',ctx);
assert.equal(el('settingsOverlay').classList.contains('open'),true);
assert.equal(el('headerOutletText').textContent,'Matara 02');
el('outletSelect').value='Akuressa';
vm.runInContext('changeOutlet()',ctx);
assert.equal(el('settingsOverlay').classList.contains('open'),false);
assert.equal(confirmation.title,'Change outlet?');
confirmation.onOk();
assert.equal(ctx.selectedOutlet,'Akuressa');
assert.equal(store.selected,'Akuressa');
assert.equal(el('headerOutletText').textContent,'Akuressa');
assert.equal(el('todaySale').value,'30');
assert.equal(records['Matara 02']['2026.11.15'].values.todaySale,'500');
el('outletSelect').value='Matara 02';
vm.runInContext('changeOutlet()',ctx);
confirmation.onCancel();
assert.equal(ctx.selectedOutlet,'Akuressa');
assert.equal(el('outletSelect').value,'Akuressa');
// Switch back to Matara 02, then open a future report without confirmation.
el('outletSelect').value='Matara 02';
vm.runInContext('changeOutlet()',ctx);confirmation.onOk();
confirmation=null;
vm.runInContext('selectDate(2026,10,20)',ctx);
assert.equal(confirmation,null);
assert.equal(ctx.activeDate,'2026.11.20');
assert.equal(el('todaySale').value,'777');
assert.equal(records['Matara 02']['2026.11.15'].values.todaySale,'500');
vm.runInContext('selectDate(2026,10,15)',ctx);
assert.equal(ctx.activeDate,'2026.11.15');
assert.equal(el('todaySale').value,'500');
// Simulate an unreadable destination report: keep current form and date unchanged.
vm.runInContext('selectDate(2026,10,19)',ctx);
assert.equal(ctx.activeDate,'2026.11.15');
assert.equal(el('todaySale').value,'500');
assert.equal(el('date').value,'2026.11.15');
assert.ok(notifications.some(x=>x.includes('kept')));
console.log('PASS: change outlet, cancel, header, historical/future dates, saved data and failed-date rollback');
