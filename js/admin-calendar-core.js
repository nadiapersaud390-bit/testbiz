(function(g){'use strict';
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.toISOString().slice(0,10);
const date=s=>new Date(s+'T12:00:00Z');
const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(+date(s))&&iso(date(s))===s;
const add=(s,n)=>{const d=date(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);};
const day=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
const nth=(y,m,weekday,n)=>{const first=date(day(y,m,1));return day(y,m,1+(weekday-first.getUTCDay()+7)%7+7*(n-1));};
const last=(y,m,weekday)=>{const d=new Date(Date.UTC(y,m,0,12));d.setUTCDate(d.getUTCDate()-(d.getUTCDay()-weekday+7)%7);return iso(d);};
function holidays(year){let out=[];for(let y=year-1;y<=year+1;y++){
 const base=[[day(y,1,1),"New Year's Day"],[nth(y,1,1,3),'Martin Luther King Jr. Day'],[nth(y,2,1,3),"Washington’s Birthday / Presidents Day"],[last(y,5,1),'Memorial Day'],[day(y,6,19),'Juneteenth'],[day(y,7,4),'Independence Day'],[nth(y,9,1,1),'Labor Day'],[nth(y,10,1,2),'Columbus Day'],[day(y,11,11),'Veterans Day'],[nth(y,11,4,4),'Thanksgiving Day'],[day(y,12,25),'Christmas Day']];
 for(const [d,title]of base){out.push({id:'holiday-'+d,title,date:d,endDate:d,type:'holiday',status:'Holiday',time:'09:00',reminder:1440,revision:1});const w=date(d).getUTCDay();if(w===0||w===6){const obs=add(d,w===6?-1:1);out.push({id:'holiday-observed-'+d,title:title+' (observed)',date:obs,endDate:obs,type:'holiday',status:'Holiday',time:'09:00',reminder:1440,revision:1});}}
 }return out.filter(e=>e.date.startsWith(String(year))).sort(sort);}
function birthdayEvents(birthdays,roster,year){const profiles=new Map(roster.map(p=>[String(p.userId||p.ytelId),p]));return Object.entries(birthdays||{}).flatMap(([id,b])=>{const p=profiles.get(id);if(!p||['inactive','deleted','archived','quit','fired','replaced'].includes(String(p.status||'').toLowerCase())||p.hidden)return [];const m=Number(b.month),d=Number(b.day);if(!valid(day(2000,m,d)))return [];let dt=day(year,m,d);const adjusted=!valid(dt);if(adjusted)dt=day(year,2,28);return [{id:'birthday-'+id+'-'+year,agentId:id,name:p.fullName||p.name||id,team:team(p.team),title:(p.fullName||p.name||id)+' · Birthday'+(adjusted?' (Feb 29)':''),date:dt,endDate:dt,time:'09:00',type:'birthday',status:'Birthday',reminder:10080,revision:b.updatedAt||1}];});}
function headerKey(v){return String(v==null?'':v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function birthdayDate(value){
 if(value instanceof Date&&!isNaN(+value))return {month:value.getUTCMonth()+1,day:value.getUTCDate()};
 if(typeof value==='number'&&isFinite(value)){const d=new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000);return {month:d.getUTCMonth()+1,day:d.getUTCDate()};}
 const s=String(value==null?'':value).trim();if(!s)return null;
 let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);if(m)return {month:Number(m[2]),day:Number(m[3])};
 m=s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);if(m){let first=Number(m[1]),second=Number(m[2]);if(first>12&&second<=12){const swap=first;first=second;second=swap;}return {month:first,day:second};}
 const parsed=Date.parse(/[0-9]{4}/.test(s)?s:s+' 2000');if(!isNaN(parsed)){const d=new Date(parsed);return {month:d.getUTCMonth()+1,day:d.getUTCDate()};}
 return null;
}
function monthNumber(value){const n=Number(value);if(Number.isInteger(n))return n;const parsed=Date.parse(String(value||'')+' 1, 2000');return isNaN(parsed)?NaN:new Date(parsed).getUTCMonth()+1;}
function prepareBirthdayImport(rows,roster){
 const source=Array.isArray(rows)?rows:[],profiles=Array.isArray(roster)?roster:[];let headerIndex=-1,nameColumn=-1,dateColumn=-1,monthColumn=-1,dayColumn=-1;
 for(let i=0;i<source.length;i++){
  const keys=(source[i]||[]).map(headerKey),name=keys.findIndex(k=>['agent','agentname','name','employeename','employee','associate'].includes(k));
  const dateCandidate=keys.findIndex(k=>['birthday','birthdate','dateofbirth','dob'].includes(k));
  const month=keys.findIndex(k=>['birthmonth','monthofbirth','month'].includes(k)),dayCol=keys.findIndex(k=>['birthday','birthdayday','dayofbirth','day'].includes(k));
  const date=dateCandidate===dayCol&&month>=0?-1:dateCandidate;
  if(name>=0&&(date>=0||(month>=0&&dayCol>=0))){headerIndex=i;nameColumn=name;dateColumn=date;monthColumn=month;dayColumn=dayCol;break;}
 }
 if(headerIndex<0)throw Error('Could not find an Agent Name and Birthday column. Use the attached spreadsheet layout or include Agent Name and Birthday headers.');
 const byName=new Map(),byId=new Map();
 profiles.forEach(p=>{if(!p||p.hidden||['inactive','deleted','archived','quit','fired','replaced'].includes(String(p.status||'').toLowerCase()))return;const id=String(p.userId||p.userID||p.ytelId||p.id||p.agentId||p.agentID||p.userid||'').trim();if(!id)return;const name=String(p.fullName||p.name||p.agentName||p.ytelName||id).trim();byId.set(headerKey(id),{id,name});const k=headerKey(name);if(byName.has(k)&&byName.get(k)!==null)byName.set(k,null);else if(!byName.has(k))byName.set(k,{id,name});});
 const matched=[],unmatched=[],used=new Set();
 source.slice(headerIndex+1).forEach(row=>{
  row=Array.isArray(row)?row:[];if(!row.some(v=>String(v==null?'':v).trim()!==''))return;
  const rawName=String(row[nameColumn]==null?'':row[nameColumn]).trim();if(!rawName)return;
  let parts=dateColumn>=0?birthdayDate(row[dateColumn]):{month:monthNumber(row[monthColumn]),day:Number(row[dayColumn])};
  if(!parts||!valid(day(2000,Number(parts.month),Number(parts.day)))){unmatched.push({name:rawName,reason:'Invalid or missing birthday'});return;}
  const key=headerKey(rawName),agent=byId.get(key)||byName.get(key);
  if(agent===null){unmatched.push({name:rawName,reason:'Agent name is ambiguous'});return;}
  if(!agent){unmatched.push({name:rawName,reason:'Agent was not found in the active roster'});return;}
  if(used.has(agent.id)){unmatched.push({name:rawName,reason:'Duplicate agent row'});return;}
  used.add(agent.id);matched.push({agentId:agent.id,name:agent.name,month:Number(parts.month),day:Number(parts.day)});
 });
 return {matched,unmatched,headerRowIndex:headerIndex};
}
function team(t){t=String(t||'').toUpperCase();return ({BERBICE:'BB',BERB:'BB',PROVIDENCE:'PR',PROV:'PR',REMOTE:'RM'})[t]||t;}
function sort(a,b){return (a.date+(a.time||'00:00')).localeCompare(b.date+(b.time||'00:00'))||String(a.title||'').localeCompare(String(b.title||''));}
function occurrence(e){return e.id+'_'+e.date+'_'+(e.revision||1);}
function due(e,now){if(['Declined','Cancelled'].includes(e.status)||Number(e.reminder)<0||!valid(e.date))return false;const at=Date.parse(e.date+'T'+(e.time||'09:00')+':00-04:00'),until=Date.parse((e.endDate||e.date)+'T23:59:59-04:00');return now>=at-Number(e.reminder)*60000&&now<=until;}
function validate(e){if(!['dayoff','late','early','appointment','other'].includes(e.type))throw Error('Choose an event type.');if(!valid(e.date)||!valid(e.endDate)||e.endDate<e.date)throw Error('Enter a valid date range.');if(date(e.endDate)-date(e.date)>366*86400000)throw Error('Use a date range of one year or less.');if(!e.title.trim()||e.title.length>120)throw Error('Enter a title of up to 120 characters.');if(e.type!=='other'&&!e.agentId)throw Error('Choose an agent.');if(e.type==='late'&&!e.time)throw Error('Enter the expected arrival time.');if(e.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time))throw Error('Enter a valid time.');if(!['Requested','Approved','Planned','Declined','Cancelled'].includes(e.status))throw Error('Choose a status.');if(![-1,0,15,60,1440,4320,10080].includes(Number(e.reminder)))throw Error('Choose a reminder.');if(e.notes.length>2000)throw Error('Notes must be 2,000 characters or fewer.');return e;}
g.AdminCalendarCore={valid,add,day,holidays,birthdayEvents,prepareBirthdayImport,sort,team,occurrence,due,validate,iso,date};
})(window);
