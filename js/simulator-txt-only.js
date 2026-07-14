(function () {
  'use strict';

  var style = document.createElement('style');
  style.id = 'simulator-random-only-style';
  style.textContent = `
    #sim-script-list{display:none!important;}
    #sim-call-room{display:none;max-width:42rem;margin:0 auto;padding:1rem .5rem;}
    #sim-call-room.active{display:block;}
    .sim-call-shell{position:relative;overflow:hidden;border:1px solid rgba(99,102,241,.28);border-radius:24px;background:linear-gradient(145deg,rgba(15,23,42,.96),rgba(2,6,23,.98));box-shadow:0 22px 70px rgba(0,0,0,.35);}
    .sim-call-glow{position:absolute;inset:-80px auto auto 50%;width:260px;height:260px;transform:translateX(-50%);border-radius:999px;background:rgba(99,102,241,.15);filter:blur(55px);pointer-events:none;}
    .sim-call-top{position:relative;padding:28px 24px 20px;text-align:center;border-bottom:1px solid rgba(255,255,255,.07);}
    .sim-call-icon{width:72px;height:72px;margin:0 auto 14px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:rgba(99,102,241,.16);border:1px solid rgba(129,140,248,.4);color:#c7d2fe;font-size:26px;}
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
  document.head.appendChild(style);

  if (
    typeof REMOTE_AGENT_NAMES !== 'undefined' &&
    REMOTE_AGENT_NAMES instanceof Set
  ) {
    REMOTE_AGENT_NAMES.delete('GYP MANGAR');
    REMOTE_AGENT_NAMES.add('GYP NICHOLA MANGAR');
  }

  function cleanValue(value) {
    return String(value || '')
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .trim();
  }

  function parseStructuredScript(raw) {
    var source = String(raw || '').trim();
    var openingLine = '';
    var firstCustomerReply = '';
    var steps = [];

    /*
      Supports JSON saved inside a .txt file.

      Correct structure:

      {
        "agent_opening": "Agent opening sentence",
        "first_customer_reply": "Automatic customer reply",
        "steps": [...]
      }
    */
    if (/^[\[{]/.test(source)) {
      try {
        var data = JSON.parse(source);
        var root = Array.isArray(data) ? { steps: data } : data;

        openingLine = cleanValue(
          root.agent_opening ||
          root.opening_line ||
          root.openingLine ||
          root.intro ||
          ''
        );

        firstCustomerReply = cleanValue(
          root.first_customer_reply ||
          root.firstCustomerReply ||
          root.customer_opening ||
          ''
        );

        var inputSteps = root.steps || [];

        steps = inputSteps
          .map(function (step, index) {
            var responses = step.responses || step.options || [];

            var normalizedOptions = responses
              .map(function (opt) {
                return {
                  quality: String(opt.quality || 'ok').toLowerCase(),
                  text: cleanValue(opt.text),
                  customer_reply: cleanValue(
                    opt.customer_reply ||
                    opt.customerReply ||
                    opt.reaction ||
                    ''
                  ),
                  next_step: cleanValue(
                    opt.next_step ||
                    opt.nextStep ||
                    ''
                  )
                };
              })
              .filter(function (opt) {
                return opt.text;
              });

            var customerMessage = cleanValue(
              step.customer_message ||
              step.customer_line ||
              (step.customer_lines || [])[0] ||
              ''
            );

            return {
              id: cleanValue(step.id || ''),
              label: step.label || ('Step ' + (index + 1)),
              customer_lines: customerMessage ? [customerMessage] : [],
              options: normalizedOptions,
              reaction_best: cleanValue(step.reaction_best || ''),
              reaction_ok: cleanValue(step.reaction_ok || ''),
              reaction_weak: cleanValue(step.reaction_weak || ''),
              reaction_wrong: cleanValue(step.reaction_wrong || '')
            };
          })
          .filter(function (step) {
            return step.options.length;
          });

        return {
          openingLine: openingLine,
          firstCustomerReply: firstCustomerReply,
          steps: steps
        };
      } catch (error) {
        console.warn(
          'The simulator TXT file looked like JSON but could not be parsed.',
          error
        );
      }
    }

    /*
      Plain-text format:

      Agent opening: Hi, this is Sarah...
      First customer reply: Maybe. What's the name of your company?

      Step 1:
      Customer: Maybe. What's the name of your company?
      Agent best response: ...
      If customer reacts Best: ...
      Agent OK response: ...
      If customer reacts OK: ...
      Agent weak response: ...
      If customer reacts Weak: ...
      Agent wrong response: ...
      If customer reacts Wrong: ...
    */

    var lines = source
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      });

    var current = null;

    function pushCurrent() {
      if (!current) {
        return;
      }

      var options = [];

      ['best', 'ok', 'weak', 'wrong'].forEach(function (quality) {
        if (current[quality]) {
          options.push({
            text: current[quality],
            quality: quality,
            customer_reply:
              current['reply_' + quality] ||
              ''
          });
        }
      });

      if (!options.length) {
        current = null;
        return;
      }

      steps.push({
        label: current.label || ('Step ' + (steps.length + 1)),
        customer_lines: current.customer
          ? [current.customer]
          : [],
        options: options,
        reaction_best:
          current.reply_best ||
          current.reply_ok ||
          '',
        reaction_ok: current.reply_ok || '',
        reaction_weak: current.reply_weak || '',
        reaction_wrong: current.reply_wrong || ''
      });

      current = null;
    }

    lines.forEach(function (line) {
      if (!line || /^End of Script$/i.test(line)) {
        return;
      }

      var match;

      if (
        (match = line.match(/^Agent opening:\s*(.+)$/i)) ||
        (match = line.match(/^Opening agent:\s*(.+)$/i))
      ) {
        openingLine = cleanValue(match[1]);
        return;
      }

      if (
        (match = line.match(/^First customer reply:\s*(.+)$/i)) ||
        (match = line.match(/^Customer opening:\s*(.+)$/i))
      ) {
        firstCustomerReply = cleanValue(match[1]);
        return;
      }

      if (
        (match = line.match(/^Agent:\s*(.+)$/i)) &&
        !openingLine &&
        !current
      ) {
        openingLine = cleanValue(match[1]);
        return;
      }

      if ((match = line.match(/^Step\s*\d*\s*:\s*(.*)$/i))) {
        pushCurrent();

        current = {
          label:
            cleanValue(match[1]) ||
            ('Step ' + (steps.length + 1))
        };

        return;
      }

      if ((match = line.match(/^Customer:\s*(.+)$/i))) {
        if (!current) {
          current = {};
        }

        current.customer = cleanValue(match[1]);

        if (!firstCustomerReply && steps.length === 0) {
          firstCustomerReply = current.customer;
        }

        return;
      }

      if (!current) {
        return;
      }

      if ((match = line.match(/^Agent best response:\s*(.+)$/i))) {
        current.best = cleanValue(match[1]);
      } else if (
        (match = line.match(/^Agent OK response:\s*(.+)$/i))
      ) {
        current.ok = cleanValue(match[1]);
      } else if (
        (match = line.match(/^Agent weak response:\s*(.+)$/i))
      ) {
        current.weak = cleanValue(match[1]);
      } else if (
        (match = line.match(/^Agent wrong response:\s*(.+)$/i))
      ) {
        current.wrong = cleanValue(match[1]);
      } else if (
        (match = line.match(/^If customer reacts Best:\s*(.+)$/i))
      ) {
        current.reply_best = cleanValue(match[1]);
      } else if (
        (match = line.match(/^If customer reacts OK:\s*(.+)$/i))
      ) {
        current.reply_ok = cleanValue(match[1]);
      } else if (
        (match = line.match(/^If customer reacts Weak:\s*(.+)$/i))
      ) {
        current.reply_weak = cleanValue(match[1]);
      } else if (
        (match = line.match(/^If customer reacts Wrong:\s*(.+)$/i))
      ) {
        current.reply_wrong = cleanValue(match[1]);
      }
    });

    pushCurrent();

    return {
      openingLine: openingLine,
      firstCustomerReply: firstCustomerReply,
      steps: steps
    };
  }

  function addBubble(type, text) {
    var transcript = document.getElementById('sim-transcript');

    if (!transcript || !text) {
      return;
    }

    var bubble = document.createElement('div');
    bubble.className =
      'sim-bubble flex ' +
      (type === 'agent' ? 'justify-end' : 'justify-start');

    var card = document.createElement('div');

    if (type === 'agent') {
      card.className =
        'max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-snug ' +
        'bg-indigo-500/20 border border-indigo-400/25 text-indigo-100 ' +
        'rounded-br-sm';
    } else {
      card.className =
        'max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-snug ' +
        'bg-white/[0.06] border border-white/[0.08] text-slate-200 ' +
        'rounded-bl-sm';
    }

    var label = document.createElement('div');
    label.className =
      'text-[8px] font-black uppercase tracking-wider mb-1 ' +
      (type === 'agent'
        ? 'text-indigo-300'
        : 'text-slate-500');

    label.textContent =
      type === 'agent'
        ? '🎧 Agent'
        : '👤 Customer';

    card.appendChild(label);
    card.appendChild(document.createTextNode(text));
    bubble.appendChild(card);
    transcript.appendChild(bubble);
    transcript.scrollTop = transcript.scrollHeight;
  }

  function addCustomerBubble(text) {
    addBubble('customer', text);
  }

  function addAgentBubble(text) {
    addBubble('agent', text);
  }

  function removeDuplicateCustomerBubbles(text) {
    var transcript = document.getElementById('sim-transcript');

    if (!transcript || !text) {
      return;
    }

    var bubbles = transcript.querySelectorAll('.sim-bubble');
    var matching = [];

    bubbles.forEach(function (bubble) {
      var bubbleText = String(bubble.textContent || '')
        .replace(/^👤 Customer/i, '')
        .trim();

      if (bubbleText === text.trim()) {
        matching.push(bubble);
      }
    });

    while (matching.length > 1) {
      var duplicate = matching.pop();
      duplicate.remove();
    }
  }

  function installAutomaticReplyHandler() {
    if (window.__simAutomaticReplyInstalled) {
      return true;
    }

    var responseArea =
      document.getElementById('sim-options') ||
      document.getElementById('sim-response-options') ||
      document.getElementById('sim-choices');

    if (!responseArea) {
      return false;
    }

    responseArea.addEventListener('click', function (event) {
      var button = event.target.closest(
        'button,[data-quality],[data-response-index]'
      );

      if (!button) {
        return;
      }

      var responseText =
        button.dataset.responseText ||
        button.dataset.text ||
        button.textContent ||
        '';

      responseText = cleanValue(responseText);

      if (responseText) {
        setTimeout(function () {
          removeDuplicateCustomerBubbles(responseText);
        }, 50);
      }
    });

    window.__simAutomaticReplyInstalled = true;
    return true;
  }

  function installCallRoom() {
    var lobby = document.getElementById('sim-lobby');

    if (
      !lobby ||
      typeof window.simStartRandom !== 'function'
    ) {
      return false;
    }

    if (window.simStartRandom.__callRoomWrapped) {
      return true;
    }

    var room = document.createElement('div');
    room.id = 'sim-call-room';

    room.innerHTML =
      '<div class="sim-call-shell">' +
        '<div class="sim-call-glow"></div>' +

        '<div class="sim-call-top">' +
          '<div class="sim-call-icon">' +
            '<i id="sim-call-room-icon" class="fas fa-phone-alt"></i>' +
          '</div>' +

          '<div class="sim-call-kicker">Training Call Ready</div>' +
          '<div id="sim-call-room-type" class="sim-call-type">' +
            'Outbound Call' +
          '</div>' +

          '<div id="sim-call-room-status" class="sim-call-status">' +
            'The agent must begin with the opening line.' +
          '</div>' +
        '</div>' +

        '<div class="sim-call-chat">' +
          '<div id="sim-call-room-system" class="sim-call-message system">' +
            'Training call connected' +
          '</div>' +

          '<div id="sim-call-room-customer" class="sim-call-message customer">' +
            'The customer has answered the call.' +
          '</div>' +

          '<div class="sim-call-message agent">' +
            'Start with the required agent opening.' +
          '</div>' +
        '</div>' +

        '<div class="sim-call-actions">' +
          '<button id="sim-call-room-start" type="button" class="sim-call-start">' +
            '<i class="fas fa-play mr-2"></i>' +
            'Start Call' +
          '</button>' +

          '<button id="sim-call-room-cancel" type="button" class="sim-call-cancel">' +
            'Back to Simulator' +
          '</button>' +
        '</div>' +
      '</div>';

    lobby.insertAdjacentElement('afterend', room);

    var originalStartRandom = window.simStartRandom;

    window.simStartRandom = function () {
      document.getElementById(
        'sim-call-room-type'
      ).textContent = 'Outbound Call';

      document.getElementById(
        'sim-call-room-system'
      ).textContent = 'Outbound call connected';

      document.getElementById(
        'sim-call-room-customer'
      ).textContent = 'The customer has answered the call.';

      lobby.classList.add('hidden');
      room.classList.add('active');
    };

    window.simStartRandom.__callRoomWrapped = true;

    document
      .getElementById('sim-call-room-start')
      .addEventListener('click', function () {
        room.classList.remove('active');
        originalStartRandom();
      });

    document
      .getElementById('sim-call-room-cancel')
      .addEventListener('click', function () {
        room.classList.remove('active');
        lobby.classList.remove('hidden');
      });

    return true;
  }

  function applyTextMode() {
    var body = document.getElementById('simscript-body');
    var fileInput = document.getElementById(
      'simscript-file-input'
    );

    if (!body || !fileInput) {
      return false;
    }

    if (fileInput.dataset.txtOnlyApplied === '1') {
      return true;
    }

    fileInput.dataset.txtOnlyApplied = '1';

    var label = body.parentElement
      ? body.parentElement.querySelector('label')
      : null;

    if (label) {
      label.textContent = 'Simulator Script Text';
    }

    body.placeholder =
      'Paste the structured call simulator script here. ' +
      'The agent opening comes first, then the customer replies automatically.';

    body.classList.remove('font-mono');

    fileInput.setAttribute(
      'accept',
      '.txt,text/plain'
    );

    var uploadBox = fileInput.previousElementSibling;

    if (uploadBox) {
      Array.prototype.forEach.call(
        uploadBox.querySelectorAll('div'),
        function (node) {
          if (
            (node.textContent || '').indexOf(
              '.txt or .json'
            ) !== -1
          ) {
            node.textContent =
              'Click to choose a .txt file';
          }
        }
      );
    }

    var uploadPanel = fileInput.parentElement;

    if (uploadPanel) {
      Array.prototype.forEach.call(
        uploadPanel.querySelectorAll('p'),
        function (node) {
          if (
            /plain-text or JSON/i.test(
              node.textContent || ''
            )
          ) {
            node.textContent =
              'Upload a plain-text simulator script. ' +
              'The filename becomes the script title.';
          }
        }
      );
    }

    /*
      Main parser used by the simulator.
    */
    window._parseScriptContent = function (
      raw,
      title,
      category,
      difficulty
    ) {
      var parsed = parseStructuredScript(raw);

      return {
        title: title,
        category: category || 'General',
        difficulty: difficulty || 'Medium',

        opening_line: parsed.openingLine,
        openingLine: parsed.openingLine,
        agent_opening: parsed.openingLine,

        first_customer_reply:
          parsed.firstCustomerReply,

        firstCustomerReply:
          parsed.firstCustomerReply,

        auto_customer_reply: true,
        start_with_agent_opening: true,
        show_full_script: false,

        steps: parsed.steps,
        createdAt: Date.now()
      };
    };

    window.simScriptFileChosen = function (input) {
      var file =
        input.files &&
        input.files[0];

      var statusEl = document.getElementById(
        'simscript-file-status'
      );

      if (!file) {
        return;
      }

      if (!/\.txt$/i.test(file.name)) {
        input.value = '';

        if (statusEl) {
          statusEl.innerHTML =
            '<span class="text-red-400">' +
            'Please choose a .txt file only.' +
            '</span>';
        }

        return;
      }

      window._simScriptFileName =
        file.name.replace(/\.txt$/i, '');

      var nameEl = document.getElementById(
        'simscript-file-name'
      );

      if (nameEl) {
        nameEl.textContent = file.name;
      }

      var reader = new FileReader();

      reader.onload = function (event) {
        window._simScriptFileContent =
          event.target.result;

        if (statusEl) {
          statusEl.innerHTML = '';
        }
      };

      reader.onerror = function () {
        if (statusEl) {
          statusEl.innerHTML =
            '<span class="text-red-400">' +
            'The TXT file could not be read.' +
            '</span>';
        }
      };

      reader.readAsText(file);
    };

    return true;
  }

  var attempts = 0;

  var timer = setInterval(function () {
    attempts += 1;

    var textModeReady = applyTextMode();
    var callRoomReady = installCallRoom();
    var replyHandlerReady =
      installAutomaticReplyHandler();

    if (
      (
        textModeReady &&
        callRoomReady &&
        replyHandlerReady
      ) ||
      attempts >= 120
    ) {
      clearInterval(timer);
    }
  }, 250);
})();
