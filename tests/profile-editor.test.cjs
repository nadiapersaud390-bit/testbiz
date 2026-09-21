const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const elements = new Map();
function el(id) {
 let value = '';
 const element = {id, removeAttribute(){}, style:{}, classList:{add(){},remove(){}},innerHTML:'',checked:false,
   get value(){return value},set value(v){value=String(v)},
   querySelector(selector){return elements.get(selector.slice(1)) || null},
   insertAdjacentHTML(position,html){for(const match of html.matchAll(/id="([^"]+)"/g))if(!elements.has(match[1]))el(match[1]);},
   reset(){for(const e of elements.values())e.value=''}
 };
 elements.set(id,element);return element;
}
for(const id of ['ap-modal-overlay','ap-form','ap-modal-title','ap-form-mode','ap-submit-status','ap-delete-btn','ap-userid','ap-save-btn','ap-form-id','ap-name','ap-team','ap-ytel-name','ap-shift','ap-status','ap-lunch','ap-break','ap-hidden-toggle'])el(id);
const warnings=[];const saved=[];
const context={window:{},document:{getElementById:id=>elements.get(id)||null,addEventListener(){},body:{style:{}}},alert:m=>warnings.push(m),setTimeout(){},console};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/agentprofiles.js'),'utf8'),context);
context.window.apPrepareModalForViewport=()=>{};
context.window.saveAgentProfileToRTDB=async data=>{saved.push(data);return{success:true}};
vm.runInContext("allAgentProfiles = [{userId:1085, fullName:'Leah Alena Smith', team:'PR', breakSchedule:{morning:{time:'10:30',minutes:10},afternoon:{time:'15:00',minutes:15}}}];",context);
(async()=>{
 await context.window.apOpenModal('edit','1085');
 assert.equal(elements.get('ap-modal-overlay').style.display,'flex');
 assert.equal(elements.get('ap-name').value,'Leah Alena Smith');
 assert.equal(elements.get('ap-break-morning').value,'10:30');
 assert.equal(elements.get('ap-break-afternoon-minutes').value,'15');
 assert.equal(warnings.length,0);
 await context.window.apHandleSubmit({preventDefault(){}});
 assert.equal(saved.length,1);
 assert.equal(saved[0].userId,'1085');
 assert.equal(saved[0].breakSchedule.afternoon.minutes,15);
 context.window.apCloseModal();assert.equal(elements.get('ap-modal-overlay').style.display,'none');
 elements.delete('ap-modal-overlay');
 context.window.ensureAgentProfileModal=async()=>{el('ap-modal-overlay');return true};
 await context.window.apOpenModal('edit','1085');
 assert.equal(elements.get('ap-modal-overlay').style.display,'flex');
 assert.equal(warnings.length,0);
 console.log('Profile checks passed: numeric roster ID, cached form upgrade, populated schedules, successful save, close and lazy modal recovery.');
})().catch(e=>{console.error(e);process.exit(1)});
