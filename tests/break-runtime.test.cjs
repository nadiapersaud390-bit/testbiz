// Exercise realtime subscriptions and audio/transaction flows without a network or browser.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const C = require('../js/break-core.js');
const source = fs.readFileSync(path.join(__dirname,'../js/breaks.js'),'utf8');
const start = Date.parse('2026-09-21T10:00:00-04:00');
const roster = [{userId:'1234',fullName:'Alice',team:'BB',status:'Agent',breakSchedule:{morning:{time:'10:00',minutes:10},afternoon:{time:'14:00',minutes:10}}}];
function mount(role, initial={}) {
  const handlers={}, intervals=[], listeners={}, spoken=[], notifications=[];
  let state=initial, time=start;
  const node=()=>({innerHTML:'',dataset:{},addEventListener(type,cb){this[type]=cb},querySelector(){return null},querySelectorAll(){return []}});
  const panel=node(),alerts=node(),message=node(),host=node();
  host.appendChild=el=>{el.parentElement=host};
  let hostLoaded=false;
  function Notification(title, options) { this.title=title; this.options=options; this.closed=false; this.close=()=>{this.closed=true}; notifications.push(this); }
  Notification.permission='default'; Notification.requestPermission=async()=>{Notification.permission='granted';return 'granted'};
  const window={BreakCore:C,Notification,addEventListener(t,cb){handlers[t]=cb},rtdbRef:x=>x,
    rtdbOnValue(p,cb){listeners[p]=cb;cb({val:()=>p==='.info/connected'?true:p==='.info/serverTimeOffset'?0:p==='biz_master_roster'?roster:p==='biz_agent_breaks'?state:state['1234']||null});},
    speechSynthesis:{speak(u){spoken.push(u.text);u.onend?.();}}};
  function publish(next){state=next;for(const p of ['biz_agent_breaks','biz_agent_breaks/1234'])listeners[p]?.({val:()=>p==='biz_agent_breaks'?state:state['1234']||null});}
  window.rtdbRunTransaction=async(p,fn,options)=>{assert.equal(p,'biz_agent_breaks/1234');assert.equal(options.applyLocally,false);const next=fn(state['1234']||null);if(!next)return{committed:false};publish({'1234':JSON.parse(JSON.stringify(next).replaceAll('{".sv":"timestamp"}',String(time)))});return{committed:true};};
  class Clock extends Date {static now(){return time}}
  vm.runInNewContext(source,{window,sessionStorage:{getItem:k=>k==='bizUserRole'?role:JSON.stringify({ytelId:'1234',name:'Alice'})},document:{hidden:true,visibilityState:"hidden",getElementById:id=>id==='break-panel'?panel:id==='break-alerts'?alerts:id==='admin-break-monitor-host'?(hostLoaded?host:null):message,addEventListener(){}},Date:Clock,SpeechSynthesisUtterance:function(text){this.text=text},setInterval(fn,ms){intervals.push({fn,ms});return intervals.length},clearInterval(){},setTimeout(){return 1},clearTimeout(){},console});
  intervals.find(x=>x.ms===250).fn();
  const click=async attrs=>{const button={dataset:attrs,hasAttribute:k=>(k==='data-voice'&&attrs.voice)||(k==='data-notifications'&&attrs.notifications)};await panel.click({target:{closest:()=>button}});};
  return{panel,alerts,spoken,notifications,publish,click,mountAdmin(){hostLoaded=true;window.mountAdminBreakMonitor();assert.equal(panel.parentElement,host)},state:()=>state,setTime(t){time=t;handlers.focus()},offline(){listeners['.info/connected']({val:()=>false})}};
}
(async()=>{
 const agent=mount('agent');
 assert.match(agent.panel.innerHTML,/Morning break/);
 await agent.click({start:'morning'});
 const running=agent.state();assert.equal(running['1234'].active.minutes,10);
 const recovered=mount('agent',running);assert.match(recovered.panel.innerHTML,/I’m back/);
 const first=mount('admin',running),second=mount('admin',running);
 for(const admin of [first,second]){assert.equal(admin.panel.hidden,true);admin.mountAdmin();assert.equal(admin.panel.hidden,false);await admin.click({voice:true});await admin.click({notifications:true});admin.setTime(start+600000);assert.match(admin.alerts.innerHTML,/Alice: break is up/);assert.ok(admin.spoken.includes('Alice, your break time is up. Time to log in back.'));admin.setTime(start+610000);assert.equal(admin.spoken.filter(x=>x.startsWith('Alice')).length,1);assert.equal(admin.notifications.length,1);assert.equal(admin.notifications[0].title,'Alice: break time is up');assert.equal(admin.notifications[0].options.body,'Time to log in back.');}
 agent.setTime(start+660000);await agent.click({return:running['1234'].active.id});
 assert.equal(agent.state()['1234'].active,null);
 for(const admin of [first,second]){admin.publish(agent.state());assert.equal(admin.alerts.innerHTML,'');assert.equal(admin.notifications[0].closed,true);assert.match(admin.panel.innerHTML,/Today’s returns \(1\)/);assert.match(admin.panel.innerHTML,/01:00/);}
 await agent.click({start:'morning'});assert.equal(agent.state()['1234'].active,null);
 const off=mount('agent');off.offline();await off.click({start:'morning'});assert.equal(off.state()['1234'],undefined);
 console.log('Runtime checks passed: realtime listeners, start/return transactions, refresh recovery, two-admin hidden-page visual/voice/desktop expiry, speech deduplication, return history and offline gating.');
})().catch(e=>{console.error(e);process.exit(1)});
