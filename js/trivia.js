const TRIVIA_BANK=[
  // PLAYBOOK
  {type:'mcq',category:'Playbook',question:'What is the minimum number of months a business must have been operating to qualify for a transfer?',options:['3 months','6 months','12 months','24 months'],correct:2,explanation:'Businesses must be operating for at least 12 months to qualify.'},
  {type:'mcq',category:'Playbook',question:'What is the minimum annual revenue required for a business to qualify?',options:['$50,000','$100,000','$150,000','$200,000'],correct:3,explanation:'The minimum annual revenue threshold is $200,000.'},
  {type:'truefalse',category:'Playbook',question:'You can proceed with a transfer if the prospect only knows their 2024 revenue and not their 2025 revenue.',options:['True','False'],correct:1,explanation:'You need the actual 2025 number — never accept a prior year estimate. Schedule a callback instead.'},
  {type:'mcq',category:'Playbook',question:'If a prospect says "It should be around the same as last year," what should you do?',options:['Accept it and proceed','Push for the actual 2025 figure','Transfer them anyway','End the call immediately'],correct:1,explanation:'Never accept assumptions. Ask for the actual current year revenue or a monthly estimate to calculate annual.'},
  {type:'truefalse',category:'Playbook',question:'A monthly revenue of $15,000 would qualify a business for a transfer.',options:['True','False'],correct:1,explanation:'$15,000/month x 12 = $180,000/year, which is below the $200,000 annual minimum. They do NOT qualify on revenue.'},
  {type:'mcq',category:'Playbook',question:'What do you multiply a prospect\'s monthly revenue by to estimate their annual revenue?',options:['6','10','12','52'],correct:2,explanation:'Multiply monthly revenue by 12 to get the annual estimate.'},
  {type:'truefalse',category:'Playbook',question:'A business open for only 8 months qualifies for a transfer.',options:['True','False'],correct:1,explanation:'Businesses must be operating for at least 12 months — 8 months does not qualify.'},
  // REBUTTALS
  {type:'mcq',category:'Rebuttals',question:'A prospect says "I\'m not interested." What is the best first response?',options:['End the call immediately','Acknowledge and pivot to the business benefit','Argue about why they should be interested','Ask them to call back later'],correct:1,explanation:'Acknowledge their response and pivot — connect the value to their specific business situation.'},
  {type:'mcq',category:'Rebuttals',question:'A prospect asks "What is the interest rate?" How should you respond?',options:['Give them an exact rate immediately','Explain rates depend on risk profile and redirect to qualifying','Tell them it\'s confidential','Say "I don\'t know"'],correct:1,explanation:'Rates depend on risk and credit profile. Redirect to the specialist and keep qualifying.'},
  {type:'truefalse',category:'Rebuttals',question:'If a prospect says "I\'m already pre-qualified, why do you need more questions?" you should stop asking questions.',options:['True','False'],correct:1,explanation:'Pre-qualified means they meet general criteria. You still need to verify details to match them with the right program.'},
  {type:'mcq',category:'Rebuttals',question:'A prospect asks "Why don\'t you have my information?" What is the best response?',options:['Apologize and end the call','Explain you pull from multiple sources but always verify directly with them','Make up an explanation','Tell them it\'s a system error'],correct:1,explanation:'Explain that you always verify directly to ensure accuracy, then redirect to qualifying questions.'},
  {type:'mcq',category:'Rebuttals',question:'When a prospect says "I found a cheaper option elsewhere," what is the strongest counter?',options:['Agree and end the call','Offer to match the price immediately','Suggest cheaper isn\'t always better and offer a side-by-side comparison','Ignore the comment and keep asking questions'],correct:2,explanation:'Point out hidden costs and offer a comparison. Let the specialist handle the detailed comparison.'},
  {type:'mcq',category:'Rebuttals',question:'A prospect asks "What type of loan is this?" The correct answer is:',options:['SBA / Government-backed loans','Lines of credit and working capital — not government-backed','Mortgage and auto loans','Personal loans only'],correct:1,explanation:'These are lines of credit and working capital. Not government-backed. The specialist will explain everything in detail.'},
  {type:'truefalse',category:'Rebuttals',question:'If a prospect says "I didn\'t apply for a loan," you should immediately end the call.',options:['True','False'],correct:1,explanation:'Explain their info came through a partner network and redirect to qualifying. Use one of the prepared Option A/B/C responses.'},
  {type:'mcq',category:'Rebuttals',question:'What should you always do after handling any rebuttal?',options:['Thank them for the question','Transfer them immediately','Go right back to the qualifying questions','Ask if they have more concerns'],correct:2,explanation:'After handling any rebuttal, immediately redirect back to the qualifying questions to keep the call moving forward.'},
  // PRANK DETECTION
  {type:'mcq',category:'Prank Detection',question:'Which of these is the strongest sign that a caller is pranking?',options:['They ask what the interest rate is','They say "yes" to every question instantly without hesitation','They want to know the company name','They ask about the timeline for funding'],correct:1,explanation:'Real business owners push back, ask questions, or pause to think. Instant "yes" to everything is a major prank red flag.'},
  {type:'truefalse',category:'Prank Detection',question:'If a caller gives "OnlyFans" as their business name, you should proceed with qualifying questions.',options:['True','False'],correct:1,explanation:'OnlyFans is an instant disqualifier. End the call professionally and move on immediately.'},
  {type:'mcq',category:'Prank Detection',question:'What should you do if someone asks you to send or wire funds to Mexico?',options:['Ask for their bank details','Proceed if they meet other criteria','End the call immediately — it\'s a confirmed scam','Transfer to a supervisor for approval'],correct:2,explanation:'Any mention of sending funds to Mexico or international wire transfers is a confirmed scam. End professionally and move on.'},
  {type:'mcq',category:'Prank Detection',question:'A caller answers every qualifying question instantly with perfect answers. What should you think?',options:['This is an ideal prospect — transfer fast','Be suspicious — real owners hesitate and recall actual details','Ask for a supervisor to approve','Continue normally without concern'],correct:1,explanation:'Real business owners live their business — they naturally pause to recall revenue, dates, and details. Instant perfect answers are a red flag.'},
  {type:'truefalse',category:'Prank Detection',question:'Hearing whispering or coached answers in the background is a sign of a legitimate business call.',options:['True','False'],correct:1,explanation:'Whispering or coached answers indicate a group prank. Real business owners call independently.'},
  {type:'mcq',category:'Prank Detection',question:'What is the "Supervisor Test" prank strategy?',options:['Ask the prank caller to call back tomorrow','Tell the caller you\'re putting your supervisor on the line — prank callers will hang up','Transfer the call to a manager immediately','Ask the caller for their supervisor\'s number'],correct:1,explanation:'Say you\'re getting your supervisor, put them on hold, then get your actual supervisor. Prank callers hang up. Real customers stay on.'},
  {type:'mcq',category:'Prank Detection',question:'A caller gives their business name as "My Company LLC" — what is this a sign of?',options:['A legitimate small business','A possible prank — generic placeholder name','A large corporation','A non-profit organization'],correct:1,explanation:'Vague generic names like "My Company" or names that change when repeated are classic prank red flags.'},
  // INDUSTRY RULES
  {type:'mcq',category:'Industry Rules',question:'A caller says they own a tractor. What is the first question you must ask?',options:['How long have you owned the tractor?','Is it a detachable tractor?','How much revenue does the tractor business generate?','How many employees do you have?'],correct:1,explanation:'A detachable tractor is classified as a truck — it falls under the No Trucking rule. A non-detachable farm tractor can qualify.'},
  {type:'truefalse',category:'Industry Rules',question:'A detachable tractor qualifies for a transfer.',options:['True','False'],correct:1,explanation:'A detachable tractor is classified as a truck, which falls under the No Trucking rule. It does NOT qualify.'},
  {type:'mcq',category:'Industry Rules',question:'A logging company operates 9 months out of the year. Do they qualify?',options:['Yes, 9 months is enough','No, logging must operate all 12 months','Yes, if their revenue is high enough','It depends on the state'],correct:1,explanation:'Logging businesses must operate ALL 12 months of the year to qualify. Seasonal operators do not qualify.'},
  {type:'truefalse',category:'Industry Rules',question:'A trucking company automatically qualifies if they meet the revenue and time-in-business requirements.',options:['True','False'],correct:1,explanation:'Trucking businesses NEVER qualify — there are no exceptions to the No Trucking rule, regardless of revenue or time in business.'},
  {type:'mcq',category:'Industry Rules',question:'What is the correct way to handle a trucking business that calls in?',options:['Transfer them if revenue is $200k+','End the call immediately','Proceed if they\'ve been open 2+ years','Ask if they also have a non-trucking side business'],correct:3,explanation:'Trucking is a no-go, but you should ask if they have a separate non-trucking business that might qualify.'},
  // QUALIFYING
  {type:'mcq',category:'Qualifying',question:'In what order should you ask qualifying questions?',options:['Revenue first, then time in business','Time in business first, then revenue','Industry first, then everything else','Credit score first, then revenue'],correct:1,explanation:'Always confirm time in business first, then revenue. If they don\'t meet time requirements, there\'s no need to ask about revenue.'},
  {type:'truefalse',category:'Qualifying',question:'A business with $12,000 monthly revenue qualifies based on revenue requirements.',options:['True','False'],correct:1,explanation:'$12,000/month × 12 = $144,000/year, which is below the $200,000 annual minimum. They do NOT qualify on revenue.'},
  {type:'mcq',category:'Qualifying',question:'A prospect hesitates to give their revenue. What should you do?',options:['End the call immediately','Accept their hesitation and move to transfer','Acknowledge the concern and explain why you need it to find the right program','Skip the question and come back to it'],correct:2,explanation:'Explain that the revenue figure is needed to match them with the right lending program — it\'s for their benefit.'},
  {type:'mcq',category:'Qualifying',question:'What does the "12+ Proof" stat on the dashboard represent?',options:['How many months the business has been open','The number of qualifying transfers a rep needs per week to stay off the blacklist','Revenue above $12,000 per month','Total calls made in a day'],correct:1,explanation:'12+ Proof is the weekly transfer target reps must hit to stay safe and avoid being put on the blacklist.'},
  {type:'truefalse',category:'Qualifying',question:'You can transfer a prospect who only tells you their 2024 annual revenue.',options:['True','False'],correct:1,explanation:'You must have the 2025 actual revenue. If they only have 2024, schedule a callback for when they have the current number.'},
];

