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
// CLOCK UPDATE — synced to Firebase Realtime Database server time
// Uses Firebase .info/serverTimeOffset, then advances from a monotonic
// performance clock so a workstation clock adjustment cannot make the
// dashboard jump ahead/behind after the initial Firebase sync.
// ============================================================
let _serverTimeOffset = 0;
let _serverEpochAtSync = 0;
let _performanceAtSync = 0;
let _firebaseClockReady = false;
let _firebaseClockListenerStarted = false;

function _setFirebaseClockAnchor(offset) {
  if (typeof offset !== 'number' || !Number.isFinite(offset)) return;
  _serverTimeOffset = offset;
  _serverEpochAtSync = Date.now() + offset;
  _performanceAtSync = (window.performance && typeof window.performance.now === 'function')
    ? window.performance.now()
    : 0;
  _firebaseClockReady = true;
}

function getFirebaseServerNowMs() {
  if (!_firebaseClockReady) return Date.now();
  if (window.performance && typeof window.performance.now === 'function') {
    return _serverEpochAtSync + (window.performance.now() - _performanceAtSync);
  }
  return Date.now() + _serverTimeOffset;
}
window.getFirebaseServerNowMs = getFirebaseServerNowMs;
window.getFirebaseServerNow = function() { return new Date(getFirebaseServerNowMs()); };

function _initServerTimeSync() {
  if (_firebaseClockListenerStarted) return;
  if (typeof window.rtdbRef !== 'function' || typeof window.rtdbOnValue !== 'function') {
    setTimeout(_initServerTimeSync, 350);
    return;
  }
  _firebaseClockListenerStarted = true;
  try {
    window.rtdbOnValue(window.rtdbRef('.info/serverTimeOffset'), function(snap) {
      const offset = Number(snap.val());
      if (Number.isFinite(offset)) {
        _setFirebaseClockAnchor(offset);
        updateClocks();
      }
    });
  } catch(e) {
    _firebaseClockListenerStarted = false;
    console.warn('[Clock] Could not sync server time from Firebase:', e);
    setTimeout(_initServerTimeSync, 2000);
  }
}

function _formatClockAt(epochMs, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(epochMs));
  } catch (_) {
    return new Date(epochMs).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
  }
}

function updateClocks(){
  const serverNow = getFirebaseServerNowMs();
  const gEl = document.getElementById('clock-guyana');
  const cEl = document.getElementById('clock-california');
  if (gEl) gEl.textContent = _formatClockAt(serverNow, 'America/Guyana');
  if (cEl) cEl.textContent = _formatClockAt(serverNow, 'America/Los_Angeles');
}

_initServerTimeSync();
updateClocks();
setInterval(updateClocks, 1000);

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
