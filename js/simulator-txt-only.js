(function () {
  'use strict';

  // Keep the Call Simulator lobby focused on the random-call action only.
  var simulatorListStyle = document.createElement('style');
  simulatorListStyle.id = 'simulator-random-only-style';
  simulatorListStyle.textContent = `
    #sim-script-list{display:none!important;}
    #sim-call-room{display:none;max-width:42rem;margin:0 auto;padding:1rem .5rem;}
    #sim-call-room.active{display:block;}
    .sim-call-shell{position:relative;overflow:hidden;border:1px solid rgba(99,102,241,.28);border-radius:24px;background:linear-gradient(145deg,rgba(15,23,42,.96),rgba(2,6,23,.98));box-shadow:0 22px 70px rgba(0,0,0,.35);}
    .sim-call-glow{position:absolute;inset:-80px auto auto 50%;width:260px;height:260px;transform:translateX(-50%);border-radius:999px;background:rgba(99,102,241,.15);filter:blur(55px);pointer-events:none;}
    .sim-call-top{position:relative;padding:28px 24px 20px;text-align:center;border-bottom:1px solid rgba(255,255,255,.07);}
    .sim-call-icon{width:72px;height:72px;margin:0 auto 14px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:rgba(99,102,241,.16);border:1px solid rgba(129,140,248,.4);color:#c7d2fe;font-size:26px;box-shadow:0 0 28px rgba(99,102,241,.16);}
    .sim-call-kicker{font-size:9px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#818cf8;}
    .sim-call-type{margin-top:6px;font-size:24px;font-weight:950;color:#f8fafc;text-transform:uppercase;letter-spacing:.08em;}
    .sim-call-status{margin-top:7px;font-size:11px;color:#64748b;}
    .sim-call-chat{position:relative;padding:22px 20px;display:flex;flex-direction:column;gap:12px;}
    .sim-call-message{max-width:82%;padding:12px 15px;border-radius:17px;font-size:12px;line-height:1.5;}
    .sim-call-message.system{align-self:center;max-width:100%;padding:7px 12px;border:1px solid rgba(148,163,184,.12);background:rgba(148,163,184,.06);color:#94a3b8;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.08em;}
    .sim-call-message.customer{align-self:flex-start;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);color:#e2e8f0;border-bottom-left-radius:5px;}
    .sim-call-message.agent{align-self:flex-end;background:rgba(99,102,241,.18);border:1px solid rgba(99,102,241,.32);color:#e0e7ff;border-bottom-right-radius:5px;}
    .sim-call-actions{position:relative;padding:0 20px 22px;display:grid;gap:10px;}
    .sim-call-start{width:100%;padding:15px 18px;border-radius:15px;border:1px solid rgba(99,102,241,.5);background:linear-gradient(135deg,rgba(79,70,229,.34),rgba(99,102,241,.2));color:#eef2ff;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.09em;cursor:pointer;}
    .sim-call-cancel{width:100%;padding:10px;border:0;background:transparent;color:#64748b;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.08em;cursor:pointer;}
  `;
  document.head.appendChild(simulatorListStyle);

  // Preserve the existing remote-agent roster exactly as it was before this patch.
  if (typeof REMOTE_AGENT_NAMES !== 'undefined' && REMOTE_AGENT_NAMES instanceof Set) {
    REMOTE_AGENT_NAMES.delete('GYP MANGAR');
    REMOTE_AGENT_NAMES.add('GYP NICHOLA MANGAR');
  }

  function installCallRoom() {
    var root = document.getElementById('simulator-root');
    var lobby = document.getElementById('sim-lobby');
    if (!root || !lobby || typeof window.simStartRandom !== 'function') return false;
    if (window.simStartRandom.__callRoomWrapped) return true;

    var room = document.createElement('div');
    room.id = 'sim-call-room';
    room.innerHTML = `
      <div class="sim-call-shell">
        <div class="sim-call-glow"></div>
        <div class="sim-call-top">
          <div class="sim-call-icon"><i id="sim-call-room-icon" class="fas fa-phone-alt"></i></div>
          <div class="sim-call-kicker">Training Call Ready</div>
          <div id="sim-call-room-type" class="sim-call-type">Inbound Call</div>
          <div id="sim-call-room-status" class="sim-call-status">Customer connected. Review the call direction, then begin.</div>
        </div>
        <div class="sim-call-chat">
          <div id="sim-call-room-system" class="sim-call-message system">Inbound call connected</div>
          <div id="sim-call-room-customer" class="sim-call-message customer">Customer is waiting on the line.</div>
          <div class="sim-call-message agent">Ready when you are. Start the script below.</div>
        </div>
        <div class="sim-call-actions">
          <button id="sim-call-room-start" type="button" class="sim-call-start"><i class="fas fa-play mr-2"></i>Start Script</button>
          <button id="sim-call-room-cancel" type="button" class="sim-call-cancel">Back to Simulator</button>
        </div>
      </div>
    `;
    lobby.insertAdjacentElement('afterend', room);

    var originalStartRandom = window.simStartRandom;
    window.simStartRandom = function() {
      var inbound = Math.random() < 0.5;
      var type = inbound ? 'Inbound Call' : 'Outbound Call';
      var icon = document.getElementById('sim-call-room-icon');
      var typeEl = document.getElementById('sim-call-room-type');
      var statusEl = document.getElementById('sim-call-room-status');
      var systemEl = document.getElementById('sim-call-room-system');
      var customerEl = document.getElementById('sim-call-room-customer');

      if (icon) icon.className = inbound ? 'fas fa-phone-volume' : 'fas fa-phone-alt';
      if (typeEl) typeEl.textContent = type;
      if (statusEl) statusEl.textContent = inbound
        ? 'Customer connected. Review the call direction, then begin.'
        : 'Outbound line is ready. Review the call direction, then begin.';
      if (systemEl) systemEl.textContent = inbound ? 'Inbound call connected' : 'Outbound call connected';
      if (customerEl) customerEl.textContent = inbound
        ? 'Customer is waiting on the line.'
        : 'The customer has answered your outbound call.';

      lobby.classList.add('hidden');
      var active = document.getElementById('sim-active');
      var results = document.getElementById('sim-results');
      if (active) active.classList.add('hidden');
      if (results) results.classList.add('hidden');
      room.classList.add('active');
    };
    window.simStartRandom.__callRoomWrapped = true;

    document.getElementById('sim-call-room-start').addEventListener('click', function() {
      room.classList.remove('active');
      originalStartRandom();
    });

    document.getElementById('sim-call-room-cancel').addEventListener('click', function() {
      room.classList.remove('active');
      lobby.classList.remove('hidden');
    });

    return true;
  }

  function textToSteps(raw) {
    return String(raw || '').split(/\r?\n/).map(function(line) {
      return line.trim();
    }).filter(Boolean).map(function(line, index) {
      return {
        label: 'Step ' + (index + 1),
        customer_lines: [line],
        options: [
          { text: 'I understand your concern. Let me address that.', quality: 'best' },
          { text: 'That is a valid point. Here is what we can do.', quality: 'ok' },
          { text: 'I am not sure about that.', quality: 'weak' },
          { text: 'That is just how it is.', quality: 'wrong' }
        ],
        reaction_ok: 'Thank you for understanding.',
        reaction_weak: 'I am still not convinced.',
        reaction_wrong: 'This conversation is not going well.'
      };
    });
  }

  function stepsToText(steps) {
    return (Array.isArray(steps) ? steps : []).map(function(step) {
      if (step && Array.isArray(step.customer_lines)) return step.customer_lines.join('\n');
      return step && (step.text || step.label) ? (step.text || step.label) : '';
    }).filter(Boolean).join('\n');
  }

  function applyOnce() {
    var body = document.getElementById('simscript-body');
    var fileInput = document.getElementById('simscript-file-input');
    if (!body || !fileInput) return false;
    if (fileInput.dataset.txtOnlyApplied === '1') return true;
    fileInput.dataset.txtOnlyApplied = '1';

    var label = body.parentElement ? body.parentElement.querySelector('label') : null;
    if (label) label.textContent = 'Simulator Script Text';
    body.placeholder = 'Type or paste the simulator script here. Use one customer line per row.';
    body.classList.remove('font-mono');
    fileInput.setAttribute('accept', '.txt,text/plain');

    var uploadBox = fileInput.previousElementSibling;
    if (uploadBox) {
      Array.prototype.forEach.call(uploadBox.querySelectorAll('div'), function(node) {
        if ((node.textContent || '').indexOf('.txt or .json') !== -1) node.textContent = 'Click to choose a .txt file';
      });
    }

    var uploadPanel = fileInput.parentElement;
    if (uploadPanel) {
      Array.prototype.forEach.call(uploadPanel.querySelectorAll('p'), function(node) {
        if (/plain-text or JSON/i.test(node.textContent || '')) node.textContent = 'Upload a plain-text simulator script. The filename becomes the script title.';
      });
    }

    window._parseScriptContent = function(raw, title, category, difficulty) {
      return { title: title, category: category || 'General', difficulty: difficulty || 'Medium', steps: textToSteps(raw), createdAt: Date.now() };
    };

    window.simScriptFileChosen = function(input) {
      var file = input.files && input.files[0];
      var statusEl = document.getElementById('simscript-file-status');
      if (!file) return;
      if (!/\.txt$/i.test(file.name)) {
        input.value = '';
        if (statusEl) statusEl.innerHTML = '<span class="text-red-400">Please choose a .txt file only.</span>';
        return;
      }
      window._simScriptFileName = file.name.replace(/\.txt$/i, '');
      var nameEl = document.getElementById('simscript-file-name');
      if (nameEl) nameEl.textContent = file.name;
      var reader = new FileReader();
      reader.onload = function(event) { window._simScriptFileContent = event.target.result; if (statusEl) statusEl.innerHTML = ''; };
      reader.readAsText(file);
    };

    return true;
  }

  var attempts = 0;
  var timer = setInterval(function() {
    attempts += 1;
    var textReady = applyOnce();
    var roomReady = installCallRoom();
    if ((textReady && roomReady) || attempts >= 120) clearInterval(timer);
  }, 250);
})();