function getShuffledQuestions(n=5){
  const shuffled=[...TRIVIA_BANK].sort(()=>Math.random()-0.5);
  const cats={};const picked=[];
  for(const q of shuffled){if(picked.length>=n)break;const c=q.category;if(!cats[c]||cats[c]<2){picked.push(q);cats[c]=(cats[c]||0)+1;}}
  while(picked.length<n&&picked.length<TRIVIA_BANK.length){const q=shuffled.find(q2=>!picked.includes(q2));if(q)picked.push(q);else break;}
  return picked.slice(0,n);
}

async function generateAIQuestions(n=5){
  const knowledge = getDashboardKnowledge();
  const categories = ['Playbook','Rebuttals','Prank Detection','Qualifying','Industry Rules'];
  const shuffledCats = [...categories].sort(()=>Math.random()-0.5);
  const selectedCats = [];
  for(let i=0;i<n;i++) selectedCats.push(shuffledCats[i % shuffledCats.length]);

  const prompt = `You are a quiz master for a business loan call center training platform. Generate exactly ${n} trivia questions for agents based ONLY on the following knowledge base from the dashboard.

---KNOWLEDGE BASE---
${knowledge}
---END KNOWLEDGE BASE---

CRITICAL DEFINITIONS (never get these wrong):
- 12+ Proof on the dashboard = the number of qualifying transfers a rep needs per week to stay safe and NOT be on the blacklist. It is a weekly performance target, NOT a reference to months in business.
- The minimum annual revenue to qualify is $200,000

CRITICAL REVENUE RULE (never get this wrong):
- The minimum annual revenue to qualify is $200,000
- $15,000/month = $180,000/year = DOES NOT QUALIFY (below $200k)
- $17,000/month = $204,000/year = QUALIFIES (above $200k)
- Any monthly figure x 12 that is under $200,000 = DOES NOT QUALIFY
- Never say $15,000/month qualifies — it does not

STRICT RULES:
- Questions must be based strictly on specific facts in the knowledge base above
- NEVER use the same wording, scenario, or concept as a previous round — vary completely
- Use question types: mcq (4 options) or truefalse
- Assign one category per question from this list (in order): ${selectedCats.join(', ')}
- For mcq: exactly 4 options, one correct answer
- For truefalse: options must be exactly ["True","False"]
- Make wrong answers plausible, not obviously wrong
- "correct" = 0-based INDEX of the correct option
- Include a 1-2 sentence explanation

Respond ONLY with a valid JSON array. No markdown, no backticks, no preamble. Example format:
[{"type":"mcq","category":"Playbook","question":"...","options":["A","B","C","D"],"correct":2,"explanation":"..."},{"type":"truefalse","category":"Rebuttals","question":"...","options":["True","False"],"correct":1,"explanation":"..."}]`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{role: "user", content: prompt}]
    })
  });
  if(!response.ok) throw new Error('API error '+response.status);
  const data = await response.json();
  const raw = data.content.map(b=>b.text||'').join('').trim();
  const clean = raw.replace(/```json|```/g,'').trim();
  const questions = JSON.parse(clean);
  if(!Array.isArray(questions)||questions.length===0) throw new Error('Bad questions format');
  return questions.slice(0,n);
}
const TRIVIA_ROUNDS=[{label:'🌅 Morning Warm-Up',start:11,end:14},{label:'⚡ Midday Challenge',start:14,end:17},{label:'🔥 End of Day Blitz',start:17,end:23}];
const MOTIVATIONAL_QUOTES=['💥 Lock in — every answer matters!','🔥 You\'re on fire, don\'t slow down!','🧠 Knowledge = Transfers. Let\'s go!','⚡ Trust your training — crush it!','🎯 Real reps know this cold. Show it!','💪 Champions study AND perform!','🚀 Fast mind, sharp answers — that\'s you!','👑 Top reps train harder than anyone!','🎮 This is your moment — own it!','🌟 One question at a time — stay focused!'];
const LOADING_TIPS=['🔄 Mixing up a fresh set of questions just for you...','💡 Every round is different — no two sets are ever the same!','🧠 Questions pulled from everything in this dashboard','🎯 Covering Playbook, Rebuttals, Prank Detection & more','⚡ Stay sharp — these questions change every single round!'];
let triviaState={questions:[],current:0,score:0,timer:null,timeLeft:20,playerName:'',answers:[],roundKey:'',streak:0,loadingTipInterval:null,countdownInterval:null};

