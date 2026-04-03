// ===== BROADCAST SYSTEM =====
const BC_ADMIN_PASSWORD = 'bizadmin2025'; // 🔑 Change this to your secret password
let bcAdminUnlocked = false;
let bcDismissedTs = 0;
let titleTapCount = 0;
let titleTapTimer = null;

function handleTitleTap(){
  titleTapCount++;
  clearTimeout(titleTapTimer);
  titleTapTimer = setTimeout(()=>{ titleTapCount=0; }, 800);
  if(titleTapCount >= 5){
    titleTapCount = 0;
    clearTimeout(titleTapTimer);
    // Unlock admin silently — no password needed
    if(!bcAdminUnlocked){
      bcAdminUnlocked = true;
      const floatBtn = document.getElementById('bc-float-btn');
      floatBtn.classList.add('unlocked');
      floatBtn.style.animation = 'bcBtnAppear 0.4s cubic-bezier(0.34,1.56,0.64,1) both';
      // Add preview button if not already there
      const panel = document.getElementById('bc-panel');
      if(!document.getElementById('bc-tp-preview-btn')){
        const btn = document.createElement('button');
        btn.id='bc-tp-preview-btn';
        btn.className='bc-clear-btn';
        btn.style.cssText='margin-top:6px;color:#FFD700;border-color:rgba(255,215,0,0.25);';
        btn.innerHTML='👑 Preview Top Performers';
        btn.onclick=()=>showTopPerformerPopup(true);
        panel.appendChild(btn);
      }
    }
    toggleBcPanel();
  }
}

function checkBcPassword(){
  const val = document.getElementById('bc-pw-input').value;
  const errEl = document.getElementById('bc-pw-error');
  if(val === BC_ADMIN_PASSWORD){
    bcAdminUnlocked = true;
    document.getElementById('bc-login-modal').classList.add('hidden');
    document.getElementById('bc-pw-input').value = '';
    errEl.textContent = '';
    const floatBtn = document.getElementById('bc-float-btn');
    floatBtn.classList.add('unlocked');
    floatBtn.style.animation = 'bcBtnAppear 0.4s cubic-bezier(0.34,1.56,0.64,1) both';
    const panel = document.getElementById('bc-panel');
    panel.classList.add('show');
    floatBtn.textContent = '✕';
    setTimeout(()=>document.getElementById('bc-input').focus(),100);
    if(!document.getElementById('bc-tp-preview-btn')){
      const btn = document.createElement('button');
      btn.id='bc-tp-preview-btn';
      btn.className='bc-clear-btn';
      btn.style.cssText='margin-top:6px;color:#FFD700;border-color:rgba(255,215,0,0.25);';
      btn.innerHTML='👑 Preview Top Performers';
      btn.onclick=()=>showTopPerformerPopup(true);
      panel.appendChild(btn);
    }
  } else {
    errEl.textContent = 'Incorrect password.';
    const inp = document.getElementById('bc-pw-input');
    inp.classList.add('error');
    setTimeout(()=>inp.classList.remove('error'), 500);
    setTimeout(()=>{ errEl.textContent=''; }, 2000);
  }
}

function toggleBcPanel(){
  const panel = document.getElementById('bc-panel');
  const floatBtn = document.getElementById('bc-float-btn');
  if(panel.classList.contains('show')){
    panel.classList.remove('show');
    floatBtn.textContent = '📣';
    floatBtn.style.transform = '';
  } else {
    panel.classList.add('show');
    floatBtn.textContent = '✕';
    setTimeout(()=>document.getElementById('bc-input').focus(),100);
  }
}

async function sendBroadcast(){
  const msg = document.getElementById('bc-input').value.trim();
  const statusEl = document.getElementById('bc-status');
  if(!msg){ statusEl.textContent='Enter a message first!'; statusEl.className='bc-status err'; return; }
  if(!window._fbSendBroadcast){
    statusEl.textContent='Firebase not configured yet!';
    statusEl.className='bc-status err';
    // Fallback: show locally for testing
    showBroadcastBar(msg);
    return;
  }
  try {
    statusEl.textContent='Sending...'; statusEl.className='bc-status';
    await window._fbSendBroadcast(msg);
    statusEl.textContent='✓ Sent to everyone!'; statusEl.className='bc-status ok';
    setTimeout(()=>{ statusEl.textContent=''; statusEl.className='bc-status'; }, 3000);
  } catch(e){
    statusEl.textContent='Error: '+e.message; statusEl.className='bc-status err';
  }
}

async function clearBroadcast(){
  const statusEl = document.getElementById('bc-status');
  if(!window._fbClearBroadcast){
    hideBroadcastBar();
    return;
  }
  try {
    await window._fbClearBroadcast();
    statusEl.textContent='✓ Message cleared!'; statusEl.className='bc-status ok';
    setTimeout(()=>{ statusEl.textContent=''; statusEl.className='bc-status'; }, 2000);
  } catch(e){
    statusEl.textContent='Error: '+e.message; statusEl.className='bc-status err';
  }
}

function showBroadcastBar(msg){
  const bar = document.getElementById('broadcast-bar');
  document.getElementById('bc-message-text').textContent = msg;
  bar.classList.add('show');
  document.body.style.paddingTop = (parseInt(getComputedStyle(document.body).paddingTop)||16) + 'px';
  startTabBlink('📢 New Message!');
}

function hideBroadcastBar(){
  const bar = document.getElementById('broadcast-bar');
  bar.classList.remove('show');
  stopTabBlink();
}

function dismissBroadcast(){
  hideBroadcastBar();
  bcDismissedTs = Date.now();
}

// ===== TAB BLINK SYSTEM =====
let _tabBlinkInterval = null;
const _originalTitle = document.title;

function startTabBlink(alertTitle, stopOnFocus = true) {
  stopTabBlink();
  let toggle = true;
  _tabBlinkInterval = setInterval(() => {
    document.title = toggle ? alertTitle : _originalTitle;
    toggle = !toggle;
  }, 900);
  // Only stop on focus for broadcast/trivia — NOT for lead alerts
  if (stopOnFocus) {
    window.addEventListener('focus', stopTabBlink, { once: true });
  }
}

function stopTabBlink() {
  if (_tabBlinkInterval) { clearInterval(_tabBlinkInterval); _tabBlinkInterval = null; }
  document.title = _originalTitle;
}

