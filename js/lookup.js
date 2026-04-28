<div class="glass p-6 rounded-3xl border-t-4 border-t-blue-500">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);">
                    <i class="fab fa-google text-blue-400 text-sm"></i>
                </div>
                <div>
                    <div class="header-font text-xs text-blue-500 uppercase tracking-widest italic">Business Intelligence</div>
                    <div class="header-font text-lg font-black text-white uppercase italic">Lead Lookup</div>
                </div>
            </div>
            <p class="text-slate-500 text-xs mb-5 leading-relaxed">
                Type a phone number or business name — opens <strong class="text-white">Google AI</strong> in a new tab asking for the business name, owner, address, and email.
            </p>
            <div class="space-y-3">
                <input id="lookup-input" type="text" class="lookup-input"
                    placeholder="e.g. (716) 771-6522 or Business Name..."
                    onkeydown="if(event.key==='Enter')runLookup()"
                    oninput="onLookupInput(this.value)"
                    autocomplete="off"/>
                <button onclick="runLookup()" class="lookup-btn">
                    <i class="fab fa-google mr-2"></i>Open Google AI — Search Now
                </button>
                <button onclick="logPrankCall()" id="log-prank-btn" style="width:100%;padding:16px;border-radius:14px;font-family:'Orbitron',sans-serif;font-weight:900;font-size:0.78rem;letter-spacing:0.14em;text-transform:uppercase;background:linear-gradient(90deg,#7c1d1d,#991b1b,#b91c1c);color:white;border:2px solid rgba(239,68,68,0.5);cursor:pointer;transition:opacity 0.2s,transform 0.1s;box-shadow:0 0 20px rgba(239,68,68,0.25);display:flex;align-items:center;justify-content:center;gap:8px;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'">
                    <i class="fas fa-ban"></i>Log Prank Call &#8594; Sheet
                </button>
                <button onclick="clearLookup()" style="width:100%;background:none;border:none;color:#334155;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;cursor:pointer;padding:4px;" onmouseover="this.style.color='#64748b'" onmouseout="this.style.color='#334155'">
                    <i class="fas fa-times" style="margin-right:4px;"></i>Clear
                </button>
                <div id="prank-log-status" style="display:none;border-radius:10px;padding:10px 14px;font-family:'Orbitron',sans-serif;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;text-align:center;"></div>
            </div>
        </div>
        <div id="lookup-prank-result" class="hidden"></div>
        <div id="lookup-history-section" class="hidden">
            <div class="flex justify-between items-center mb-3 px-1">
                <span class="text-[10px] font-black text-slate-600 uppercase tracking-widest">Recent Lookups</span>
                <button onclick="clearHistory()" class="text-[10px] font-black text-slate-700 hover:text-red-500 uppercase tracking-widest transition-colors">Clear All</button>
            </div>
            <div id="lookup-history" class="space-y-2"></div>
        </div>