function getCurrentRound(){const h=new Date().getHours();if(h>=17)return TRIVIA_ROUNDS[2];if(h>=14)return TRIVIA_ROUNDS[1];if(h>=11)return TRIVIA_ROUNDS[0];return null;}
function getRoundKey(){const d=new Date(),r=getCurrentRound();return'trivia_'+d.toDateString()+'_'+(r?r.label:'free');}
function getNextRoundTime(){const h=new Date().getHours();let tH;if(h<11)tH=11;else if(h<14)tH=14;else if(h<17)tH=17;else return null;const t=new Date();t.setHours(tH,0,0,0);return t;}

function updateNextRoundCountdown(){
  const next=getNextRoundTime(),el=document.getElementById('trivia-next-countdown'),bar=document.getElementById('trivia-countdown-bar');
  if(!next||!el){if(bar)bar.classList.add('hidden');return;}
  const diff=next-Date.now();
  if(diff<=0){if(bar)bar.classList.add('hidden');return;}
  if(bar)bar.classList.remove('hidden');
  const hrs=Math.floor(diff/3600000),mins=Math.floor((diff%3600000)/60000),secs=Math.floor((diff%60000)/1000);
  el.textContent=hrs>0?hrs+'h '+String(mins).padStart(2,'0')+'m':String(mins).padStart(2,'0')+':'+String(secs).padStart(2,'0');
}

