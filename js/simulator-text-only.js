(function () {
  'use strict';

  function textToSteps(raw) {
    return String(raw || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map((line, index) => ({
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
      }));
  }

  function stepsToText(steps) {
    return (Array.isArray(steps) ? steps : [])
      .map(step => {
        if (Array.isArray(step.customer_lines) && step.customer_lines.length) {
          return step.customer_lines.join('\n');
        }
        return step.text || step.label || '';
      })
      .filter(Boolean)
      .join('\n');
  }

  function applyTextOnlyMode() {
    const body = document.getElementById('simscript-body');
    const fileInput = document.getElementById('simscript-file-input');
    if (!body || !fileInput) return false;

    const bodyLabel = body.closest('div')?.querySelector('label');
    if (bodyLabel) bodyLabel.textContent = 'Simulator Script Text';
    body.placeholder = 'Type or paste the simulator script here.\n\nUse one customer line per row.';
    body.classList.remove('font-mono');

    fileInput.setAttribute('accept', '.txt,text/plain');

    const uploadCard = fileInput.previousElementSibling;
    if (uploadCard) {
      const textNodes = uploadCard.querySelectorAll('div');
      textNodes.forEach(node => {
        if (/\.txt or \.json/i.test(node.textContent || '')) {
          node.textContent = 'Click to choose a .txt file';
        }
      });
    }

    const uploadSection = fileInput.closest('.bg-black\/40');
    if (uploadSection) {
      uploadSection.querySelectorAll('p').forEach(p => {
        if (/plain-text or JSON/i.test(p.textContent || '')) {
          p.textContent = 'Upload a plain-text simulator script. The filename becomes the script title.';
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
      const file = input.files && input.files[0];
      const statusEl = document.getElementById('simscript-file-status');
      if (!file) return;
      if (!/\.txt$/i.test(file.name)) {
        input.value = '';
        if (statusEl) statusEl.innerHTML = '<span class="text-red-400">Please choose a .txt file only.</span>';
        return;
      }
      window._simScriptFileName = file.name.replace(/\.txt$/i, '');
      const nameEl = document.getElementById('simscript-file-name');
      if (nameEl) nameEl.textContent = file.name;
      const reader = new FileReader();
      reader.onload = function(event) {
        window._simScriptFileContent = event.target.result;
        if (statusEl) statusEl.innerHTML = '';
      };
      reader.readAsText(file);
    };

    window.simScriptEdit = function(id) {
      const cache = Array.isArray(window._simScriptListCache) ? window._simScriptListCache : [];
      const script = cache.find(item => item.id === id);
      if (!script) return;

      window._simScriptEditId = id;
      const titleEl = document.getElementById('simscript-title');
      const categoryEl = document.getElementById('simscript-category');
      const difficultyEl = document.getElementById('simscript-difficulty');
      const bodyEl = document.getElementById('simscript-body');

      if (titleEl) titleEl.value = script.title || '';
      if (categoryEl) categoryEl.value = script.category || 'General';
      if (difficultyEl) difficultyEl.value = script.difficulty || 'Medium';
      if (bodyEl) bodyEl.value = stepsToText(script.steps);
      if (titleEl) titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (titleEl) titleEl.focus();
    };

    return true;
  }

  const observer = new MutationObserver(() => applyTextOnlyMode());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(() => {
    if (applyTextOnlyMode()) clearInterval(timer);
  }, 500);
})();
