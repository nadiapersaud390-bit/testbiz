/* Attendance reporting. Read-only; uses the existing Firebase attendance source. */
(function (global) {
'use strict';
const STATUSES = ['Present','Late','Absent','Training','Personal Out','Vacation','Sick','Off','Holiday','Unknown'];
const COLORS = ['#168c75','#d69b24','#d94e65','#6875ce','#e07c36','#9572bd','#d776a0','#738299','#42a6b0','#a6afbd'];
const RULES = 'Attendance rate = (Present + Late + Training) / (Present + Late + Training + Absent). Punctuality = Present / (Present + Late). Leave, Off, Holiday, Personal Out and unknown statuses are shown separately and excluded from these rates. Missing records are not assumed absent. Dates include weekends when records exist. Lateness uses the saved Late status; minutes late and hours worked are not available from the recorded data. Team filters use the team saved on each record, with the current roster as fallback. Historical records removed from the database cannot be reconstructed.';
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guyana',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d+'T12:00:00Z')) && new Date(d+'T12:00:00Z').toISOString().slice(0,10) === d;
const rate = (n,d) => d ? n/d : null;
const pct = n => n == null ? 'N/A' : (n*100).toFixed(1)+'%';
function teamOf(team,name) {
 const t=String(team||'').trim().toUpperCase();
 const aliases={BB:'BB',BERB:'BB',BERBICE:'BB',PR:'PR',PROV:'PR',PROVIDENCE:'PR',RM:'RM',REMOTE:'RM'};
 if(aliases[t]) return aliases[t];
 const n=String(name||'').toUpperCase();
 if(/^(RM |REMOTE |GTR|GTM)/.test(n))return 'RM';
 if(/^GYB/.test(n))return 'BB';
 return t || 'Unassigned';
}
function counts(rows) {
 const c=Object.fromEntries(STATUSES.map(s=>[s,0]));
 rows.forEach(r=>c[r.status]++);
 const attended=c.Present+c.Late+c.Training;
 return {...c,recorded:rows.length,attended,attendance:rate(attended,attended+c.Absent),punctuality:rate(c.Present,c.Present+c.Late)};
}
function build(root,roster,f) {
 const profiles=new Map(roster.filter(Boolean).map(p=>[String(p.userId||p.ytelId||p.agentId||''),p]));
 const normalized=[]; let skipped=0;
 Object.entries(root||{}).forEach(([date,day])=>{
  if(!validDate(date)){skipped++;return;}
  if(date<f.from||date>f.to||!day||typeof day!=='object')return;
  const unique=new Map();
  Object.entries(day).forEach(([key,rec])=>{
   if(!rec||typeof rec!=='object'){skipped++;return;}
   const id=String(rec.agentId||rec.userId||rec.ytelId||key);
   const p=profiles.get(id)||{};
   const name=String(rec.name||rec.agentName||p.fullName||p.name||id);
   const raw=String(rec.status||'').trim();
   const status=STATUSES.find(s=>s.toLowerCase()===raw.toLowerCase())||'Unknown';
   const r={date,id,name,team:teamOf(rec.team||p.team,name),status,rawStatus:raw,clockedAt:String(rec.clockedAt||''),notes:String(rec.notes||''),editedBy:String(rec.editedBy||''),editedAt:String(rec.editedAt||''),adminEdited:!!rec.adminEdited};
   // Prefer canonical ID key, otherwise the most recently edited duplicate.
   const prev=unique.get(id);
   if(!prev||key===id||(prev.key!==id&&r.editedAt>prev.row.editedAt))unique.set(id,{key,row:r});
  });
  unique.forEach(({row})=>normalized.push(row));
 });
 const rows=normalized.filter(r=>(f.team==='ALL'||r.team===f.team)&&(f.agent==='ALL'||r.id===f.agent)).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 const agents=new Map();
 profiles.forEach((p,id)=>{
  const name=p.fullName||p.name||id, team=teamOf(p.team,name);
  if(id&&(f.team==='ALL'||team===f.team)&&(f.agent==='ALL'||id===f.agent))agents.set(id,{id,name,team,rosterStatus:p.status||'Active',rows:[]});
 });
 rows.forEach(r=>{
  if(!agents.has(r.id))agents.set(r.id,{id:r.id,name:r.name,team:r.team,rosterStatus:profiles.has(r.id)?(profiles.get(r.id).status||'Active'):'Historical',rows:[]});
  agents.get(r.id).rows.push(r);
 });
 const summaries=Array.from(agents.values()).map(a=>({...a,team:a.rows.length?[...new Set(a.rows.map(r=>r.team))].join(', '):a.team,...counts(a.rows),absentDates:a.rows.filter(r=>r.status==='Absent').map(r=>r.date),lateDates:a.rows.filter(r=>r.status==='Late').map(r=>r.date)})).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 const days=new Map(); rows.forEach(r=>{if(!days.has(r.date))days.set(r.date,[]);days.get(r.date).push(r);});
 return {filters:{...f},rows,summaries,totals:counts(rows),daily:Array.from(days,([date,rs])=>({date,...counts(rs)})),skipped,generated:new Date().toISOString()};
}
let modal, root={},roster=[], report=null,page=0,previousFocus,oldOverflow,loading=false;
const el=id=>document.getElementById(id);
const message=(s,error=false)=>{el('ar-message').textContent=s;el('ar-message').classList.toggle('error',error);};
function filters(){return {from:el('ar-from').value,to:el('ar-to').value,team:el('ar-team').value,agent:el('ar-agent').value};}
function invalidate(){report=null;el('ar-results').hidden=true;message('Filters changed. Select Generate report to apply them.');}
function peopleOptions(){
 const selected=el('ar-agent').value||'ALL',team=el('ar-team').value;
 const people=new Map();
 roster.forEach(p=>{const id=String(p.userId||p.ytelId||'');if(id&&(team==='ALL'||teamOf(p.team,p.fullName)===team))people.set(id,p.fullName||p.name||id);});
 Object.values(root).forEach(day=>{if(day&&typeof day==='object')Object.entries(day).forEach(([key,r])=>{if(r&&typeof r==='object'&&(team==='ALL'||teamOf(r.team,r.name||r.agentName)===team))people.set(String(r.agentId||r.userId||r.ytelId||key),r.name||r.agentName||people.get(key)||key);});});
 el('ar-agent').innerHTML='<option value="ALL">Everyone</option>'+Array.from(people).sort((a,b)=>String(a[1]).localeCompare(String(b[1]))).map(([id,name])=>`<option value="${esc(id)}">${esc(name)} (${esc(id)})</option>`).join('');
 el('ar-agent').value=people.has(selected)?selected:'ALL';
}
async function refresh(){
 loading=true;report=null;el('ar-results').hidden=true;el('ar-generate').disabled=true;el('ar-refresh').disabled=true;message('Loading attendance and roster…');
 try {
  if(!global.rtdbGet||!global.rtdbRef)throw new Error('Attendance connection is not ready. Please retry shortly.');
  const [a,p]=await Promise.all([global.rtdbGet(global.rtdbRef('attendance')),global.rtdbGet(global.rtdbRef('biz_master_roster'))]);
  root=a.val()||{};const val=p.val();roster=(val?(Array.isArray(val)?val:Object.values(val)):(global.allAgentProfiles||[])).filter(p=>p&&typeof p==='object');
  peopleOptions();loading=false;generate();
 }catch(e){message('Unable to load report: '+e.message,true);}
 finally{loading=false;el('ar-generate').disabled=false;el('ar-refresh').disabled=false;}
}
function open(){
 previousFocus=document.activeElement;
 if(!modal){
 modal=document.createElement('div');modal.id='ar-modal';modal.hidden=true;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','ar-title');
 modal.innerHTML=`<div class="ar-shell"><header class="ar-head"><div><div class="ar-kicker">People operations / Attendance</div><h2 id="ar-title">Attendance reports</h2><div class="ar-muted">Overall insights, individual history and professional downloads</div></div><button type="button" class="ar-btn secondary close" id="ar-close" aria-label="Close reports">×</button></header><div class="ar-body"><div class="ar-filters">
 <label>Period<select id="ar-period"><option value="month">This month</option><option value="last">Last month</option><option value="week">This week</option><option value="year">This year</option><option value="all">All recorded history</option><option value="custom">Custom dates</option></select></label>
 <label>From<input type="date" id="ar-from"></label><label>To<input type="date" id="ar-to"></label>
 <label>Team<select id="ar-team"><option value="ALL">All teams</option><option value="BB">Berbice</option><option value="PR">Providence</option><option value="RM">Remote</option><option value="Unassigned">Unassigned</option></select></label>
 <label>Employee<select id="ar-agent"><option value="ALL">Everyone</option></select></label><button type="button" class="ar-btn" id="ar-generate">Generate report</button><button type="button" class="ar-btn secondary" id="ar-refresh">Refresh data</button></div>
 <div id="ar-message" class="ar-message" role="status" aria-live="polite"></div><div id="ar-results" hidden><div class="ar-actions"><div id="ar-scope" class="ar-muted"></div><button type="button" class="ar-btn secondary" id="ar-all">View everyone</button><button type="button" class="ar-btn" id="ar-excel">Download Excel</button><button type="button" class="ar-btn" id="ar-pdf">Download PDF</button></div><div id="ar-cards" class="ar-cards"></div><div class="ar-charts"><div class="ar-chart"><canvas id="ar-status-chart" width="900" height="470" role="img" aria-label="Attendance status totals"></canvas></div><div class="ar-chart"><canvas id="ar-trend-chart" width="900" height="470" role="img" aria-label="Attendance daily trend"></canvas></div></div><h3 class="ar-section-title">Employee summary</h3><p class="ar-muted">Click a name to open the individual report. Rates use recorded statuses only.</p><div id="ar-summary" class="ar-table-wrap"></div><h3 class="ar-section-title">Dated attendance history</h3><div class="ar-actions"><input id="ar-search" class="ar-search" aria-label="Search history" placeholder="Search name, date, status or notes"><span class="ar-muted">Search filters this preview only. Downloads contain the full selected report.</span></div><div id="ar-detail" class="ar-table-wrap"></div><div class="ar-pagination"><button type="button" class="ar-btn secondary" id="ar-prev">Previous</button><span id="ar-pages" class="ar-muted"></span><button type="button" class="ar-btn secondary" id="ar-next">Next</button></div><div class="ar-note">${esc(RULES)}</div></div></div></div>`;
 document.body.appendChild(modal);
 el('ar-close').onclick=close;el('ar-generate').onclick=generate;el('ar-refresh').onclick=refresh;el('ar-period').onchange=()=>{preset();invalidate();};
 ['ar-from','ar-to'].forEach(id=>el(id).onchange=()=>{el('ar-period').value='custom';invalidate();});
 el('ar-team').onchange=()=>{peopleOptions();invalidate();};el('ar-agent').onchange=invalidate;
 el('ar-all').onclick=()=>{el('ar-agent').value='ALL';generate();};
 el('ar-search').oninput=()=>{page=0;detail();};el('ar-prev').onclick=()=>{page--;detail();};el('ar-next').onclick=()=>{page++;detail();};
 el('ar-excel').onclick=()=>exportReport('excel');el('ar-pdf').onclick=()=>exportReport('pdf');
 modal.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const list=Array.from(modal.querySelectorAll('button,input,select')).filter(e=>!e.disabled&&e.getClientRects().length);const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 }
 if(modal.hidden){oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';modal.hidden=false;}
 preset();el('ar-close').focus();refresh();
}
function close(){modal.hidden=true;document.body.style.overflow=oldOverflow||'';if(previousFocus)previousFocus.focus();}
function preset(){
 const t=today(),d=new Date(t+'T12:00:00Z'),mode=el('ar-period').value;let from=t,to=t;
 if(mode==='custom')return;
 if(mode==='month')from=t.slice(0,7)+'-01';
 if(mode==='year')from=t.slice(0,4)+'-01-01';
 if(mode==='last'){d.setUTCDate(0);to=d.toISOString().slice(0,10);from=to.slice(0,7)+'-01';}
 if(mode==='week'){d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));from=d.toISOString().slice(0,10);}
 if(mode==='all'){const dates=Object.keys(root).filter(x=>validDate(x)&&x<=t).sort();from=dates[0]||t;}
 el('ar-from').value=from;el('ar-to').value=to;
}
function generate(){
 if(loading)return;
 const f=filters();
 if(!validDate(f.from)||!validDate(f.to)||f.from>f.to||f.to>today()){report=null;el('ar-results').hidden=true;message('Choose valid dates, with From before To and no future dates.',true);return;}
 report=build(root,roster,f);page=0;el('ar-search').value='';render();
}
function table(headers,rows){return `<table class="ar-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>'<tr>'+r.map(v=>`<td>${v}</td>`).join('')+'</tr>').join(''):`<tr><td colspan="${headers.length}">No records for this selection.</td></tr>`}</tbody></table>`;}
function render(){
 const r=report,t=r.totals;el('ar-results').hidden=false;
 el('ar-scope').textContent=`${r.filters.from} to ${r.filters.to} · ${r.filters.team==='ALL'?'All teams':r.filters.team} · ${r.filters.agent==='ALL'?'Everyone':el('ar-agent').selectedOptions[0].textContent}`;
 el('ar-all').hidden=r.filters.agent==='ALL';
 const cards=[['Employees',r.summaries.length],['Recorded employee-days',t.recorded],['Confirmed absences',t.Absent],['Times late',t.Late],['Attendance rate',pct(t.attendance)],['Punctuality',pct(t.punctuality)]];
 el('ar-cards').innerHTML=cards.map(([label,v])=>`<div class="ar-card"><span>${label}</span><strong>${v}</strong></div>`).join('');
 el('ar-summary').innerHTML=table(['Employee / ID','Team','Roster status','Recorded',...STATUSES,'Attendance','Punctuality'],r.summaries.map(a=>[`<button type="button" data-agent="${esc(a.id)}">${esc(a.name)}<br><span class="ar-muted">${esc(a.id)}</span></button>`,esc(a.team),esc(a.rosterStatus),a.recorded,...STATUSES.map(s=>a[s]),pct(a.attendance),pct(a.punctuality)]));
 el('ar-summary').querySelectorAll('[data-agent]').forEach(b=>b.onclick=()=>{el('ar-agent').value=b.dataset.agent;generate();});
 drawStatus(el('ar-status-chart'),t);drawTrend(el('ar-trend-chart'),r.daily);detail();
 const zero=r.summaries.filter(a=>!a.recorded).length;
 message(`${t.recorded} records loaded. ${zero?zero+(zero===1?' employee has':' employees have')+' no recorded attendance in this period. ':''}${r.skipped?r.skipped+' malformed entries were skipped. ':''}Updated ${new Date(r.generated).toLocaleString('en-GB',{timeZone:'America/Guyana'})} (Guyana).`);
 el('ar-excel').disabled=!r.summaries.length;el('ar-pdf').disabled=!r.summaries.length;
}
function detail(){
 if(!report)return;const q=el('ar-search').value.toLowerCase();const rows=report.rows.filter(r=>[r.date,r.name,r.id,r.status,r.notes].join(' ').toLowerCase().includes(q)).slice().reverse();const pages=Math.max(1,Math.ceil(rows.length/50));page=Math.max(0,Math.min(page,pages-1));
 el('ar-detail').innerHTML=table(['Date','Employee','ID','Team','Status','Clock-in','Notes / reason','Edited by','Edited at'],rows.slice(page*50,page*50+50).map(r=>[esc(r.date),esc(r.name),esc(r.id),esc(r.team),`<span class="ar-pill ${r.status.toLowerCase()}">${esc(r.status==='Unknown'?(r.rawStatus||'Unknown'):r.status)}</span>`,esc(r.clockedAt||'Not recorded'),`<div class="ar-wrap">${esc(r.notes)}</div>`,esc(r.editedBy),esc(r.editedAt)]));
 el('ar-pages').textContent=`Page ${page+1} of ${pages} · ${rows.length} records`;el('ar-prev').disabled=page===0;el('ar-next').disabled=page>=pages-1;
}
function chartBase(canvas,title){const c=canvas.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,900,470);c.fillStyle='#172b49';c.font='bold 25px Arial';c.fillText(title,25,38);return c;}
function drawStatus(canvas,t){const c=chartBase(canvas,'Attendance by status');const max=Math.max(1,...STATUSES.map(s=>t[s]));STATUSES.forEach((s,i)=>{const y=70+i*37;c.fillStyle='#536479';c.font='18px Arial';c.fillText(s,25,y+19);c.fillStyle='#edf1f6';c.fillRect(172,y,620,25);c.fillStyle=COLORS[i];c.fillRect(172,y,620*t[s]/max,25);c.fillStyle='#172b49';c.fillText(String(t[s]),805,y+20);});}
function drawTrend(canvas,days){
 const c=chartBase(canvas,'Daily attendance trend');const series=[['Attended','#168c75','attended'],['Absent','#d94e65','Absent'],['Late','#d69b24','Late']];
 series.forEach(([label,color],i)=>{c.fillStyle=color;c.fillRect(30+i*240,61,17,5);c.font='16px Arial';c.fillText(label,55+i*240,69);});
 c.fillStyle='#6b7d93';c.font='14px Arial';c.fillText('Late is included in Attended. Only recorded dates are plotted.',30,100);
 if(!days.length){c.font='22px Arial';c.fillText('No recorded attendance in this period',150,255);return;}
 const max=Math.max(1,...days.map(d=>d.attended),...days.map(d=>d.Absent));
 for(let i=0;i<=4;i++){const y=390-i*65;c.strokeStyle='#e5eaf1';c.beginPath();c.moveTo(65,y);c.lineTo(860,y);c.stroke();c.fillStyle='#52637a';c.fillText((max*i/4).toFixed(max<4?1:0),20,y+4);}
 const x=i=>65+(days.length===1?397:i*795/(days.length-1));
 series.forEach(([,color,key])=>{c.strokeStyle=color;c.lineWidth=3;c.beginPath();days.forEach((d,i)=>{const y=390-d[key]/max*260;if(i)c.lineTo(x(i),y);else c.moveTo(x(i),y);});c.stroke();if(days.length<=50)days.forEach((d,i)=>{c.fillStyle=color;c.beginPath();c.arc(x(i),390-d[key]/max*260,4,0,Math.PI*2);c.fill();});});
 const indices=[...new Set([0,Math.floor((days.length-1)/2),days.length-1])];c.fillStyle='#52637a';c.font='16px Arial';indices.forEach(i=>{c.textAlign=i===0?'left':i===days.length-1?'right':'center';c.fillText(days[i].date,x(i),425);});c.textAlign='left';
}
const scripts={};
function loadScript(src){if(scripts[src])return scripts[src];scripts[src]=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>{delete scripts[src];s.remove();reject(new Error('Export component could not load. Check that the js/vendor folder was uploaded.'));};document.head.appendChild(s);});return scripts[src];}
function download(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function exportReport(type){
 const r=report;if(!r)return;el('ar-excel').disabled=true;el('ar-pdf').disabled=true;message('Preparing '+(type==='excel'?'Excel workbook':'PDF report')+'…');
 try{const file=`Attendance_${r.filters.agent==='ALL'?'Overall':r.filters.agent.replace(/[^a-z0-9_-]/gi,'_')}_${r.filters.from}_${r.filters.to}`;if(type==='excel')await excel(r,file);else await pdf(r,file);message('Your '+(type==='excel'?'Excel workbook':'PDF report')+' download is ready.');}
 catch(e){console.error('Attendance export failed',e);message('Download failed: '+e.message,true);}
 finally{el('ar-excel').disabled=false;el('ar-pdf').disabled=false;}
}
function contextLines(r){return [`Period: ${r.filters.from} to ${r.filters.to}`,`Team: ${r.filters.team} | Employee: ${r.filters.agent==='ALL'?'Everyone':(r.summaries[0]?.name||r.filters.agent)+' ('+r.filters.agent+')'}`,`Generated: ${new Date(r.generated).toLocaleString('en-GB',{timeZone:'America/Guyana'})} (Guyana)`,`${r.totals.recorded} recorded employee-days | ${r.summaries.length} employees | ${r.skipped} malformed entries skipped`];}
async function excel(r,file){
 await loadScript('js/vendor/exceljs.min.js');const wb=new global.ExcelJS.Workbook();wb.creator='Biz Dashboard';wb.created=new Date(r.generated);
 function sheet(name,headers,rows,widths){const ws=wb.addWorksheet(name);ws.columns=headers.map((h,i)=>({header:h,key:'c'+i,width:widths?.[i]||18}));rows.forEach(row=>ws.addRow(row));ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:'A1',to:{row:Math.max(1,rows.length+1),column:headers.length}};ws.getRow(1).height=32;ws.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF193854'}};});ws.eachRow((row,n)=>{if(n===1)return;row.eachCell(c=>{c.alignment={vertical:'top',wrapText:true};if(n%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0F5FA'}};});});ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};return ws;}
 const dash=wb.addWorksheet('Overview');dash.columns=[{width:30},{width:36},{width:25},{width:25},{width:25},{width:25},{width:25},{width:25}];dash.mergeCells('A1:H2');dash.getCell('A1').value='ATTENDANCE REPORT';dash.getCell('A1').font={size:23,bold:true,color:{argb:'FF193854'}};
 contextLines(r).forEach((s,i)=>{dash.mergeCells(i+4,1,i+4,8);dash.getCell(i+4,1).value=s;});
 [['Recorded employee-days',r.totals.recorded],['Employees',r.summaries.length],['Confirmed absences',r.totals.Absent],['Times late',r.totals.Late],['Attendance rate',pct(r.totals.attendance)],['Punctuality',pct(r.totals.punctuality)]].forEach(([k,v],i)=>{dash.getCell(i+9,1).value=k;dash.getCell(i+9,2).value=v;dash.getCell(i+9,1).font={bold:true};});
 for(const [id,row] of [['ar-status-chart',17],['ar-trend-chart',42]]){const canvas=document.createElement('canvas');canvas.width=900;canvas.height=470;if(id==='ar-status-chart')drawStatus(canvas,r.totals);else drawTrend(canvas,r.daily);const image=wb.addImage({base64:canvas.toDataURL('image/png'),extension:'png'});dash.addImage(image,{tl:{col:0,row},br:{col:4.4,row:row+23.5},editAs:'oneCell'});}
 dash.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:2,printArea:'A1:H67'};
 const summary=sheet('Employee Summary',['Employee','ID','Team','Roster status','Recorded days',...STATUSES,'Attendance rate','Punctuality','Absent dates','Late dates'],r.summaries.map(a=>[a.name,a.id,a.team,a.rosterStatus,a.recorded,...STATUSES.map(s=>a[s]),a.attendance,a.punctuality,a.absentDates.join(', '),a.lateDates.join(', ')]),[28,16,18,18,18,...STATUSES.map(()=>15),19,19,50,50]);
 [16,17].forEach(col=>summary.getColumn(col).numFmt='0.0%');
 const headers=['Date','Employee','ID','Team','Status','Clock-in','Notes / reason','Edited by','Edited at','Admin edited'];const records=rows=>rows.map(r=>[r.date,r.name,r.id,r.team,r.status==='Unknown'?(r.rawStatus||'Unknown'):r.status,r.clockedAt,r.notes,r.editedBy,r.editedAt,r.adminEdited?'Yes':'No']);const widths=[15,28,16,15,19,18,55,25,28,16];
 sheet('Attendance History',headers,records(r.rows),widths);sheet('Absences and Lateness',headers,records(r.rows.filter(x=>['Absent','Late'].includes(x.status))),widths);
 sheet('Daily Trend',['Date','Attended','Absent','Late',...STATUSES.filter(s=>!['Absent','Late'].includes(s))],r.daily.map(d=>[d.date,d.attended,d.Absent,d.Late,...STATUSES.filter(s=>!['Absent','Late'].includes(s)).map(s=>d[s])]));
 sheet('Status Totals',['Status','Employee-days'],STATUSES.map(s=>[s,r.totals[s]]),[25,22]);
 sheet('Report Notes',['Topic','Explanation'],[['Calculation rules',RULES],['Scope',contextLines(r).join('\n')],['No records','Employees with zero records are included in the summary. N/A rates are blank in numeric Excel cells. No missing day is counted as a confirmed absence.'],['Charts','Charts on Overview are fixed images of this report snapshot. The underlying values are in Status Totals and Daily Trend.'],['Source','Firebase attendance and biz_master_roster. Current saved values are reported; edited fields are not a complete change log.']], [28,115]);
 download(await wb.xlsx.writeBuffer(),file+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
async function pdf(r,file){
 await loadScript('js/vendor/jspdf.umd.min.js');await loadScript('js/vendor/jspdf.plugin.autotable.min.js');
 const doc=new global.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});const width=297,height=210;
 const text=(s)=>String(s==null?'':s).replace(/[^\x20-\x7E\xA0-\xFF\n]/g,' ');
 const heading=title=>{doc.setFillColor(25,56,84);doc.rect(0,0,width,22,'F');doc.setTextColor(255);doc.setFontSize(17);doc.text(title,12,14);doc.setTextColor(30,46,64);};
 let activeTitle='ATTENDANCE REPORT';
 const newPage=title=>{activeTitle=title;doc.addPage();heading(title);};heading('ATTENDANCE REPORT');doc.setFontSize(10);contextLines(r).forEach((s,i)=>doc.text(text(s),12,31+i*6));
 const totals=[['Recorded days',r.totals.recorded],['Employees',r.summaries.length],['Absences',r.totals.Absent],['Times late',r.totals.Late],['Attendance',pct(r.totals.attendance)],['Punctuality',pct(r.totals.punctuality)]];
 totals.forEach(([label,v],i)=>{const x=12+i*46;doc.setFillColor(238,244,249);doc.roundedRect(x,57,43,23,2,2,'F');doc.setFontSize(8);doc.text(label,x+3,64);doc.setFontSize(16);doc.text(String(v),x+3,75);});
 for(const [status,x] of [[true,12],[false,151]]){const c=document.createElement('canvas');c.width=900;c.height=470;status?drawStatus(c,r.totals):drawTrend(c,r.daily);doc.addImage(c.toDataURL('image/png'),'PNG',x,86,134,70);}
 doc.setFontSize(8);doc.text(doc.splitTextToSize(text(RULES),273),12,164);
 const tableOpts={didDrawPage:()=>heading(activeTitle),margin:{top:29,left:12,right:12,bottom:16},styles:{fontSize:8,cellPadding:2.5,overflow:'linebreak'},headStyles:{fillColor:[25,56,84]},alternateRowStyles:{fillColor:[241,245,249]},rowPageBreak:'avoid'};
 newPage('EMPLOYEE SUMMARY');doc.autoTable({...tableOpts,startY:29,head:[['Employee / ID','Team','Days','Present','Late','Absent','Training','Attendance','Punctuality']],body:r.summaries.map(a=>[text(a.name)+'\n'+text(a.id),text(a.team),a.recorded,a.Present,a.Late,a.Absent,a.Training,pct(a.attendance),pct(a.punctuality)])});
 newPage('LEAVE AND OTHER STATUSES');doc.autoTable({...tableOpts,startY:29,head:[['Employee / ID','Roster status','Personal Out','Vacation','Sick','Off','Holiday','Unknown']],body:r.summaries.map(a=>[text(a.name)+'\n'+text(a.id),text(a.rosterStatus),a['Personal Out'],a.Vacation,a.Sick,a.Off,a.Holiday,a.Unknown])});
 const addDetails=(title,rows)=>{newPage(title);if(!rows.length){doc.setFontSize(11);doc.text('No matching records in the selected period.',12,35);return;}doc.autoTable({...tableOpts,startY:29,head:[['Date','Employee / ID','Team','Status','Clock-in','Notes / reason','Last recorded edit']],body:rows.map(a=>[a.date,text(a.name)+'\n'+text(a.id),text(a.team),text(a.status==='Unknown'?(a.rawStatus||'Unknown'):a.status),text(a.clockedAt),text(a.notes),text([a.editedBy,a.editedAt].filter(Boolean).join('\n'))]),columnStyles:{0:{cellWidth:23},1:{cellWidth:47},2:{cellWidth:16},3:{cellWidth:25},4:{cellWidth:22},5:{cellWidth:85},6:{cellWidth:55}}});};
 addDetails('ABSENCES AND LATENESS',r.rows.filter(a=>['Absent','Late'].includes(a.status)));addDetails('COMPLETE ATTENDANCE HISTORY',r.rows);
 for(let i=1;i<=doc.getNumberOfPages();i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(90);doc.text(`Biz Dashboard | Attendance | ${r.filters.from} to ${r.filters.to}`,12,height-7);doc.text(`Page ${i} of ${doc.getNumberOfPages()}`,width-12,height-7,{align:'right'});}
 download(doc.output('arraybuffer'),file+'.pdf','application/pdf');
}
global.AttendanceReports={open,close,build,counts,teamOf};
})(window);