function initTriviaTab(){
  const r=getCurrentRound();
  const badge=document.getElementById('trivia-round-badge');
  const next=document.getElementById('trivia-next-round');
  if(badge)badge.textContent=r?r.label:'⏳ Next Round Soon';
  if(next){const nt=getNextRoundTime();if(!nt&&!r)next.textContent='Rounds at 11am, 2pm & 5pm';else next.textContent='';}
  if(triviaState.countdownInterval)clearInterval(triviaState.countdownInterval);
  updateNextRoundCountdown();
  triviaState.countdownInterval=setInterval(updateNextRoundCountdown,1000);
  renderTriviaLeaderboard();
}

function getDashboardKnowledge(){
  const sections=['playbook-view','rebuttals-view','prank-view'];
  let k='';
  sections.forEach(id=>{const el=document.getElementById(id);if(el)k+=el.innerText+'\n\n';});
  return k.slice(0,8000);
}

async function startTrivia(anon=false){
  const ni=document.getElementById('trivia-name-input');
  triviaState.playerName=anon?'Anonymous':(ni?ni.value.trim()||'Anonymous':'Anonymous');
  triviaState.roundKey=getRoundKey();
  triviaState.streak=0;
  document.getElementById('trivia-name-screen').classList.add('hidden');
  document.getElementById('trivia-loading-screen').classList.remove('hidden');
  document.getElementById('trivia-result-screen').classList.add('hidden');
  document.getElementById('trivia-question-screen').classList.add('hidden');
  // loading tips ticker
  let tipIdx=0;
  const tipEl=document.getElementById('trivia-loading-tips');
  if(tipEl)tipEl.textContent=LOADING_TIPS[0];
  triviaState.loadingTipInterval=setInterval(()=>{
    tipIdx=(tipIdx+1)%LOADING_TIPS.length;
    if(tipEl){tipEl.style.opacity=0;setTimeout(()=>{tipEl.textContent=LOADING_TIPS[tipIdx];tipEl.style.opacity=1;},300);}
  },1800);
  try {
    // Short simulated loading delay for UX
    triviaState.questions=await generateAIQuestions(5).catch(async err=>{
      console.warn('AI generation failed, falling back to bank:',err);
      await new Promise(res=>setTimeout(res,800));
      return getShuffledQuestions(5);
    });
    triviaState.current=0;triviaState.score=0;triviaState.answers=[];
    clearInterval(triviaState.loadingTipInterval);
    document.getElementById('trivia-loading-screen').classList.add('hidden');
    document.getElementById('trivia-question-screen').classList.remove('hidden');
    document.getElementById('trivia-explanation').classList.add('hidden');
    showTriviaQuestion();
  }catch(e){
    clearInterval(triviaState.loadingTipInterval);
    document.getElementById('trivia-loading-screen').classList.add('hidden');
    document.getElementById('trivia-name-screen').classList.remove('hidden');
    console.error('Trivia error:',e);
    alert('Could not load questions — please try again!');
  }
}

