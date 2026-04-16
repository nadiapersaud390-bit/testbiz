function toggleIndustry(header) {
    const card=header.closest('.industry-card'),body=card.querySelector('.industry-body'),arrow=header.querySelector('.industry-arrow'),isOpen=body.classList.contains('open');
    document.querySelectorAll('.industry-body.open').forEach(b=>b.classList.remove('open'));
    document.querySelectorAll('.industry-arrow.open').forEach(a=>a.classList.remove('open'));
    if(!isOpen){body.classList.add('open');arrow.classList.add('open');}
}

function toggleRebuttal(header) {
    const card = header.closest('.rebuttal-card');
    const body = card.querySelector('.rebuttal-body');
    const arrow = card.querySelector('.rebuttal-arrow');
    const isOpen = body.classList.contains('open');
    document.querySelectorAll('.rebuttal-body.open').forEach(b => b.classList.remove('open'));
    document.querySelectorAll('.rebuttal-arrow.open').forEach(a => a.classList.remove('open'));
    if (!isOpen) { body.classList.add('open'); arrow.classList.add('open'); }
}

function resetRebuttalButton(btn) {
    if (!btn) return;
    btn.style.background = 'rgba(255,255,255,0.04)';
    btn.style.borderColor = 'rgba(255,255,255,0.1)';
    btn.style.color = '#64748b';
}

function activateRebuttalButton(btn) {
    if (!btn) return;
    btn.style.background = 'rgba(20,184,166,0.2)';
    btn.style.borderColor = '#14b8a6';
    btn.style.color = '#2dd4bf';
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function closeAllRebuttals() {
    document.querySelectorAll('.rb-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    document.querySelectorAll('#rb-btn-row button').forEach(resetRebuttalButton);
}

function showRebuttal(idx) {
    closeAllRebuttals();

    const panel = document.getElementById('rb-panel-' + idx);
    const btn = document.getElementById('rb-btn-' + idx);

    if (panel) {
        panel.style.display = 'block';
        panel.style.animation = 'none';
        panel.offsetHeight;
        panel.style.animation = 'fadeSlideIn 0.2s ease';
    }

    activateRebuttalButton(btn);
}

function filterRebuttalSearch(val) {
    const q = val.trim().toLowerCase();
    const noResults = document.getElementById('rebuttal-no-results');
    const buttons = Array.from(document.querySelectorAll('#rb-btn-row button'));
    let visibleCount = 0;

    buttons.forEach(button => {
        const matches = !q || button.textContent.toLowerCase().includes(q);
        button.style.display = matches ? 'block' : 'none';
        if (matches) visibleCount++;
    });

    if (noResults) noResults.style.display = visibleCount === 0 && q ? 'block' : 'none';

    const activeButton = buttons.find(button => button.style.display !== 'none' && button.style.color === 'rgb(45, 212, 191)');
    if (activeButton || !q) return;

    closeAllRebuttals();
}

window.RebuttalManager = {
    showRebuttal,
    filterSearch: filterRebuttalSearch,
    reset: closeAllRebuttals
};

function toggleRevenueDropdown() {
    const body = document.getElementById('revenue-body');
    const arrow = document.getElementById('revenue-arrow');
    const isOpen = body.style.maxHeight && body.style.maxHeight !== '0px';
    if (isOpen) { body.style.maxHeight = '0px'; arrow.style.transform = 'rotate(0deg)'; }
    else { body.style.maxHeight = '800px'; arrow.style.transform = 'rotate(180deg)'; }
}
