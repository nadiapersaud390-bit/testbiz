function timeAgo(date){const m=Math.floor((Date.now()-date.getTime())/60000);if(m<1)return'Just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago';}
function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function getFormattedDate(d = new Date()) {
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    const weekday = { weekday: 'short' };
    return d.toLocaleDateString('en-US', options) + ' (' + d.toLocaleDateString('en-US', weekday) + ')';
}

function getGuyanaDayName(d = new Date()) {
    const options = { weekday: 'short', timeZone: 'America/Guyana' };
    return d.toLocaleDateString('en-US', options).toUpperCase(); // "MON", "TUE" etc.
}

function isSameWeek(d1, d2) {
    const getStartOfWeek = (d) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday start
        return new Date(date.setDate(diff)).setHours(0,0,0,0);
    };
    return getStartOfWeek(d1) === getStartOfWeek(d2);
}

// ============================================================
// CLOCK UPDATE
// ============================================================
function updateClocks(){
  const now=new Date();
  const guyanaTime=new Date(now.toLocaleString('en-US',{timeZone:'America/Guyana'}));
  const californiaTime=new Date(now.toLocaleString('en-US',{timeZone:'America/Los_Angeles'}));
  const fmt=d=>{let h=d.getHours(),m=d.getMinutes(),s=d.getSeconds(),ampm=h>=12?'PM':'AM';h=h%12||12;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+' '+ampm;};
  const gEl=document.getElementById('clock-guyana'),cEl=document.getElementById('clock-california');
  if(gEl)gEl.textContent=fmt(guyanaTime);
  if(cEl)cEl.textContent=fmt(californiaTime);
}
updateClocks();
setInterval(updateClocks,1000);

// ============================================================
// TAB BLINK UTILITY
// ============================================================
let tabBlinkInterval = null;
let originalTitle = document.title || 'Biz Level Up Dashboard';

function startTabBlink(msg) {
  if (tabBlinkInterval) clearInterval(tabBlinkInterval);
  originalTitle = document.title;
  let showAlt = false;
  tabBlinkInterval = setInterval(() => {
    document.title = showAlt ? msg : originalTitle;
    showAlt = !showAlt;
  }, 1000);
}

function stopTabBlink() {
  if (tabBlinkInterval) {
    clearInterval(tabBlinkInterval);
    tabBlinkInterval = null;
  }
  if (originalTitle) document.title = originalTitle;
}

// Auto-stop tab blinking when user interacts with the page
function setupAutoStopBlink() {
  // Stop blinking on click anywhere
  document.addEventListener('click', function() {
    stopTabBlink();
  });
  
  // Stop blinking when tab becomes visible again
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      stopTabBlink();
    }
  });
  
  // Stop blinking when window gains focus
  window.addEventListener('focus', function() {
    stopTabBlink();
  });
  
  // Stop blinking on key press
  document.addEventListener('keydown', function() {
    stopTabBlink();
  });
  
  // Stop blinking on scroll
  window.addEventListener('scroll', function() {
    stopTabBlink();
  });
}

// Initialize auto-stop on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupAutoStopBlink);
} else {
  setupAutoStopBlink();
}

// ============================================================
// TRIVIA QUESTION BANK