function showTriviaQuestion(){
  const q=triviaState.questions[triviaState.current];
  const total=triviaState.questions.length;
  const idx=triviaState.current;
  document.getElementById('trivia-progress').style.width=((idx/total)*100)+'%';
  document.getElementById('trivia-q-counter').textContent='Q'+(idx+1)+' of '+total;
  const sLabel=document.getElementById('trivia-streak-label');
  if(triviaState.streak>=2)sLabel.textContent='🔥 '+triviaState.streak+' Streak!';else sLabel.textContent='';
  // motivational quote
  const motiv=document.getElementById('trivia-motiv-bar');
  if(motiv){motiv.style.opacity=0;setTimeout(()=>{motiv.textContent=MOTIVATIONAL_QUOTES[idx%MOTIVATIONAL_QUOTES.length];motiv.style.opacity=1;},200);}
  // category pill
  const catColors={'Playbook':'rgba(57,255,20,0.15)','Rebuttals':'rgba(0,245,255,0.15)','Prank Detection':'rgba(255,45,120,0.15)','Qualifying':'rgba(255,229,0,0.15)','Industry Rules':'rgba(255,107,0,0.15)'};
  const catTC={'Playbook':'#39FF14','Rebuttals':'#00F5FF','Prank Detection':'#FF2D78','Qualifying':'#FFE500','Industry Rules':'#FF6B00'};
  const bg=catColors[q.category]||'rgba(255,255,255,0.08)';
  const tc=catTC[q.category]||'#94a3b8';
  const typeLabel=q.type==='truefalse'?'True / False':q.type==='scenario'?'🎭 Scenario':'🎯 Multiple Choice';
  document.getElementById('trivia-category-pill').innerHTML=
    '<span style="background:'+bg+';border:1px solid '+tc+'44;border-radius:20px;padding:4px 12px;font-size:10px;font-weight:900;text-transform:uppercase;color:'+tc+';letter-spacing:0.1em;">'+escapeHtml(q.category)+'</span>'+
    '<span style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:4px 10px;font-size:10px;font-weight:900;text-transform:uppercase;color:#475569;letter-spacing:0.08em;">'+typeLabel+'</span>';
  document.getElementById('trivia-question-text').textContent=q.question;
  document.getElementById('trivia-explanation').classList.add('hidden');
  // options
  const optEl=document.getElementById('trivia-options');
  if(q.type==='truefalse'){
    optEl.style.flexDirection='row';
    optEl.innerHTML=
      '<button class="tf-option tf-true" onclick="answerTrivia(0)" style="flex:1;padding:18px 14px;border-radius:16px;font-family:\'Boogaloo\',cursive;font-size:18px;text-align:center;cursor:pointer;background:rgba(57,255,20,0.08);border:2px solid rgba(57,255,20,0.3);color:#39FF14;transition:all 0.15s;" onmouseover="if(!this.disabled)this.style.background=\'rgba(57,255,20,0.2)\'" onmouseout="if(!this.disabled)this.style.background=\'rgba(57,255,20,0.08)\'">✅ True</button>'+
      '<button class="tf-option tf-false" onclick="answerTrivia(1)" style="flex:1;padding:18px 14px;border-radius:16px;font-family:\'Boogaloo\',cursive;font-size:18px;text-align:center;cursor:pointer;background:rgba(255,45,120,0.08);border:2px solid rgba(255,45,120,0.3);color:#FF2D78;transition:all 0.15s;" onmouseover="if(!this.disabled)this.style.background=\'rgba(255,45,120,0.2)\'" onmouseout="if(!this.disabled)this.style.background=\'rgba(255,45,120,0.08)\'">❌ False</button>';
    optEl.style.display='flex';
    optEl.style.gap='12px';
  }else{
    optEl.style.flexDirection='column';
    optEl.style.display='flex';
    const letters=['A','B','C','D'];
    optEl.innerHTML=q.options.map((opt,i)=>'<button class="opt-btn" onclick="answerTrivia('+i+')" style="width:100%;background:rgba(255,255,255,0.04);border:2px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px 18px;text-align:left;color:#e2e8f0;cursor:pointer;display:flex;align-items:center;gap:12px;font-family:\'Boogaloo\',cursive;font-size:16px;transition:all 0.15s;" onmouseover="if(!this.disabled){this.style.background=\'rgba(255,229,0,0.1)\';this.style.borderColor=\'rgba(255,229,0,0.5)\';this.style.color=\'#FFE500\';this.querySelector(\'.ol\').style.borderColor=\'rgba(255,229,0,0.5)\';}" onmouseout="if(!this.disabled){this.style.background=\'rgba(255,255,255,0.04)\';this.style.borderColor=\'rgba(255,255,255,0.1)\';this.style.color=\'#e2e8f0\';this.querySelector(\'.ol\').style.borderColor=\'rgba(255,255,255,0.15)\';}"><span class="ol" style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;flex-shrink:0;border:2px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);">'+letters[i]+'</span><span>'+escapeHtml(opt)+'</span></button>').join('');
  }
  // timer
  triviaState.timeLeft=20;
  updateCountdownRing(20,20);
  clearInterval(triviaState.timer);
  triviaState.timer=setInterval(()=>{
    triviaState.timeLeft--;
    updateCountdownRing(triviaState.timeLeft,20);
    if(triviaState.timeLeft<=0){clearInterval(triviaState.timer);answerTrivia(-1);}
  },1000);
}

