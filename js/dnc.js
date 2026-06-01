/**
 * Do Not Call (DNC) List Checker
 * Checks a phone number against your Google Sheet DNC list.
 * Sheet columns: A = Phone Number, B = Date Added, C = Note
 */

async function checkDNC(rawNumber) {
    const digits = rawNumber.replace(/\D/g, '').slice(-10);
    if (digits.length < 7) return;

    const resultEl = document.getElementById('dnc-result');
    if (!resultEl) return;

    if (!DNC_API_URL || DNC_API_URL === 'PASTE_YOUR_DNC_APPS_SCRIPT_URL_HERE') {
        return;
    }

    resultEl.innerHTML = '<div style="padding:14px 18px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">⏳ Checking DNC list...</div>';
    resultEl.classList.remove('hidden');

    try {
        const res = await fetch(DNC_API_URL + '?action=checkDNC&number=' + encodeURIComponent(digits), {
            method: 'GET',
            redirect: 'follow'
        });

        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch(parseErr) {
            resultEl.innerHTML = `
                <div style="padding:12px 18px;border-radius:14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);display:flex;align-items:center;gap:10px;">
                    <i class="fas fa-exclamation-triangle" style="color:#ef4444;font-size:1rem;"></i>
                    <span style="font-size:11px;font-weight:700;color:#f87171;">DNC script error — make sure your Apps Script is deployed as Anyone can access and the sheet tab is named <strong>DNC</strong></span>
                </div>`;
            return;
        }

        if (data.found) {
            const dateStr = data.date ? String(data.date) : '—';
            const note = data.note ? escapeHtml(String(data.note)) : '—';
            resultEl.innerHTML = `
                <div style="border-radius:16px;overflow:hidden;border:2px solid rgba(239,68,68,0.6);box-shadow:0 0 30px rgba(239,68,68,0.2);animation:fadeSlideIn 0.25s ease-out;">
                    <div style="background:linear-gradient(135deg,rgba(239,68,68,0.22),rgba(185,28,28,0.32));padding:16px 20px;">
                        <div style="display:flex;align-items:center;gap:14px;">
                            <div style="width:50px;height:50px;border-radius:50%;background:rgba(239,68,68,0.15);border:2px solid rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                <i class="fas fa-phone-slash" style="color:#ef4444;font-size:1.1rem;"></i>
                            </div>
                            <div>
                                <div style="font-family:'Orbitron',sans-serif;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.12em;color:#ef4444;margin-bottom:3px;">🚫 DO NOT CALL — ON DNC LIST</div>
                                <div style="font-size:12px;font-weight:700;color:#fca5a5;">This number has been flagged. Do not transfer or engage.</div>
                            </div>
                        </div>
                    </div>
                    <div style="background:rgba(2,6,23,0.88);padding:14px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div>
                            <div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.12em;color:#475569;margin-bottom:3px;">Date Added</div>
                            <div style="font-size:13px;font-weight:700;color:#f1f5f9;">${escapeHtml(dateStr)}</div>
                        </div>
                        <div style="grid-column:1/-1;">
                            <div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.12em;color:#475569;margin-bottom:3px;">Note</div>
                            <div style="font-size:13px;font-weight:700;color:#fca5a5;">${note}</div>
                        </div>
                    </div>
                </div>`;
        } else {
            resultEl.innerHTML = `
                <div style="padding:12px 18px;border-radius:14px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.25);display:flex;align-items:center;gap:10px;animation:fadeSlideIn 0.2s ease-out;">
                    <i class="fas fa-check-circle" style="color:#22c55e;font-size:1rem;"></i>
                    <span style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;color:#22c55e;">Not on DNC list — cleared to proceed</span>
                </div>`;
            setTimeout(() => {
                if (resultEl) { resultEl.classList.add('hidden'); resultEl.innerHTML = ''; }
            }, 4000);
        }
    } catch (e) {
        resultEl.innerHTML = `
            <div style="padding:12px 18px;border-radius:14px;background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.3);display:flex;align-items:flex-start;gap:10px;">
                <i class="fas fa-exclamation-triangle" style="color:#eab308;font-size:1rem;margin-top:1px;flex-shrink:0;"></i>
                <div>
                    <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;color:#eab308;margin-bottom:3px;">DNC check failed — network error</div>
                    <div style="font-size:10px;font-weight:700;color:#64748b;">Check that your Apps Script is deployed with <em>Anyone</em> access and re-deploy if needed.</div>
                </div>
            </div>`;
    }
}

function clearDNCResult() {
    const el = document.getElementById('dnc-result');
    if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
}
