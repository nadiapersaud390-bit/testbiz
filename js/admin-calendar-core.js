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
function team(t){t=String(t||'').toUpperCase();return ({BERBICE:'BB',BERB:'BB',PROVIDENCE:'PR',PROV:'PR',REMOTE:'RM'})[t]||t;}
function sort(a,b){return (a.date+(a.time||'00:00')).localeCompare(b.date+(b.time||'00:00'))||String(a.title||'').localeCompare(String(b.title||''));}
function occurrence(e){return e.id+'_'+e.date+'_'+(e.revision||1);}
function due(e,now){if(['Declined','Cancelled'].includes(e.status)||Number(e.reminder)<0||!valid(e.date))return false;const at=Date.parse(e.date+'T'+(e.time||'09:00')+':00-04:00'),until=Date.parse((e.endDate||e.date)+'T23:59:59-04:00');return now>=at-Number(e.reminder)*60000&&now<=until;}
function validate(e){if(!['dayoff','late','early','appointment','other'].includes(e.type))throw Error('Choose an event type.');if(!valid(e.date)||!valid(e.endDate)||e.endDate<e.date)throw Error('Enter a valid date range.');if(date(e.endDate)-date(e.date)>366*86400000)throw Error('Use a date range of one year or less.');if(!e.title.trim()||e.title.length>120)throw Error('Enter a title of up to 120 characters.');if(e.type!=='other'&&!e.agentId)throw Error('Choose an agent.');if(e.type==='late'&&!e.time)throw Error('Enter the expected arrival time.');if(e.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time))throw Error('Enter a valid time.');if(!['Requested','Approved','Planned','Declined','Cancelled'].includes(e.status))throw Error('Choose a status.');if(![-1,0,15,60,1440,4320,10080].includes(Number(e.reminder)))throw Error('Choose a reminder.');if(e.notes.length>2000)throw Error('Notes must be 2,000 characters or fewer.');return e;}
g.AdminCalendarCore={valid,add,day,holidays,birthdayEvents,sort,team,occurrence,due,validate,iso,date};
})(window);
