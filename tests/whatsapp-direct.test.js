'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/onclick="sendWA\(1\)"/);
assert.match(html,/onclick="sendWA\(2\)"/);
assert.doesNotMatch(html,/id="previewOverlay"/);
const start=html.indexOf('function sendWA(n) {');
const end=html.indexOf('function openSettings() {',start);
assert.ok(start>=0 && end>start,'message button handler is present');
const source=html.slice(start,end);
const opened=[];
const outputs={
msgOutput:{value:'Message 1 test: 100% & outlet'},
msgOutput2:{value:'Message 2 test: 95% & outlet'}
};
let renders=0;
const ctx={
calcAndRender:()=>{renders++;},
document:{getElementById:id=>outputs[id] || null},
window:{open:(...args)=>{opened.push(args);return null;}},
toast:()=>{throw Error('Unexpected warning')}
};
vm.runInNewContext(source+'\n;sendWA(1);sendWA(2);',ctx);
assert.equal(renders,2);
assert.equal(opened.length,2);
for(let i=0;i<2;i++){
assert.equal(opened[i][0],'https://wa.me/?text='+encodeURIComponent(outputs[i===0?'msgOutput':'msgOutput2'].value));
assert.equal(opened[i][1],'_blank');
assert.equal(opened[i][2],'noopener,noreferrer');
}
console.log('PASS: both buttons immediately open their distinct WhatsApp messages without preview');
