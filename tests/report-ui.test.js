'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const src=html.split('<script>').at(-1).split('</script>')[0];
function take(from,to) {
  const i=src.indexOf(from),j=src.indexOf(to,i+from.length);
  assert.ok(i>=0 && j>i, 'Could not locate '+from);
  return src.slice(i,j);
}
const pure=take('function parseMISDateHeader(', 'function clearMISAutoFilledTargets(')
  + take('function normaliseMISRecord(', 'function autoFillFromMIS(')
  + take('function parseMISNumber(', 'function handleMISUpload(')
  + take('function getMatchingMISForDate(', 'function getTomorrowTarget(');
const funcs=vm.runInNewContext(pure+
  ';({parseMISDateHeader,parseAppDate,parseMISNumber,normaliseMISRecord})');
assert.deepEqual(JSON.parse(JSON.stringify(funcs.parseMISDateHeader('15-Nov'))),{day:15,month:11,year:null});
assert.deepEqual(JSON.parse(JSON.stringify(funcs.parseMISDateHeader('15-Nov-2026'))),{day:15,month:11,year:2026});
assert.deepEqual(JSON.parse(JSON.stringify(funcs.parseMISDateHeader('2026-11-15'))),{day:15,month:11,year:2026});
assert.equal(funcs.parseMISDateHeader('32-Nov'),null);
assert.equal(funcs.parseMISDateHeader('31-Apr'),null);
assert.equal(funcs.parseAppDate('2026.02.30'),null);
assert.equal(funcs.parseMISNumber('1,250.25'),1250.25);
assert.equal(funcs.parseMISNumber('---'),null);
const fields={date:{value:'2026.02.14'},mtdTarget:{value:''},dayTarget:{value:''},monthlyTarget:{value:''},
  misUploadStatus:{textContent:'',innerText:'',style:{}}};
const document={getElementById:id=>fields[id]||null};
let selectedOutlet='Matara 02',reportSkipMIS=false,saved=0,recalcs=0;
let data={'2026-02-14':{dateDay:14,dateMonth:2,dateYear:2026,day:100,mtd:1200},
  '2026-02-28':{dateDay:28,dateMonth:2,dateYear:2026,day:200,mtd:2800},
  '2025-02-14':{dateDay:14,dateMonth:2,dateYear:2025,day:900,mtd:9000}};
let ReportStore={getMIS:()=>({filename:'gamma.csv',data})};
const code=pure + take('function autoFillFromMIS(', '// ==========================================\n// CALENDAR PICKER');
const context={document,selectedOutlet,reportSkipMIS,ReportStore,calcAndRender:()=>recalcs++,
  autoSave:()=>saved++,clearMISAutoFilledTargets:()=>{
    for(const id of ['mtdTarget','dayTarget','monthlyTarget']) fields[id].value='';
    recalcs++;saved++;
  },Date,JSON,Object,Number};
vm.createContext(context);
vm.runInContext(code,context);
vm.runInContext('autoFillFromMIS()',context);
assert.equal(fields.dayTarget.value,'100');
assert.equal(fields.mtdTarget.value,'1,200');
assert.equal(fields.monthlyTarget.value,'2,800');
assert.ok(saved>0 && recalcs>0);
fields.date.value='2026.02.15';
vm.runInContext('autoFillFromMIS()',context);
assert.equal(fields.dayTarget.value,'');
assert.equal(fields.monthlyTarget.value,'2,800');
fields.date.value='2026.02.14';
context.reportSkipMIS=true;
fields.mtdTarget.value='';
vm.runInContext('autoFillFromMIS()',context);
assert.equal(fields.mtdTarget.value,'');
assert.match(fields.misUploadStatus.textContent,/paused/);
context.reportSkipMIS=false;
data={'2025-02-14':{dateDay:14,dateMonth:2,dateYear:2025,day:500,mtd:5000}};
vm.runInContext('autoFillFromMIS()',context);
assert.equal(fields.mtdTarget.value,'');
assert.equal(fields.dayTarget.value,'');
assert.equal(fields.monthlyTarget.value,'');
console.log('PASS: MIS parsing, exact year isolation, calendar month-end, skipped MIS autofill, invalid dates');
