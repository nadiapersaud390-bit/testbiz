(function () {
  'use strict';

  // Preserve the existing remote-agent roster exactly as it was before this patch.
  if (typeof REMOTE_AGENT_NAMES !== 'undefined' && REMOTE_AGENT_NAMES instanceof Set) {
    REMOTE_AGENT_NAMES.delete('GYP MANGAR');
    REMOTE_AGENT_NAMES.add('GYP NICHOLA MANGAR');
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
        if ((node.textContent || '').indexOf('.txt or .json') !== -1) {
          node.textContent = 'Click to choose a .txt file';
        }
      });
    }

    var uploadPanel = fileInput.parentElement;
    if (uploadPanel) {
      Array.prototype.forEach.call(uploadPanel.querySelectorAll('p'), function(node) {
        if (/plain-text or JSON/i.test(node.textContent || '')) {
          node.textContent = 'Upload a plain-text simulator script. The filename becomes the script title.';
        }
      });
    }

    window._parseScriptContent = function(raw, title, category, difficulty) {
      return {
        title: title,
        category: category || 'General',
        difficulty: difficulty || 'Medium',
        steps: textToSteps(raw),
        createdAt: Date.now()
      };
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
      reader.onload = function(event) {
        window._simScriptFileContent = event.target.result;
        if (statusEl) statusEl.innerHTML = '';
      };
      reader.readAsText(file);
    };

    var originalLoadList = window.simScriptLoadList;
    if (typeof originalLoadList === 'function' && !originalLoadList.__txtOnlyWrapped) {
      window.simScriptLoadList = function() {
        var result = originalLoadList.apply(this, arguments);
        setTimeout(function() {
          if (Array.isArray(window._simScriptListCache)) {
            window.simScriptEdit = function(id) {
              var script = window._simScriptListCache.find(function(item) { return item.id === id; });
              if (!script) return;
              window._simScriptEditId = id;
              var titleEl = document.getElementById('simscript-title');
              var categoryEl = document.getElementById('simscript-category');
              var difficultyEl = document.getElementById('simscript-difficulty');
              var bodyEl = document.getElementById('simscript-body');
              if (titleEl) titleEl.value = script.title || '';
              if (categoryEl) categoryEl.value = script.category || 'General';
              if (difficultyEl) difficultyEl.value = script.difficulty || 'Medium';
              if (bodyEl) bodyEl.value = stepsToText(script.steps);
              if (titleEl) titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
          }
        }, 100);
        return result;
      };
      window.simScriptLoadList.__txtOnlyWrapped = true;
    }

    return true;
  }

  var attempts = 0;
  var timer = setInterval(function() {
    attempts += 1;
    if (applyOnce() || attempts >= 120) clearInterval(timer);
  }, 250);
})();