function updateCountdownRing(left,total){
  const circ=138.2,pct=left/total,offset=circ*(1-pct);
  const ring=document.getElementById('trivia-ring-fill'),txt=document.getElementById('trivia-timer-text');
  if(!ring||!txt)return;
  ring.setAttribute('stroke-dashoffset',offset);
  const color=left>10?'var(--neon-yellow)':left>5?'var(--neon-orange)':'var(--neon-pink)';
  ring.setAttribute('stroke',color);
  txt.textContent=left;txt.style.color=color;
}

function answerTrivia(chosen){
  clearInterval(triviaState.timer);
  const q=triviaState.questions[triviaState.current];
  const correct=q.correct;
  const isRight=chosen===correct;
  if(isRight){triviaState.score++;triviaState.streak++;}else{triviaState.streak=0;}
  triviaState.answers.push({question:q.question,chosen,correct,isRight,explanation:q.explanation,type:q.type});
  // highlight
  const optEl=document.getElementById('trivia-options');
  const btns=optEl.querySelectorAll('button');
  btns.forEach((btn,i)=>{
    btn.disabled=true;
    if(i===correct){
      btn.style.background='rgba(57,255,20,0.2)';
      btn.style.borderColor='#39FF14';
      btn.style.color='#39FF14';
    }else if(i===chosen&&!isRight){
      btn.style.background='rgba(255,45,120,0.2)';
      btn.style.borderColor='#FF2D78';
      btn.style.color='#FF2D78';
    }
  });
  if(q.explanation){
    document.getElementById('trivia-explanation-text').textContent=q.explanation;
    document.getElementById('trivia-explanation').classList.remove('hidden');
  }
  if(isRight)spawnConfetti();
  setTimeout(()=>{
    triviaState.current++;
    document.getElementById('trivia-explanation').classList.add('hidden');
    if(triviaState.current>=triviaState.questions.length)finishTrivia();
    else showTriviaQuestion();
  },isRight?900:1800);
}

