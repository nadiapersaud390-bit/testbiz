// Local multi-session integration test. All Firebase reads/writes stay in memory.
// Run with NODE_PATH pointing to a Playwright installation.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const fixtureNow = Date.parse('2026-10-08T15:00:00-04:00');
let revision = 0, pushId = 0;
const db = {
  '.info': { connected: true, serverTimeOffset: 0 },
  biz_master_roster: [{ userId:'101', fullName:'Alice Example', team:'BB' },{ userId:'102', fullName:'Beth Example', team:'PR' },{ userId:'103', fullName:'Robin Example', team:'RM' }],
  super_admin: { email:'rose', name:'Rose', role:'super_admin' },
  admins_list: { manager:{email:'manager',name:'Manager',role:'admin',calendarAccess:true}, manager2:{email:'manager2',name:'Second Admin',role:'admin',calendarAccess:true}, denied:{email:'denied',role:'admin',calendarAccess:false}, blocked:{email:'blocked',role:'admin',calendarAccess:true} },
  admin_calendar:{ events:{}, birthdays:{}, reminder_ack:{}, requests:{} }
};
const subscriptions = new Map(), logs = [], errors = [];
const clone = v => JSON.parse(JSON.stringify(v ?? null));
const get = p => clone(p.split('/').reduce((o,k)=>o?.[k],db));
function put(p,v) { const keys=p.split('/'), last=keys.pop(); let obj=db; for(const k of keys)obj=obj[k] ||= {}; if(v===null)delete obj[last];else obj[last]=clone(v); revision++; }
async function notify() { await Promise.all([...subscriptions].flatMap(([page, subs])=>[...subs].map(([id,p])=>page.evaluate(({id,v})=>window.__deliver(id,v),{id,v:get(p)})))); }
let browser;
async function mount(role,id,viewport,expectVisible=true) {
 const context=await browser.newContext({viewport:viewport||{width:1366,height:1000}}), page=await context.newPage();
 page.setDefaultTimeout(6000); subscriptions.set(page,new Map());
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 await page.exposeFunction('__read',async p=>{logs.push({id,path:p,kind:'read'});return {value:get(p),revision}});
 await page.exposeFunction('__sub',async(p,key)=>{subscriptions.get(page).set(key,p);logs.push({id,path:p,kind:'subscribe'});return get(p)});
 await page.exposeFunction('__unsub',key=>subscriptions.get(page).delete(key));
 await page.exposeFunction('__push',()=>'-test'+(++pushId));
 await page.exposeFunction('__commit',async(p,value,expected)=>{
   if(expected!==revision)return false;
   put(p,value); await notify(); return true;
 });
 await page.addInitScript(({role,id,fixtureNow})=>{
  Date.now=()=>fixtureNow;
  sessionStorage.setItem('bizUserRole',role);
  if(role==='agent'){sessionStorage.setItem('agentLoggedIn','1');sessionStorage.setItem('currentAgentProfile',JSON.stringify({ytelId:id,name:id==='101'?'Alice Example':id==='102'?'Beth Example':'Robin Example',team:id==='101'?'BB':id==='102'?'PR':'RM'}));}
  else {sessionStorage.setItem('adminLoggedIn','true');sessionStorage.setItem('currentAdmin',JSON.stringify({email:id,name:id==='manager'?'Manager':id==='rose'?'Rose':'Second Admin',role:id==='rose'?'super_admin':'admin'}));}
  let seq=0,push=Number(sessionStorage.getItem('testPush')||0);const listeners={};
  window.__deliver=(id,v)=>listeners[id]?.({val:()=>v});
  window.rtdbRef=p=>p;
  window.rtdbOnValue=(p,cb,onError)=>{if(id==='blocked'&&p.startsWith('admin_calendar/requests')){setTimeout(()=>onError(new Error('Permission denied')),0);return()=>{}}const subId=++seq;listeners[subId]=cb;__sub(p,subId).then(v=>window.__deliver(subId,v));return()=>{delete listeners[subId];__unsub(subId)}};
  window.rtdbGet=async p=>{const {value}=await __read(p);return{val:()=>value}};
  window.rtdbPush=()=>{push++;sessionStorage.setItem('testPush',String(push));return{key:'-test-'+id+'-'+push}};
  window.rtdbRunTransaction=async(p,fn,options)=>{if(window.__failWrites)throw Error('Simulated save failure');if(options.applyLocally!==false)throw Error('Expected committed-only writes');for(let i=0;i<10;i++){const{value,revision}=await __read(p);const next=fn(value);if(next===undefined)return{committed:false};if(await __commit(p,next,revision))return{committed:true};}throw Error('Too much contention')};
  window.rtdbSet=async(p,v)=>{for(;;){const{revision}=await __read(p);if(await __commit(p,v,revision))return;}};
  window.rtdbUpdate=async(p,patch)=>{for(;;){const{value,revision}=await __read(p);if(await __commit(p,{...value,...patch},revision))return;}};
  window.rtdbRemove=p=>window.rtdbSet(p,null);
 },{role,id,fixtureNow});
 const production = fs.readFileSync(path.join(root,'index.html'),'utf8');
 const launches=production.match(/<button type="button" class="ac-launch"[\s\S]*?(?=\s*<div class="dashboard-nav-grid">)/)[0];
 const panel=fs.readFileSync(path.join(root,'tabs/superadminpanel.html'),'utf8');
 assert.match(panel,/if \(tabId === 'users'\) window.TimeOffTeamAccess\?\.mount\(\);\s*if \(_supTabInited/);
 const host=panel.match(/<section id="to-team-access-host"><\/section>/)[0];
 const html=`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/admin-calendar.css"><link rel="stylesheet" href="/css/time-off.css"></head><body style="margin:0;background:#081325;padding:25px"><h1 style="color:white;font:30px Arial">BIZ Level Up Dashboard</h1><section>${launches}</section>${host}${['admin-calendar-core','time-off-core','time-off-access','time-off','admin-calendar'].map(f=>`<script src="/js/${f}.js"></script>`).join('')}</body></html>`;
 await page.route('https://test.local/**',route=>{const pathname=new URL(route.request().url()).pathname;const body=pathname==='/'?html:fs.readFileSync(path.join(root,pathname.slice(1)));route.fulfill({status:200,contentType:pathname==='/'?'text/html':pathname.endsWith('.js')?'text/javascript':'text/css',body})});
 await page.goto('https://test.local/');
 if(id!=='denied'&&expectVisible)await page.locator('[data-timeoff-launch]').waitFor({state:'visible'});
 return page;
}
async function open(page){await page.locator('[data-timeoff-launch]').click();await page.waitForFunction(()=>!document.getElementById('to-modal').hidden&&!document.getElementById('to-list').textContent.includes('Waiting for requests to sync.'));}
async function request(page,reason,type='dayoff',date='2026-10-09',end='2026-10-10'){
 await page.selectOption('#to-type',type);await page.fill('#to-date',date);
 if(type!=='dayoff'){await page.uncheck('#to-all-day');await page.fill('#to-time','10:00');await page.fill('#to-end-time','12:30');}
 await page.fill('#to-reason',reason);await page.click('#to-submit');
 await page.waitForFunction(()=>document.getElementById('to-status').textContent.startsWith('Request sent.'));
}
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.TIMEOFF_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 const alice=await mount('agent','101'),beth=await mount('agent','102'),admin=await mount('admin','manager'),admin2=await mount('admin','manager2'),denied=await mount('admin','denied');
 await open(alice);await request(alice,'Family commitment <img src=x onerror=alert(1)>');
 await open(beth);await request(beth,'Medical appointment','appointment','2026-10-12','2026-10-12');
 await open(admin);assert.match(await admin.locator('#to-list').innerText(),/Alice Example · BB/);assert.match(await admin.locator('#to-list').innerText(),/Beth Example · PR/);
 assert.equal(await admin.locator('#to-list img').count(),0);
 await admin.selectOption('#to-team','PR');assert.equal(await admin.locator('#to-list article').count(),1);assert.match(await admin.locator('#to-list').innerText(),/Beth/);await admin.selectOption('#to-team','ALL');
 // Calendar projections, single-date placement, all-team pending inbox and review routing.
 await admin.click('[data-to-action="close"]');await admin.locator('[data-calendar-launch]').click();
 await admin.waitForFunction(()=>document.getElementById('ac-pending-requests').textContent.includes('Beth'));
 assert.equal(await admin.locator('#ac-grid [data-event="request:101:-test-101-1"]').count(),1);
 await admin.selectOption('#ac-team','PR');assert.equal(await admin.locator('#ac-grid [data-event="request:101:-test-101-1"]').count(),0);
 assert.match(await admin.locator('#ac-pending-requests').innerText(),/Alice/);
 await admin.locator('#ac-pending-requests [data-event="request:101:-test-101-1"]').click();
 await admin.fill('#to-review-note','Approved. Enjoy your time off.');
 await admin.click('[data-decision="Approved"]');await alice.waitForFunction(()=>document.getElementById('to-list').textContent.includes('Approved. Enjoy your time off.'));
 assert.equal(db.admin_calendar.requests['101']['-test-101-1'].status,'Approved');
 assert.match(await alice.locator('#to-list').innerText(),/Approved by Manager/);
 assert.doesNotMatch(await beth.locator('#to-list').innerText(),/Family commitment/);
 // Duplicate active request is refused atomically, retaining form inputs.
 await alice.fill('#to-date','2026-10-09');await alice.fill('#to-reason','Duplicate');await alice.click('#to-submit');
 await alice.waitForFunction(()=>document.getElementById('to-status').textContent.includes('may already'));
 assert.equal(Object.keys(db.admin_calendar.requests['101']).length,1);assert.equal(await alice.inputValue('#to-reason'),'Duplicate');
 // Concurrent reviewer sees live decision; decline needs a reply.
 await open(admin2);await admin.locator('[data-review="request:102:-test-102-1"]').click();await admin2.locator('[data-review="request:102:-test-102-1"]').click();
 await admin.click('[data-decision="Declined"]');await admin.waitForFunction(()=>document.getElementById('to-status').textContent.includes('Write a short reply'));
 await admin.fill('#to-review-note','Please choose a different time.');await admin.click('[data-decision="Declined"]');
 await beth.waitForFunction(()=>document.getElementById('to-list').textContent.includes('Please choose a different time.'));
 await admin2.waitForFunction(()=>document.getElementById('to-review').textContent.includes('has been declined'));
 assert.equal(await admin2.locator('[data-decision]').count(),0);
 // Refresh recovers saved statuses and replies.
 await beth.reload();await open(beth);assert.match(await beth.locator('#to-list').innerText(),/Declined/);
 // Cancel pending, never approved. Other times and dates are accepted.
 await request(beth,'Personal errand','other','2026-10-14','2026-10-14');await beth.locator('[data-cancel]').click();
 await beth.waitForFunction(()=>document.getElementById('to-status').textContent.includes('Request cancelled'));
 assert.equal(Object.values(db.admin_calendar.requests['102']).filter(r=>r.status==='Cancelled').length,1);
 assert.equal(await alice.locator('[data-cancel]').count(),0);
 // Failed writes retain the form and do not claim success.
 await beth.fill('#to-date','2026-10-15');await beth.fill('#to-reason','Keep this draft');
 await beth.evaluate(()=>window.__failWrites=true);await beth.click('#to-submit');
 await beth.waitForFunction(()=>document.getElementById('to-status').textContent.includes('Simulated save failure'));
 assert.equal(await beth.inputValue('#to-reason'),'Keep this draft');assert.equal(Object.keys(db.admin_calendar.requests['102']).length,2);
 await beth.evaluate(()=>window.__failWrites=false);
 // Offline blocks submissions without silently claiming success.
 put('.info/connected',false);await notify();assert.equal(await beth.locator('#to-submit').isDisabled(),true);
 put('.info/connected',true);await notify();assert.equal(await beth.locator('#to-submit').isDisabled(),false);
 // Late arrival and early departure each need one date and one time, with no hidden required inputs.
 for (const [page,type,time,date,reason] of [[alice,'late','10:00','2026-10-16','Arriving after an appointment'],[beth,'early','15:30','2026-10-16','Leaving for a family commitment']]) {
  await page.selectOption('#to-type',type);await page.fill('#to-date',date);await page.fill('#to-time',time);await page.fill('#to-reason',reason);
  assert.equal(await page.locator('#to-form input[type=date]').count(),1);
  assert.equal(await page.locator('#to-form input[type=time]:visible').count(),1);
  assert.equal(await page.locator('#to-all-day-label').isVisible(),false);
  assert.equal(await page.locator('#to-end-time').isDisabled(),true);
  assert.match(await page.locator('#to-time-label').innerText(),type==='late'?/Expected arrival time/:/Leaving time/);
  await page.click('#to-submit');await page.waitForFunction(()=>document.getElementById('to-status').textContent.startsWith('Request sent.'));
 }
 const late=Object.values(db.admin_calendar.requests['101']).find(r=>r.type==='late'),early=Object.values(db.admin_calendar.requests['102']).find(r=>r.type==='early');
 assert.equal(late.timeMode,'arrival');assert.equal(late.endTime,'');assert.equal(late.date,late.endDate);
 assert.equal(early.timeMode,'departure');assert.equal(early.time,'15:30');assert.equal(early.date,early.endDate);
 assert.match(await admin.locator('#to-list').innerText(),/Arriving at 10:00 AM/);
 assert.match(await admin.locator('#to-list').innerText(),/Leaving at 3:30 PM/);
 await admin.locator('#to-list article').filter({hasText:'Arriving after an appointment'}).locator('[data-review]').click();await admin.click('[data-decision=Approved]');
 await alice.waitForFunction(()=>[...document.querySelectorAll('#to-list article')].some(el=>el.textContent.includes('Arriving at 10:00 AM')&&el.textContent.includes('Approved')));
 // Approved projection and no duplicate stored calendar events.
 await admin.click('[data-to-action="close"]');await admin.locator('[data-calendar-launch]').click();await admin.selectOption('#ac-team','ALL');
 assert.match(await admin.locator('#ac-grid [data-event="request:101:-test-101-1"]').first().innerText(),/Approved/);
 assert.deepEqual(db.admin_calendar.events,{});
 assert.match(await admin.locator('#ac-pending-requests').innerText(),/Leaving at 15:30/);
 await admin.locator('[data-date="2026-10-16"]').first().click();
 assert.match(await admin.locator('#ac-day-list').innerText(),/Arriving at 10:00/);
 // Capture desktop and narrow layouts.
 const screenshots=process.env.TIMEOFF_SCREENSHOT_DIR;
 if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await admin.screenshot({path:path.join(screenshots,'admin-calendar.png')});}
 await alice.locator('[data-to-action="close"]').click();await open(alice);await alice.setViewportSize({width:390,height:844});
 assert.equal(await alice.evaluate(()=>document.querySelector('.to-shell').scrollWidth>document.querySelector('.to-shell').clientWidth),false);
 if(screenshots)await alice.screenshot({path:path.join(screenshots,'agent-mobile.png')});
 await alice.selectOption('#to-type','early');await alice.fill('#to-date','2026-10-19');await alice.fill('#to-time','15:00');
 assert.equal(await alice.locator('#to-form input[type=time]:visible').count(),1);
 if(screenshots)await alice.screenshot({path:path.join(screenshots,'agent-early-mobile.png')});
 // Switching back to day off removes time requirements and stale times.
 await alice.selectOption('#to-type','dayoff');assert.equal(await alice.locator('#to-form input[type=time]:visible').count(),0);assert.equal(await alice.inputValue('#to-time'),'');
 // Approved requests persist independently of pending queues and reminder dismissals.
 assert.match(await admin.locator('#ac-approved-plans').innerText(),/Alice Example/);
 await admin.selectOption('#ac-team','PR');assert.match(await admin.locator('#ac-approved-plans').innerText(),/Alice Example/);
 await admin.selectOption('#ac-team','ALL');
 let reminder=admin.locator('#ac-reminders .ac-item').filter({hasText:'Family commitment'});
 await reminder.waitFor({state:'visible'});assert.match(await reminder.innerText(),/Tomorrow: approved time off/);
 await reminder.locator('[data-ack]').click();
 await admin.waitForFunction(()=>!document.getElementById('ac-reminders').textContent.includes('Family commitment'));
 assert.match(await admin.locator('#ac-approved-plans').innerText(),/Family commitment/);
 assert.equal(await admin.locator('#ac-grid [data-event="request:101:-test-101-1"]').count(),1);
 await admin.reload();await admin.locator('[data-calendar-launch]').click();
 await admin.waitForFunction(()=>document.getElementById('ac-approved-plans').textContent.includes('Family commitment'));
 assert.doesNotMatch(await admin.locator('#ac-reminders').innerText(),/Family commitment/);
 // Move to the actual day: its separate reminder reappears without creating a new event.
 put('.info/serverTimeOffset',17*3600000);await notify();await admin.evaluate(()=>AdminCalendar.openDate('2026-10-09'));
 reminder=admin.locator('#ac-reminders .ac-item').filter({hasText:'Family commitment'});
 assert.match(await reminder.innerText(),/Today: approved time off/);
 await reminder.locator('[data-ack]').click();await admin.waitForFunction(()=>!document.getElementById('ac-reminders').textContent.includes('Family commitment'));
 assert.match(await admin.locator('#ac-day-list').innerText(),/Approved/);
 // After the date, history remains on the month grid while the reminder expires.
 put('.info/serverTimeOffset',41*3600000);await notify();await admin.evaluate(()=>AdminCalendar.openDate('2026-10-09'));
 assert.equal(await admin.locator('#ac-grid [data-event="request:101:-test-101-1"]').count(),1);
 assert.doesNotMatch(await admin.locator('#ac-approved-plans').innerText(),/Family commitment/);
 assert.doesNotMatch(await admin.locator('#ac-reminders').innerText(),/Family commitment/);
 assert.equal(db.admin_calendar.requests['101']['-test-101-1'].status,'Approved');
 // Remove the last pending request by approval; the admin dashboard banner stays visible.
 const earlyId=Object.entries(db.admin_calendar.requests['102']).find(([,r])=>r.type==='early')[0];
 put('admin_calendar/requests/102/'+earlyId,{...db.admin_calendar.requests['102'][earlyId],status:'Approved',revision:2});await notify();
 await admin.locator('[data-action=close]').click();
 assert.equal(await admin.locator('#to-banner').isVisible(),true);assert.match(await admin.locator('#to-banner').innerText(),/approved on the calendar/);
 assert.equal(await admin.locator('#to-banner button').innerText(),'View calendar');
 await admin.locator('#to-banner button').click();assert.equal(await admin.locator('#ac-modal').isVisible(),true);
 // Default-denied admins never read requests. Agent only listens to own requests.
 assert.equal(await denied.locator('[data-timeoff-launch]').isVisible(),false);
 assert.equal(logs.some(l=>l.id==='denied'&&l.path.startsWith('admin_calendar/requests')),false);
 assert.equal(logs.some(l=>l.id==='101'&&l.path.startsWith('admin_calendar/requests')&&!l.path.startsWith('admin_calendar/requests/101')),false);
 // Super Admin team controls affect agent access, preserving all admin calendar records.
 const master=await mount('admin','rose'),remote=await mount('agent','103');
 await master.evaluate(()=>TimeOffTeamAccess.mount());
 await master.waitForFunction(()=>!document.querySelector('[data-to-team-access=BB]').disabled);
 for(const t of ['BB','PR','RM'])assert.equal(await master.locator('[data-to-team-access='+t+']').isChecked(),true);
 await master.locator('[data-to-team-access=BB]').uncheck();
 await master.waitForFunction(()=>document.querySelector('[data-to-access-status]').textContent.includes('Berbice time-off requests are hidden'));
 assert.deepEqual(db.settings.timeOffTeamAccess.teams,{BB:false,PR:true,RM:true});
 assert.equal(db.settings.timeOffTeamAccess.updatedBy,'rose');
 await alice.locator('[data-timeoff-launch]').waitFor({state:'hidden'});
 assert.equal(await alice.locator('#to-modal').count(),0);assert.equal(await alice.locator('#to-banner').isVisible(),false);
 assert.equal([...subscriptions.get(alice).values()].some(p=>p.startsWith('admin_calendar/requests')),false);
 await alice.evaluate(()=>TimeOffRequests.open());assert.equal(await alice.locator('#to-modal').count(),0);
 assert.equal(await beth.locator('[data-timeoff-launch]').isVisible(),true);assert.equal(await remote.locator('[data-timeoff-launch]').isVisible(),true);
 assert.equal(await admin.locator('#ac-grid [data-event="request:101:-test-101-1"]').count(),1);
 assert.match(await admin.locator('#ac-approved-plans').innerText(),/Alice Example/);
 const disabledAlice=await mount('agent','101',undefined,false);
 // Current roster team, not the cached session team, controls access.
 put('biz_master_roster/0/team','PR');await notify();await alice.locator('[data-timeoff-launch]').waitFor({state:'visible'});
 put('biz_master_roster/0/team','BB');await notify();await alice.locator('[data-timeoff-launch]').waitFor({state:'hidden'});
 assert.equal(await disabledAlice.locator('[data-timeoff-launch]').isVisible(),false);
 assert.equal([...subscriptions.get(disabledAlice).values()].some(p=>p.startsWith('admin_calendar/requests')),false);
 // A failed toggle keeps the last saved policy and offers retry; offline controls are disabled.
 await master.evaluate(()=>window.__failWrites=true);await master.locator('[data-to-team-access=PR]').click();
 await master.waitForFunction(()=>document.querySelector('[data-to-access-status]').textContent.includes('Simulated save failure'));
 assert.equal(await master.locator('[data-to-team-access=PR]').isChecked(),true);assert.equal(db.settings.timeOffTeamAccess.teams.PR,true);
 await master.evaluate(()=>window.__failWrites=false);
 put('.info/connected',false);await notify();assert.equal(await master.locator('[data-to-team-access=BB]').isDisabled(),true);
 put('.info/connected',true);await notify();
 await master.locator('[data-to-team-access=BB]').check();await alice.locator('[data-timeoff-launch]').waitFor({state:'visible'});
 await open(alice);assert.match(await alice.locator('#to-list').innerText(),/Approved/);
 // Fresh policy checks prevent a submission even before its live listener receives revocation.
 const before=Object.keys(db.admin_calendar.requests['101']).length;
 put('settings/timeOffTeamAccess/teams/BB',false);
 await alice.fill('#to-date','2026-10-20');await alice.fill('#to-reason','Must not be sent');await alice.click('#to-submit');
 await alice.locator('[data-timeoff-launch]').waitFor({state:'hidden'});
 assert.equal(Object.keys(db.admin_calendar.requests['101']).length,before);
 put('settings/timeOffTeamAccess/teams/BB',true);await notify();
 // Remote can submit; disabling that team keeps its pending request available for admin review.
 await open(remote);await request(remote,'Remote appointment','dayoff','2026-10-21');
 await master.locator('[data-to-team-access=RM]').uncheck();await remote.locator('[data-timeoff-launch]').waitFor({state:'hidden'});
 assert.match(await admin.locator('#ac-pending-requests').innerText(),/Robin Example/);
 assert.equal(db.admin_calendar.requests['103']['-test-103-1'].status,'Requested');
 // A regular admin cannot mount active controls or change this setting.
 await denied.evaluate(()=>TimeOffTeamAccess.mount());
 assert.equal(await denied.locator('[data-to-team-access=BB]').isDisabled(),true);
 assert.equal(logs.some(l=>l.id==='denied'&&l.path==='settings/timeOffTeamAccess'),false);
 // Concurrent Super Admin sessions preserve changes to different teams.
 const master2=await mount('admin','rose');await master2.evaluate(()=>TimeOffTeamAccess.mount());
 await master2.waitForFunction(()=>!document.querySelector('[data-to-team-access=PR]').disabled);
 await Promise.all([master.locator('[data-to-team-access=BB]').uncheck(),master2.locator('[data-to-team-access=PR]').uncheck()]);
 await master.waitForFunction(()=>document.querySelector('[data-to-access-status]').textContent.includes('Berbice time-off requests are hidden'));
 await master2.waitForFunction(()=>document.querySelector('[data-to-access-status]').textContent.includes('Providence time-off requests are hidden'));
 assert.deepEqual(db.settings.timeOffTeamAccess.teams,{BB:false,PR:false,RM:false});
 if(screenshots){await master.screenshot({path:path.join(screenshots,'superadmin-team-access.png')});await master.setViewportSize({width:390,height:844});assert.equal(await master.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await master.screenshot({path:path.join(screenshots,'superadmin-team-access-mobile.png')});}
 // Malformed policy fails closed; restoring valid flags restores visibility.
 put('settings/timeOffTeamAccess','invalid');await notify();assert.equal(await beth.locator('[data-timeoff-launch]').isVisible(),false);
 put('settings/timeOffTeamAccess',{teams:{BB:true,PR:true,RM:true}});await notify();await beth.locator('[data-timeoff-launch]').waitFor({state:'visible'});
 // Revoking master authorization disables controls and removes the policy listener.
 put('super_admin/role','admin');await notify();
 assert.equal(await master.locator('[data-to-team-access=BB]').isDisabled(),true);
 assert.equal([...subscriptions.get(master).values()].includes('settings/timeOffTeamAccess'),false);
 // Live permission revocation closes the review surface and removes request subscriptions.
 await admin2.locator('[data-to-action="close"]').click();await open(admin2);
 put('admins_list/manager2/calendarAccess',false);await notify();
 assert.equal(await admin2.locator('#to-modal').count(),0);assert.equal(await admin2.locator('[data-timeoff-launch]').isVisible(),false);
 await admin2.waitForFunction(()=>document.querySelector('[data-calendar-launch]').hidden);
 assert.equal([...subscriptions.get(admin2).values()].some(p=>p.startsWith('admin_calendar/requests')),false);
 // A denied new request path must not break existing calendar events or birthdays.
 const blocked=await mount('admin','blocked');await blocked.locator('[data-calendar-launch]').click();
 await blocked.waitForFunction(()=>document.getElementById('ac-status').textContent.includes('Agent requests could not sync'));
 assert.equal(await blocked.locator('.ac-day').count(),42);
 await blocked.locator('[data-action=close]').click();await blocked.locator('[data-timeoff-launch]').click();
 await blocked.waitForFunction(()=>document.getElementById('to-status').textContent.includes('Permission denied'));
 assert.equal(await blocked.locator('#to-retry').isVisible(),true);
 assert.deepEqual(errors,[]);
 console.log('Browser checks passed: BB/PR/RM requests, team switches, live and fresh access checks, concurrent saves, failed saves, master revocation, calendar persistence, approval/decline and replies, reminders, refresh, duplicate prevention, cancellation, offline state, data scoping and mobile layout.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close()});
