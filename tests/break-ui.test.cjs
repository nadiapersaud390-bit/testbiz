// Isolated browser integration test. No production Firebase connections.
const {chromium}=require('playwright');
const fs=require('fs');
const assert=require('node:assert/strict');
const root=require('path').resolve(__dirname,'..')+'/';
const core=fs.readFileSync(root+'js/break-core.js','utf8');
const code=fs.readFileSync(root+'js/breaks.js','utf8');
const css=fs.readFileSync(root+'css/breaks.css','utf8');
const start=Date.parse('2026-09-21T10:00:00-04:00');
const roster=[{userId:'1234',fullName:'Alice Test',team:'BB',status:'Agent',breakSchedule:{morning:{time:'10:00',minutes:10},afternoon:{time:'14:00',minutes:15}}}];
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext();
 await context.route('http://break-test/**',route=>route.fulfill({contentType:'text/html',body:`<html><head><style>body{background:#020617;font-family:Arial;margin:24px}${css}</style></head><body><div id="break-alerts"></div><section id="break-panel" hidden></section><div id="admin-break-monitor-host"></div></body></html>`}));
 const errors=[];
 async function mount(role,state={},mobile=false){
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  if(mobile)await page.setViewportSize({width:390,height:844});
  await page.goto('http://break-test/');
  await page.evaluate(({role,state,roster,start})=>{
   sessionStorage.setItem('bizUserRole',role);sessionStorage.setItem('currentAgentProfile',JSON.stringify({ytelId:'1234',name:'Alice Test'}));
   window.testNow=start;Date.now=()=>window.testNow;window.testState=state;window.testSpeech=[];
   window.SpeechSynthesisUtterance=function(text){this.text=text};
   Object.defineProperty(window,'speechSynthesis',{value:{speak(u){window.testSpeech.push(u.text);setTimeout(()=>u.onend?.(),0)}}});
   const listeners={};window.rtdbRef=x=>x;
   window.rtdbOnValue=(path,cb)=>{listeners[path]=cb;let value=path==='.info/connected'?true:path==='.info/serverTimeOffset'?0:path==='biz_master_roster'?roster:path==='biz_agent_breaks'?window.testState:window.testState['1234']||null;cb({val:()=>value});};
   window.testPublish=state=>{window.testState=state;for(const path of ['biz_agent_breaks','biz_agent_breaks/1234'])listeners[path]?.({val:()=>path==='biz_agent_breaks'?state:state['1234']||null});};
   window.testOffline=()=>listeners['.info/connected']({val:()=>false});
   window.rtdbRunTransaction=async(path,fn)=>{const result=fn(window.testState['1234']||null);if(!result)return{committed:false};const resolved=JSON.parse(JSON.stringify(result).replaceAll('{".sv":"timestamp"}',String(window.testNow)));window.testPublish({'1234':resolved});return{committed:true};};
  },{role,state,roster,start});
  await page.addScriptTag({content:core});await page.addScriptTag({content:code});
  await page.waitForFunction(()=>document.querySelector('.break-online'));
  return page;
 }
 const agent=await mount('agent',{},true);
 assert.equal(await agent.locator('[data-start="morning"]').isEnabled(),true);
 assert.equal(await agent.locator('[data-start="afternoon"]').isDisabled(),true);
 await agent.locator('[data-start="morning"]').click();
 await agent.waitForSelector('[data-return]');
 assert.match(await agent.locator('.break-timer').innerText(),/10:00 left/);
 const state=await agent.evaluate(()=>window.testState);
 const recovered=await mount('agent',state);
 assert.equal(await recovered.locator('[data-return]').count(),1);
 const admin1=await mount('admin',state);const admin2=await mount('admin',state);
 for(const page of [admin1,admin2])await page.locator('[data-voice]').click();
 for(const page of [agent,recovered,admin1,admin2])await page.evaluate(t=>{window.testNow=t;window.dispatchEvent(new Event('focus'));},start+600000);
 for(const page of [admin1,admin2]){
  assert.match(await page.locator('#break-alerts').innerText(),/Alice Test: break is up/);
  await page.waitForFunction(()=>window.testSpeech.some(x=>x.includes('Alice Test')));
  assert.equal(await page.evaluate(()=>window.testSpeech.filter(x=>x.includes('Alice Test')).length),1);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  assert.equal(await page.evaluate(()=>window.testSpeech.filter(x=>x.includes('Alice Test')).length),1);
 }
 await agent.locator('[data-return]').click();
 const finished=await agent.evaluate(()=>window.testState);
 assert.equal(await agent.locator('[data-start="morning"]').isDisabled(),true);
 for(const page of [admin1,admin2]){await page.evaluate(s=>window.testPublish(s),finished);assert.equal(await page.locator('.break-alert').count(),0);assert.match(await page.locator('summary').innerText(),/1/);}
 await recovered.evaluate(()=>window.testOffline());
 assert.equal(await recovered.locator('[data-return]').isDisabled(),true);
 assert.equal(await agent.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log('Browser checks passed: agent start/return, schedule gating, refresh restoration, two-admin alerts and voice, no repeated speech, completed slot lock, offline controls, mobile width.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