function spawnConfetti(){
  const card=document.getElementById('trivia-question-card');
  if(!card)return;
  const colors=['#FFE500','#FF6B00','#FF2D78','#00F5FF','#39FF14'];
  for(let i=0;i<10;i++){
    const dot=document.createElement('div');
    dot.className='confetti-dot';
    dot.style.cssText='left:'+Math.random()*100+'%;top:-10px;background:'+colors[Math.floor(Math.random()*colors.length)]+';animation-delay:'+Math.random()*0.4+'s;animation-duration:'+(0.8+Math.random()*0.6)+'s;';
    card.appendChild(dot);
    setTimeout(()=>dot.remove(),1500);
  }
}

function finishTrivia(){
  const score=triviaState.score,total=triviaState.questions.length,pct=Math.round(score/total*100);
  document.getElementById('trivia-question-screen').classList.add('hidden');
  document.getElementById('trivia-result-screen').classList.remove('hidden');
  document.getElementById('trivia-progress').style.width='100%';
  const emoji=pct===100?'🏆':pct>=80?'🔥':pct>=60?'💪':pct>=40?'📚':'😅';
  const msg=pct===100?'Perfect score! You know this cold!':pct>=80?'Outstanding — nearly flawless!':pct>=60?'Solid round. Keep sharpening!':pct>=40?'Good effort — review the playbook.':'Study those rebuttals & try again!';
  document.getElementById('trivia-result-emoji').textContent=emoji;
  document.getElementById('trivia-result-name').textContent=triviaState.playerName==='Anonymous'?'Anonymous Player':triviaState.playerName;
  document.getElementById('trivia-result-score').textContent=score+'/'+total;
  document.getElementById('trivia-result-msg').textContent=msg;
  const bd=document.getElementById('trivia-result-breakdown');
  bd.innerHTML=triviaState.answers.map((a,i)=>{
    const q=triviaState.questions[i];
    const chosenText=a.chosen>=0?(q.options[a.chosen]||'Time Up!'):'⏱ Time Up!';
    const correctText=q.options[a.correct];
    return'<div style="background:'+(a.isRight?'rgba(57,255,20,0.06)':'rgba(255,45,120,0.06)')+';border:1px solid '+(a.isRight?'rgba(57,255,20,0.2)':'rgba(255,45,120,0.2)')+';border-radius:12px;padding:12px 14px;"><div style="display:flex;align-items:flex-start;gap:8px;"><span style="font-size:16px;flex-shrink:0;">'+(a.isRight?'✅':'❌')+'</span><div><div style="font-family:\'Boogaloo\',cursive;font-size:14px;color:white;line-height:1.4;margin-bottom:4px;">'+escapeHtml(a.question)+'</div>'+(!a.isRight?'<div style="font-size:11px;color:#39FF14;margin-bottom:2px;">✔ '+escapeHtml(correctText)+'</div>':'')+(!a.isRight&&a.chosen>=0?'<div style="font-size:11px;color:#FF2D78;">✘ You said: '+escapeHtml(chosenText)+'</div>':'')+(a.explanation?'<div style="font-size:11px;color:#475569;margin-top:4px;font-style:italic;">'+escapeHtml(a.explanation)+'</div>':'')+'</div></div></div>';
  }).join('');
  saveTriviaScore(triviaState.playerName,score,total);
  renderTriviaLeaderboard();
}

