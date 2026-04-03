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

const REBUTTAL_TOTAL = 19;

function showRebuttal(idx) {
    for (let i = 0; i < REBUTTAL_TOTAL; i++) {
        const p = document.getElementById('rb-panel-' + i);
        const b = document.getElementById('rb-btn-' + i);
        if (p) p.style.display = 'none';
        if (b) { b.style.background='rgba(255,255,255,0.04)'; b.style.borderColor='rgba(255,255,255,0.1)'; b.style.color='#64748b'; }
    }
    const panel = document.getElementById('rb-panel-' + idx);
    const btn   = document.getElementById('rb-btn-' + idx);
    if (panel) panel.style.display = 'block';
    if (btn) { btn.style.background='rgba(20,184,166,0.2)'; btn.style.borderColor='#14b8a6'; btn.style.color='#2dd4bf'; btn.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}); }
}

function filterRebuttalSearch(val) {
    const q = val.trim().toLowerCase();
    const noResults = document.getElementById('rebuttal-no-results');
    if (!q) { if (noResults) noResults.style.display='none'; showRebuttal(0); return; }
    let found = -1;
    for (let i = 0; i < REBUTTAL_TOTAL; i++) {
        const p = document.getElementById('rb-panel-' + i);
        if (p && p.innerText.toLowerCase().includes(q)) { if (found === -1) found = i; }
    }
    if (found >= 0) { if (noResults) noResults.style.display='none'; showRebuttal(found); }
    else { if (noResults) noResults.style.display='block'; for (let i=0;i<REBUTTAL_TOTAL;i++){const p=document.getElementById('rb-panel-'+i);if(p)p.style.display='none';} }
}

function toggleRevenueDropdown() {
    const body = document.getElementById('revenue-body');
    const arrow = document.getElementById('revenue-arrow');
    const isOpen = body.style.maxHeight && body.style.maxHeight !== '0px';
    if (isOpen) { body.style.maxHeight = '0px'; arrow.style.transform = 'rotate(0deg)'; }
    else { body.style.maxHeight = '800px'; arrow.style.transform = 'rotate(180deg)'; }
}
