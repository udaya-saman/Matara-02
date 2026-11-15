/* Gamma MIS CSV parser. Pure functions, no storage or DOM dependencies. */
(function (global) {
'use strict';
const OUTLETS=['Akuressa','Embilipitiya','Monaragala','Matara','Matara 02','Tangalle'];
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function rowsFromCSV(csv) {
  const rows=[]; let row=[],cell='',quote=false;
  const input=String(csv||'').replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++){
    const char=input[i];
    if(char==='"') {
      if(quote&&input[i+1]==='"'){cell+='"';i++;}else quote=!quote;
    } else if(char===','&&!quote){row.push(cell);cell='';}
    else if((char==='\n'||char==='\r')&&!quote){
      row.push(cell);rows.push(row);row=[];cell='';
      if(char==='\r'&&input[i+1]==='\n')i++;
    }else cell+=char;
  }
  if(quote)throw new Error('This CSV file has an unfinished quoted field.');
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}
function compact(value) {return String(value==null?'':value).trim().replace(/\s+/g,' ');}
function normaliseOutlet(value) {
  const clean=compact(value).toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ').replace(/\b02\b/g,'2');
  return OUTLETS.find(name=>name.toLowerCase().replace(/\b02\b/g,'2')===clean)||null;
}
function dateCell(raw) {
  const value=compact(raw);
  let m=value.match(/^(\d{1,2})[-./ ]+([a-z]{3,9})(?:[-./ ,]+(\d{2,4}))?$/i);
  let day,month,year=null;
  if(m){day=Number(m[1]);month=MONTHS.indexOf(m[2].slice(0,3).toLowerCase())+1;year=m[3]?Number(m[3]):null;}
  else {
    m=value.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
    if(!m)return null;
    year=Number(m[1]);month=Number(m[2]);day=Number(m[3]);
  }
  if(year!==null&&year<100)year+=2000;
  if(month<1||month>12||day<1||day>31)return null;
  const valYear=year||2000;
  if(new Date(Date.UTC(valYear,month-1,day)).getUTCDate()!==day)return null;
  return {day,month,year};
}
function figure(raw) {
  const value=compact(raw).replace(/,/g,'');
  if(!value||/^[-–—]+$/.test(value))return null;
  if(/^(?:#N\/A|#DIV\/0!|#VALUE!|#REF!)$/i.test(value))return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function reportingYear(fileName,dates) {
  const explicitYears=[...new Set(dates.map(d=>d.year).filter(Boolean))];
  if(explicitYears.length>1)throw new Error('This report contains dates from multiple years.');
  const match=String(fileName).match(/\b(20\d{2})\b/);
  const namedYear=match?Number(match[1]):null;
  if(explicitYears.length&&namedYear&&explicitYears[0]!==namedYear)throw new Error('The file name does not match its reporting year.');
  const year=explicitYears[0]||namedYear;
  if(!year||year<2000||year>2200)throw new Error('The reporting year could not be identified. Include the year in the file name.');
  return year;
}
function readGammaMIS(csv,fileName) {
  const rows=rowsFromCSV(csv);
  if(rows.length<10)throw new Error('This file does not look like a Gamma MIS report.');
  const locationRow=rows.find(r=>/^LOCATION\s*:/i.test(compact(r[0])));
  if(!locationRow)throw new Error('The outlet name is missing from the MIS report.');
  const locationValue=compact(locationRow[1])||compact(locationRow[0]).replace(/^LOCATION\s*:/i,'');
  const outlet=normaliseOutlet(locationValue);
  if(!outlet)throw new Error('The MIS report outlet is not supported: '+locationValue);
  const start=rows.findIndex(r=>/^TOTAL SYSTEM$/i.test(compact(r[0])));
  if(start<0)throw new Error('The TOTAL SYSTEM section was not found.');
  const datesRow=rows[start],records=[];
  let dailyRow=null,mtdRow=null;
  for(let i=start+1;i<Math.min(rows.length,start+27);i++){
    const label=compact(rows[i][0]).toUpperCase();
    if(['DELIVERY','TAKE AWAY','DINE IN','AGGREGATOR','AGGEGATOR'].includes(label))break;
    if(label==='NET SALES - TARGET'&&!dailyRow)dailyRow=rows[i];
    if(label==='MTD NET SALES - TARGET'&&!mtdRow)mtdRow=rows[i];
    if(dailyRow&&mtdRow)break;
  }
  if(!dailyRow||!mtdRow)throw new Error('The TOTAL SYSTEM sales targets were not found.');
  const parsedDates=datesRow.slice(1).map(dateCell);
  const detected=parsedDates.filter(Boolean);
  if(!detected.length)throw new Error('No valid date headings were found.');
  const candidates=new Map();
  for(let i=0;i<parsedDates.length;i++){
    const d=parsedDates[i];
    if(!d)continue;
    const key=d.month;
    candidates.set(key,(candidates.get(key)||0)+1);
  }
  const [month,count]=[...candidates.entries()].sort((a,b)=>b[1]-a[1])[0];
  if(count<5)throw new Error('The reporting month could not be confirmed.');
  const year=reportingYear(fileName,parsedDates.filter(d=>d&&d.month===month));
  const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  const parsed={};let warnings=[];
  for(let i=0;i<parsedDates.length;i++){
    const d=parsedDates[i]; if(!d||d.month!==month)continue;
    if(d.year!==null&&d.year!==year)continue;
    if(d.day>lastDay)throw new Error('Invalid calendar date in MIS headings.');
    const key=year+'-'+String(month).padStart(2,'0')+'-'+String(d.day).padStart(2,'0');
    if(parsed[key]){warnings.push('An extra repeated date column was ignored.');continue;}
    const daily=figure(dailyRow[i+1]),mtd=figure(mtdRow[i+1]);
    if(daily===null&&mtd===null)continue;
    if((daily!==null&&daily<0)||(mtd!==null&&mtd<0))throw new Error('A sales target is negative.');
    parsed[key]={day:daily,mtd:mtd,dateDay:d.day,dateMonth:month,dateYear:year};
  }
  const lastKey=year+'-'+String(month).padStart(2,'0')+'-'+String(lastDay).padStart(2,'0');
  if(!parsed[lastKey]||parsed[lastKey].mtd==null||parsed[lastKey].mtd<=0)
    throw new Error('The last day of the month has no valid MTD target.');
  const days=Object.keys(parsed).length;
  if(days<lastDay-2)throw new Error('The MIS report has too many missing daily targets.');
  const period=year+'-'+String(month).padStart(2,'0');
  const monthLabel=new Date(Date.UTC(year,month-1,1)).toLocaleString('en-GB',{month:'long',timeZone:'UTC'})+' '+year;
  return {outlet,year,month,period,monthLabel,days,monthlyTarget:parsed[lastKey].mtd,
    filename:String(fileName||'Gamma MIS.csv'),data:parsed,warnings:[...new Set(warnings)]};
}
global.GammaMIS={parse:readGammaMIS,rowsFromCSV,dateCell,normaliseOutlet,figure};
})(globalThis);