function saveTriviaScore(name,score,total){
  const key=triviaState.roundKey;
  const entry={name,score,total,time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};
  // Save to Firebase so everyone can see it
  if(window._fbSaveTriviaScore){
    window._fbSaveTriviaScore(key, entry).catch(()=>{});
  }
  // Also save locally as fallback
  let board=[];
  try{board=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){}
  board.push(entry);board.sort((a,b)=>b.score-a.score);board=board.slice(0,50);
  try{localStorage.setItem(key,JSON.stringify(board));}catch(e){}
}

function renderTriviaLeaderboard(){
  const key=getRoundKey(),r=getCurrentRound();
  const lbRound=document.getElementById('trivia-lb-round');
  if(lbRound)lbRound.textContent=r?r.label:'Today';
  const lb=document.getElementById('trivia-leaderboard');
  if(!lb)return;

  // Merge Firebase scores + local fallback
  let board=[];
  // From Firebase
  const fbData=window._triviaFirebaseScores;
  if(fbData&&fbData[key]){
    const entries=Object.values(fbData[key]);
    board=[...entries];
  }
  // Fallback: local storage
  if(!board.length){
    try{board=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){}
  }

  board.sort((a,b)=>b.score-a.score||a.time.localeCompare(b.time));

  const countEl=document.getElementById('trivia-lb-count');
  if(countEl)countEl.textContent=board.length?board.length+' player'+(board.length!==1?'s':''):'';

  if(!board.length){lb.innerHTML='<div style="text-align:center;font-family:\'Boogaloo\',cursive;font-size:14px;color:#334155;padding:18px 0;">No scores yet this round — be the first! 🎯</div>';return;}

  const medals=['🥇','🥈','🥉'];
  lb.innerHTML=board.map((e,i)=>{
    const isPerfect=e.score===e.total;
    const pct=Math.round(e.score/e.total*100);
    const barColor=pct===100?'#FFE500':pct>=80?'#39FF14':pct>=60?'#3b82f6':'#ef4444';
    return `<div class="trivia-lb-row" style="flex-wrap:wrap;gap:6px;padding:12px 8px;border-radius:12px;margin-bottom:4px;background:${isPerfect?'rgba(255,229,0,0.05)':'rgba(255,255,255,0.02)'};border:1px solid ${isPerfect?'rgba(255,229,0,0.15)':'rgba(255,255,255,0.04)'};">
      <span style="font-size:18px;width:28px;text-align:center;flex-shrink:0;">${medals[i]||'<span style="font-family:Orbitron,sans-serif;font-size:11px;font-weight:900;color:#475569;">#'+(i+1)+'</span>'}</span>
      <div style="flex:1;min-width:100px;">
        <div style="font-family:'Boogaloo',cursive;font-size:15px;color:white;">${escapeHtml(e.name)}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px;">
          <div style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,0.06);">
            <div style="height:100%;border-radius:2px;background:${barColor};width:${pct}%;transition:width 0.5s;"></div>
          </div>
          <span style="font-size:10px;font-weight:900;color:#475569;">${pct}%</span>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:'Lilita One',cursive;font-size:20px;color:${isPerfect?'var(--neon-yellow)':'#64748b'};">${e.score}/${e.total}</div>
        <div style="font-size:9px;font-weight:700;color:#334155;text-transform:uppercase;">${e.time||''}</div>
      </div>
    </div>`;
  }).join('');
}

function resetTrivia(){
  clearInterval(triviaState.timer);
  document.getElementById('trivia-result-screen').classList.add('hidden');
  document.getElementById('trivia-question-screen').classList.add('hidden');
  document.getElementById('trivia-name-screen').classList.remove('hidden');
  document.getElementById('trivia-progress').style.width='0%';
}

// ============================================================
// LEAD ALERT SYSTEM
// ============================================================
