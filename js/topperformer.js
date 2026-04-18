
// ===== TOP PERFORMER AUTO-POPUP SYSTEM =====
let tpConfettiParticles = [];
let tpConfettiFrame = null;
let tpLastShownHour = -1;

function getGuyanaHour() {
  return parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/Guyana', hour: 'numeric', hour12: false }));
}
function getGuyanaMinute() {
  return parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/Guyana', minute: 'numeric' }));
}

function checkTopPerformerSchedule() {
  const hour = getGuyanaHour();
  const min = getGuyanaMinute();
  // Fire every 2 hours from 12pm to 8pm: 12, 14, 16, 18, 20
  const triggerHours = [12, 14, 16, 18, 20];
  if (triggerHours.includes(hour) && min === 0 && tpLastShownHour !== hour) {
    tpLastShownHour = hour;
    showTopPerformerPopup();
  }
}

function showTopPerformerPopup(manualTrigger = false, daySnap = null) {
  let sorted, titleLabel;

  if (daySnap) {
    // Previous day mode — top 5 only
    sorted = [...(daySnap.agents || [])]
      .filter(a => a.name && (a.leads || 0) > 0)
      .sort((a, b) => (b.leads || 0) - (a.leads || 0))
      .slice(0, 5);
    titleLabel = `🏆 ${daySnap.dayName || 'Previous Day'} — Top 5`;
  } else {
    // Live daily mode
    sorted = [...agents]
      .filter(a => a.name && (a.dailyLeads || 0) > 0)
      .sort((a, b) => (b.dailyLeads || 0) - (a.dailyLeads || 0));
    if (!sorted.length && !manualTrigger) return;
    const hour = getGuyanaHour();
    const period = hour < 12 ? 'Morning' : hour < 16 ? 'Afternoon' : 'Evening';
    titleLabel = `🔥 ${period} Standings`;
  }

  document.getElementById('tp-time-label').textContent = titleLabel;

  const medals = ['🥇','🥈','🥉'];
  const rowColors = [
    'background:linear-gradient(90deg,rgba(255,215,0,0.12),rgba(255,140,0,0.08));border:1px solid rgba(255,215,0,0.25);',
    'background:linear-gradient(90deg,rgba(192,192,192,0.1),rgba(192,192,192,0.04));border:1px solid rgba(192,192,192,0.2);',
    'background:linear-gradient(90deg,rgba(205,127,50,0.1),rgba(205,127,50,0.04));border:1px solid rgba(205,127,50,0.2);',
  ];
  const scoreColors = ['#FFD700','#C0C0C0','#CD7F32'];

  const list = document.getElementById('tp-list');
  const display = daySnap ? sorted : sorted.slice(0, 10);

  if (!display.length) {
    list.innerHTML = '<div style="text-align:center;padding:30px;font-family:\'Boogaloo\',cursive;font-size:16px;color:#475569;">No leads recorded yet — keep pushing! 💪</div>';
  } else {
    list.innerHTML = display.map((a, i) => {
      const style = rowColors[i] || 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);';
      const color = scoreColors[i] || '#64748b';
      const medal = medals[i] || `<span style="font-family:Orbitron,sans-serif;font-size:12px;font-weight:900;color:#475569;">#${i+1}</span>`;
      const leads = daySnap ? (a.leads || 0) : (a.dailyLeads || 0);
      return `<div class="tp-row" style="${style}animation-delay:${i*0.08}s;">
        <div class="tp-rank">${medal}</div>
        <div class="tp-name">${escapeHtml(a.name)}</div>
        <div style="text-align:right;">
          <div class="tp-score" style="color:${color};">${leads}</div>
          <div class="tp-label">leads</div>
        </div>
      </div>`;
    }).join('');
  }

  document.getElementById('top-performer-modal').classList.remove('hidden');
  startTpConfetti();
  startTabBlink('👑 Top Performers!');
}

function closeTopPerformer() {
  document.getElementById('top-performer-modal').classList.add('hidden');
  stopTpConfetti();
  stopTabBlink();
}

function startTpConfetti() {
  const canvas = document.getElementById('tp-confetti-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#FFD700','#FFA500','#FF6B00','#FF2D78','#00F5FF','#39FF14','#a855f7','#3b82f6'];
  tpConfettiParticles = Array.from({length:120},()=>({
    x:Math.random()*canvas.width, y:Math.random()*canvas.height - canvas.height,
    r:Math.random()*7+3, color:colors[Math.floor(Math.random()*colors.length)],
    tiltAngle:0, tiltSpeed:Math.random()*0.1+0.05,
    speed:Math.random()*3+1.5, opacity:Math.random()*0.6+0.4,
    shape:Math.random()>0.5?'rect':'circle'
  }));
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    tpConfettiParticles.forEach(p=>{
      ctx.save();ctx.globalAlpha=p.opacity;ctx.fillStyle=p.color;
      ctx.translate(p.x,p.y);ctx.rotate(p.tiltAngle);
      if(p.shape==='rect'){ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r*2);}
      else{ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.fill();}
      ctx.restore();
      p.y+=p.speed;p.tiltAngle+=p.tiltSpeed;p.x+=Math.sin(p.tiltAngle)*1.5;
      if(p.y>canvas.height){p.y=-10;p.x=Math.random()*canvas.width;}
    });
    tpConfettiFrame=requestAnimationFrame(draw);
  }
  draw();
  setTimeout(stopTpConfetti,8000);
}

function stopTpConfetti(){
  if(tpConfettiFrame){cancelAnimationFrame(tpConfettiFrame);tpConfettiFrame=null;}
  const canvas=document.getElementById('tp-confetti-canvas');
  canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
}

// Check every minute
setInterval(checkTopPerformerSchedule, 60000);
