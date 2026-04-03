const LEAD_ALERT_QUOTES = [
  // Original 20
  "Success is not final, failure is not fatal — it is the courage to continue that counts.",
  "The harder you work for something, the greater you'll feel when you achieve it.",
  "Don't watch the clock; do what it does. Keep going.",
  "Every transfer is proof you belong here. Keep pushing.",
  "Champions aren't made in the gym — they're made from the stuff they have inside them.",
  "You didn't come this far to only come this far.",
  "Small steps every day lead to big results. You're proving it right now.",
  "Your attitude determines your direction. Stay locked in.",
  "The top of the leaderboard has your name on it.",
  "Consistency is the secret weapon. You've got it.",
  "Momentum is everything — you just started yours.",
  "Winners find a way. You just proved you're one of them.",
  "One transfer closer to the goal. Don't stop now.",
  "The grind is real, and so is the reward. Keep dialing.",
  "Energy is contagious — you just raised the whole floor.",
  "Every call is a new opportunity. You just seized one.",
  "The best reps don't wait for motivation — they create it.",
  "You're not just sending leads, you're building your legacy.",
  "Results speak louder than words. Yours just did.",
  "Stay hungry. Stay focused. The board is watching.",

  // 100 Call Center Specific Quotes
  "Every dial is a chance to change someone's business forever.",
  "The best call center reps don't just talk — they listen, qualify, and deliver.",
  "Rejection is just redirection — the next call is your transfer.",
  "You're not just making calls, you're opening doors for business owners.",
  "A great rep turns a cold call into a warm transfer every time.",
  "The phone is your tool, your voice is your power — use both.",
  "Every no gets you closer to the yes that matters.",
  "Top reps don't hope for good calls — they create them.",
  "Your mindset before the dial determines the outcome after it.",
  "One qualified transfer can change a business owner's life — that's your job.",
  "The floor is only as good as its hardest workers — be one of them.",
  "Consistency beats talent when talent takes breaks.",
  "You have 60 seconds to earn their attention — make it count.",
  "A transfer on the board means a business got a lifeline today.",
  "Call center excellence is built rep by rep, lead by lead.",
  "The best time to make your next call is right now.",
  "Champions dial through the noise and deliver anyway.",
  "Your voice on that phone is the difference between a closed and open door.",
  "Quality calls + consistent effort = a leaderboard with your name at the top.",
  "Don't count your calls — make your calls count.",
  "Every qualified transfer is a win for you AND the business owner.",
  "The reps who dominate are the ones who don't wait for motivation.",
  "Your script is a guide — your confidence is the closer.",
  "Handle the objection, redirect the conversation, lock in the transfer.",
  "A rep who never gives up is a rep who always gets results.",
  "The floor rewards the ones who show up and push through.",
  "One more call could be your best transfer of the day.",
  "Skill gets you started, persistence keeps you going.",
  "The difference between good and great is one more dial.",
  "Every call is a new opportunity — don't carry the last one.",
  "Build your rhythm: qualify, connect, transfer, repeat.",
  "Your results today are a direct reflection of your effort right now.",
  "Stay in your lane, keep your energy up, and the board will reflect it.",
  "Objections are just questions waiting to be answered — answer them.",
  "The best reps treat every call like it's their most important one.",
  "You're building a skill set that pays off every single day.",
  "Speed matters — get to the transfer before they change their mind.",
  "Every rep who hit their goal today started with one lead.",
  "The harder you work now, the easier it gets later.",
  "Your transfers today are tomorrow's success stories.",
  "You're not just hitting numbers — you're helping businesses get funded.",
  "A focused rep on a good run is unstoppable — stay focused.",
  "When the call gets tough, that's when the real rep shows up.",
  "Trust your training, trust your script, trust your ability.",
  "Momentum is your best friend on the floor — protect it.",
  "Every transfer you send represents a business owner who needed you.",
  "The rep who qualifies fast and transfers clean always wins.",
  "Your energy through the phone is your greatest qualifying tool.",
  "Top performers don't take bad calls personally — they take the next one seriously.",
  "The leaderboard doesn't lie — effort shows up every time.",
  "Each transfer is proof that your work matters and your calls land.",
  "Stay sharp, stay focused, and the floor will notice.",
  "Great call center reps are made in the moments others give up.",
  "You earn your spot on the board one qualified transfer at a time.",
  "The call you're about to make could be your best one today.",
  "Real reps finish what they start — start a transfer, finish it.",
  "Your tone, your pace, your confidence — that's what gets the transfer.",
  "The best qualifying happens when you're genuinely curious about their business.",
  "Transfers stack up when you stop making excuses and start making calls.",
  "You belong on this floor — your results prove it every shift.",
  "Stay dialed in — the leads are there for the reps who want them.",
  "A great transfer starts with a great opener — nail it every time.",
  "You're one call away from turning this shift around.",
  "The reps who lead the board all share one trait: they never stopped.",
  "Your job is simple: qualify fast, transfer confidently, reset, repeat.",
  "When you pick up that phone, bring everything you've got.",
  "The floor has energy — yours is the one that sets the pace.",
  "Business owners need funding. You connect them. That's meaningful work.",
  "Top of the leaderboard isn't luck — it's one transfer at a time.",
  "Don't dial just to dial — dial with purpose and watch your numbers rise.",
  "Confidence on the call starts with believing in what you're offering.",
  "You're not interrupting their day — you're potentially changing their business.",
  "A rep with great energy keeps prospects on the line and gets the transfer.",
  "The fastest way to improve your numbers is to improve your next call.",
  "Work smart, work fast, and the leaderboard takes care of itself.",
  "Your best call today is the one you're about to make.",
  "When the call gets hard, lean into your training — it works.",
  "One focused hour on this floor can change your whole day.",
  "Make the call. Qualify the lead. Send the transfer. That's the formula.",
  "The reps who hit their numbers do one thing differently — they don't stop.",
  "Your commitment to quality transfers makes this floor better.",
  "Dial with intention, qualify with skill, transfer with confidence.",
  "Every single call has potential — you decide how much.",
  "The clock is running. Your competition is dialing. Are you?",
  "Top reps know this: every objection handled is a transfer earned.",
  "One more transfer and you're telling the whole floor what you're made of.",
  "Your attitude on this call will determine the outcome — choose well.",
  "When you send that transfer, someone's business just got a real shot.",
  "Keep showing up, keep dialing, keep delivering — that's how legends are built.",
  "Real call center grind looks like: dial, qualify, transfer, repeat. All day.",
  "Don't let one hard call slow down ten great ones.",
  "The rep who recovers fastest is always the one who leads the board.",
  "Your confidence is your most powerful qualifying tool — use it.",
  "Every transfer you lock in today is a win you earned with your skill.",
  "Reps who dominate know this: momentum beats motivation every time.",
  "Make your next call your best call — it's always possible.",
  "This floor is full of opportunity — and you're right in the middle of it.",
  "You don't need a perfect day. You need consistent transfers. Go get them.",
  // 30 Famous Quotes
  "The secret of getting ahead is getting started. — Mark Twain",
  "It always seems impossible until it's done. — Nelson Mandela",
  "Don't count the days, make the days count. — Muhammad Ali",
  "Hard work beats talent when talent doesn't work hard. — Tim Notke",
  "The only way to do great work is to love what you do. — Steve Jobs",
  "I find that the harder I work, the more luck I seem to have. — Thomas Jefferson",
  "You miss 100% of the shots you don't take. — Wayne Gretzky",
  "Whether you think you can or you think you can't, you're right. — Henry Ford",
  "The difference between ordinary and extraordinary is that little extra. — Jimmy Johnson",
  "Success usually comes to those who are too busy to be looking for it. — Henry David Thoreau",
  "Opportunities don't happen. You create them. — Chris Grosser",
  "Don't wish it were easier. Wish you were better. — Jim Rohn",
  "The only place where success comes before work is in the dictionary. — Vidal Sassoon",
  "If you are not willing to risk the usual, you will have to settle for the ordinary. — Jim Rohn",
  "The man who moves a mountain begins by carrying away small stones. — Confucius",
  "It's not whether you get knocked down, it's whether you get up. — Vince Lombardi",
  "Do what you can, with what you have, where you are. — Theodore Roosevelt",
  "Winning isn't everything, but wanting to win is. — Vince Lombardi",
  "The more I practice, the luckier I get. — Gary Player",
  "I've failed over and over — and that is why I succeed. — Michael Jordan",
  "Great things are done by a series of small things brought together. — Vincent Van Gogh",
  "Success is walking from failure to failure with no loss of enthusiasm. — Winston Churchill",
  "You don't have to be great to start, but you have to start to be great. — Zig Ziglar",
  "Believe you can and you're halfway there. — Theodore Roosevelt",
  "The future belongs to those who believe in the beauty of their dreams. — Eleanor Roosevelt",
  "Go as far as you can see; when you get there, you'll be able to see further. — Thomas Carlyle",
  "I never dreamed about success. I worked for it. — Estée Lauder",
  "The only limit to our realization of tomorrow is our doubts of today. — Franklin D. Roosevelt",
  "Excellence is not a destination but a continuous journey that never ends. — Brian Tracy",
  "Your time is limited, so don't waste it living someone else's life. — Steve Jobs"
];

const LEAD_ALERT_MESSAGES = [
  // Original 15
  "You're on fire! That transfer just hit the board! 🔥",
  "That's what we're talking about! Keep the energy up! ⚡",
  "Another one! You're making it look easy! 💪",
  "Locked in and getting results! That's the spirit! 🎯",
  "The leaderboard just noticed you. Keep climbing! 🚀",
  "That's a transfer! You're proving why you belong here! 🏆",
  "Yes! The hustle is paying off! Don't slow down! 💥",
  "Look at you go! Another lead sent — beast mode activated! 🦁",
  "Transfer confirmed! You're in the zone right now! ⚡",
  "That's your name on the board! Own it! 🌟",
  "One more and the floor is taking notes! Keep pushing! 🔥",
  "Dialed in and delivering! That's how it's done! 💎",
  "You just set the pace! Now let's keep it! 🏃",
  "Built different! Another transfer, another step to the top! 👑",
  "That lead is on its way! You're unstoppable right now! 🚀",
  // 50 New Messages
  "Another transfer locked in — you make this look too easy! 😤",
  "The grind never stops and neither do you! Keep going! 🔄",
  "Stack it up! Every lead is money in the bank! 💰",
  "You just moved up the board — keep that energy! 📈",
  "That's a certified banger! Another lead secured! 🎯",
  "Nobody on the floor right now harder than you! 👊",
  "Transfer after transfer — this is your day! ☀️",
  "You're not stopping and neither is that leaderboard! 🏆",
  "Ice cold under pressure and still delivering! 🧊",
  "Straight up locked in! That's elite performance right there! 🔐",
  "Another one bites the dust — lead confirmed! 😎",
  "You just made it look effortless — transfer on the board! ✨",
  "The floor is watching and you're giving them a show! 🎭",
  "Don't stop now — the board has your back! 📋",
  "You just raised the bar for everyone on the floor! 📊",
  "Transfer sent — now go get the next one! 🔁",
  "Nothing but results — that's your brand today! 💼",
  "You're running this shift right now! Pure dominance! 👑",
  "Another one down — you're in full control! 🎮",
  "That transfer just elevated your whole day! Keep stacking! 🏗️",
  "Focused, fearless, and delivering — that's you right now! 💡",
  "The phones don't scare you and the board shows it! 📞",
  "Drop after drop — you're flooding the board! 🌊",
  "That's elite rep behavior! Transfer confirmed! 🦅",
  "Built for this moment — and you just proved it! 💪",
  "Every dial is a door and you just walked through another one! 🚪",
  "You're not chasing results — you're creating them! 🛠️",
  "That's the stuff legends are made of! Keep dialing! 📖",
  "One more notch on the belt — transfer secured! 🥊",
  "You just turned a call into cash — that's the skill! 💸",
  "Relentless. Consistent. You. Keep it rolling! ⚙️",
  "Another lead hits — the floor is feeling your energy! ⚡",
  "That's called professionalism — transfer on the board! 🎩",
  "You make it look easy but we know the work behind it! 🙌",
  "Locked, loaded, and delivering — that's your vibe today! 🎯",
  "The hustle is louder than words — board update proves it! 📣",
  "You just added to your legacy — lead confirmed! 🏛️",
  "Not slowing down, not looking back — lead secured! 🏎️",
  "The clock is ticking and you're making every second count! ⏱️",
  "Rep of the day energy right here — keep pushing! 🌟",
  "You just made the leaderboard sweat — great work! 😤",
  "That call had your name written all over it! 🖊️",
  "Clutch when it counts — another transfer in! 🎯",
  "Zero hesitation, full execution — that's a transfer! ✅",
  "Another proof point that you belong at the top! 🔝",
  "You're not on a roll — you ARE the roll! 🎲",
  "Smooth operator — that transfer landed perfectly! 🎶",
  "The scoreboard agrees: you're having a great day! 🗓️",
  // 100 Call Center Specific - Regular Lead Messages
  "Dialed in and delivered — that transfer is officially on the board! 📞",
  "You just turned a conversation into a transfer — that's the skill! 🎯",
  "Phone down, lead sent — now reset and go get another one! 🔄",
  "That's what qualifying looks like! Transfer locked and loaded! ✅",
  "Another business owner connected — because of YOU! 💼",
  "You handled the objection AND got the transfer — that's elite! 🏆",
  "Transfer sent! The floor just felt that energy! ⚡",
  "That's how you work a call from open to close — beautiful! 🎶",
  "The script worked because YOU worked it! Transfer confirmed! 📋",
  "Objection handled, redirect done, transfer sent — textbook! 📖",
  "You didn't just dial — you delivered. Lead on the board! 🚀",
  "That business owner is getting funded because you stayed on the call! 💰",
  "Clean qualifier, smooth transfer — the board has your name! 🌟",
  "You just showed the floor what a great call looks like! 👀",
  "Another one sent! Your phone is your weapon and you're using it! ⚔️",
  "That transfer just wrote your name in today's story — keep going! ✍️",
  "Call center excellence — transfer confirmed, rep on fire! 🔥",
  "You didn't let go of that call and the lead proves it! 💪",
  "The leaderboard is loving you right now — keep feeding it! 📈",
  "From dial to transfer in record time — that's your speed! ⏱️",
  "Every time you send a transfer, a business gets a real opportunity! 🏢",
  "You stayed calm, you qualified, you transferred — that's the formula! 🧪",
  "Rep on a tear right now! Transfer after transfer! 🌊",
  "You made that call look easy — it's because you're good at this! 😎",
  "Transfer confirmed! The floor is taking notes on how you do it! 📝",
  "You qualify fast and transfer clean — that's a top rep right there! 👑",
  "Another lead hits! Your energy through the phone is unmatched! 📡",
  "You turned skepticism into interest and interest into a transfer! 🔄",
  "The board doesn't update itself — you just did it again! 💻",
  "That call had everything: rapport, qualification, and a clean close! 🎯",
  "Rep who doesn't stop = board that doesn't slow down! Keep it rolling! 🎲",
  "You just proved why you're on this floor — transfer locked in! 🔐",
  "Another transfer in! The business owners on your list are lucky! 🍀",
  "Zero hesitation, full commitment — that transfer landed perfectly! 🎯",
  "The phones are ringing in your favor today — answer that energy! 📲",
  "Transfer sent to the advisors — your job done, now go get the next one! ✔️",
  "You read that call perfectly and delivered the transfer! Genius! 🧠",
  "Your pace on the floor is setting the standard today! 🏃",
  "That rebuttal was smooth and the transfer was smoother! 🌊",
  "Another notch! The board is proof your effort isn't going unnoticed! 🗓️",
  "You pushed through and sent the transfer — that's what champions do! 🏅",
  "Lead logged! The floor is cheering for you right now! 🎉",
  "That call started cold and ended hot — you made that happen! 🔥",
  "You didn't rush the call and you didn't drag it — perfect execution! ⚖️",
  "Transfer confirmed! Your training is showing up in real time! 📚",
  "Another business owner is one step closer to funding because of you! 🏦",
  "You got the transfer without breaking stride — absolute pro! 👔",
  "The qualifying was tight and the transfer was right — good work! ✅",
  "Your consistency on the floor is what top reps are built on! 🏗️",
  "Transfer hit the board — your name is echoing through the floor! 📣"
];

const FIRST_LEAD_MESSAGES = [
  "First one on the board today — let's gooo! 🏆",
  "Day one, lead one — the grind has officially started! 🔥",
  "First blood of the day! Who's next?! 🩸",
  "Opening the scoreboard! That's how you start a shift! 🎯",
  "First transfer of the day is always the sweetest! 💛",
  "Zero to one — the hardest step done! Keep stacking! 🚀",
  "First one in the bag! Now don't stop there! 💪",
  "The board just woke up! First lead of the day secured! ⚡",
  "Day started RIGHT! First transfer is on the books! 📖",
  "First lead of the day — the momentum is yours now! 🌟",
  "Off zero! That's all it takes to get going! 🏃",
  "First one hits different! Now build on it! 💥",
  "Up and running! First lead locked in — don't look back! 👑",
  "One on the day! The rest of the floor just got put on notice! 👀",
  "First transfer secured! You just set the tone for today! 🎶",
  "Day started! First lead in — now chase the next one! 🦁",
  "Zero to hero — first lead of the day belongs to you! 🌠",
  "First one of the day! The grind is already paying off! 💎",
  "Early lead on the board — you're already ahead of yesterday! 📈",
  "First one down, let's see how many more you can stack today! 🃏",
  "The scoreboard is alive! First transfer of the shift is yours! ⚡",
  "First lead secured — you just told the day who's boss! 😤",
  "Off to the races! First one in the books! ",
  "First transfer of the day — the energy is set, now match it! 🔋",
  "Day one lead secured! You didn't come here to sit still! 🚀",
  "First of many today — that's the mindset, keep it locked! 🔒",
  "Board is open! First lead just dropped — who's adding theirs?! 🙌",
  "One on the day! Small start, big finish — let's go! 🌅",
  "First lead = first step to the top today. Keep climbing! 🧗",
  "You broke the ice! First transfer is done — now flood the board! 🌊",
  // 100 Call Center Specific - First Lead Messages
  "First transfer of the day — you broke the seal! Now stack them! 🔓",
  "Day officially started! First lead on the board from YOU! 📞",
  "First dial to first transfer — that's how you open a shift! 🌅",
  "You're on the board before most people are even warmed up! ⚡",
  "First transfer in — the floor just woke up and it's because of you! 🔔",
  "Day one lead secured! This shift just got real! 💼",
  "First qualifier of the day goes to you — keep that energy alive! 🏆",
  "You didn't let the morning slow you down — first transfer confirmed! ☀️",
  "Off zero! First lead of the day belongs to the rep who didn't wait! 🏃",
  "First transfer sent — you just set the pace for the whole floor! 🎯",
  "The scoreboard just opened and your name is already on it! 📋",
  "You couldn't wait to get started — first transfer proves it! 🔥",
  "First one in is the hardest — and you just made it look easy! 💪",
  "That first lead of the day changes everything — now don't stop! 📈",
  "You came here to work and the board already knows it — first lead in! 🎉",
  "First transfer of the shift goes to the rep who picks up and dials first! 📲",
  "Zero to one — you just crossed the hardest line of the day! 🚧",
  "First lead secured! The rest of the floor is watching now! 👀",
  "You started your day the right way — first transfer confirmed! ✅",
  "First qualifier of the shift! Now double it, then triple it! 🔢",
  "First transfer of the day logged! Your shift has officially begun! 🕐",
  "That first lead always feels good — remember this feeling all day! 💡",
  "First one on the board and the shift isn't even warmed up yet! 🌡️",
  "You're already ahead of where you were yesterday — first lead in! 📊",
  "First transfer of the day means momentum is officially yours now! 🏄",
  "Board opened! First name up? Yours. Now let's go! 🏁",
  "You dialed, you qualified, you transferred — all before most reps settle in! ⏰",
  "First transfer in the books — now your only job is to add more! ➕",
  "You started strong and that's exactly how champions get built! 💎",
  "First lead of the day is yours — now make it the first of many! 🌟",
  "First transfer confirmed! The advisors love hearing your name already! 📡",
  "You opened the board — now let's fill it! First lead done! 🖊️",
  "Starting the day right takes discipline — you just showed you have it! 🧠",
  "Your first transfer today is proof you came here ready to work! 🔑",
  "First transfer sent — you just set the tone for your entire shift! 🎶",
  "Zero to hero in record time — first lead locked and confirmed! 🦸",
  "First transfer of the day! Your call started someone's funding journey! 🏦",
  "The board has a new name up first — and it's yours! Own it! 👑",
  "First one down before the shift gets going — that's called hunger! 🍽️",
  "You didn't need a warmup — you came ready! First transfer in! 💥",
  "First transfer confirmed! The floor energy just shifted in your direction! 🌬️",
  "You're always the rep who starts fast — and today proves it again! 🚀",
  "First lead of the day goes to the rep who doesn't hit snooze on their goals! ⏰",
  "One transfer down, the rest of the day to build on it — let's go! 🧱",
  "First transfer in = you just told today who's running things! 😤",
  "The board is live and you put the first mark on it — beautiful! 🖼️",
  "First lead secured! This is going to be a good shift — keep going! 🌈",
  "You didn't wait for the floor to heat up — you heated it yourself! 🌡️",
  "First transfer of the day confirmed! Your advisors are already impressed! 🎖️",
  "First lead in and the day is young — imagine where this ends up! 🔭"
];

const TWO_LEAD_MESSAGES = [
  "TWO on the board! You're not slowing down — double confirmed! 🔥🔥",
  "2 transfers in! You just told the floor you mean business today! 💼",
  "Back to back! Second transfer locked — the rhythm is yours now! 🎶",
  "Two and climbing! The advisors are loving your name right now! 📞",
  "Second transfer of the day — you're already in beast mode! 🦁",
  "2 leads down and the shift is wide open! Keep stacking! 📈",
  "Double digits on the way — second transfer confirmed! ✌️",
  "Two transfers! You're building something special today! 🏗️",
  "Second one in! You went from first lead to momentum — fast! ⚡",
  "2 on the board! You're showing the floor how it's done! 👀",
  "Back-to-back transfers — that's the mark of a rep locked in! 🔐",
  "Two and going! The leaderboard is paying attention to you! 📋",
  "Second transfer secured! The floor has noticed your pace! 👁️",
  "2 leads confirmed! You're officially on a run — don't break it! 🏃",
  "Double transfer day! You came here to work and work you did! 💪",
  "Two on the board — your shift is building beautifully! 🌅",
  "Second one sent! Your confidence on the call is showing! 🎯",
  "2 transfers and climbing — the advisors know your name today! 🏆",
  "Back-to-back! You found your rhythm and you're not letting go! 🎵",
  "Two leads in — you're showing everyone what consistent looks like! 🔄"
];

const THREE_PLUS_LEAD_MESSAGES = [
  "THREE or more! You're officially dominating this shift! 👑",
  "3+ transfers and you're not done yet! This is your floor today! 🏆",
  "Multiple transfers locked in — you're running the board right now! 📊",
  "3 or more leads! Elite rep behavior — pure and simple! 💎",
  "You're not just on the board — you're leading it! Keep going! 🥇",
  "Three-plus and counting! The floor is watching a master at work! 🎓",
  "Multiple transfers in! You've moved from rep to LEGEND today! 🌟",
  "3+ on the board! Call center greatness is happening right now! 🔥",
  "You're stacking transfers like a pro — because you ARE one! 💼",
  "Three or more leads today? The leaderboard has your name LOUD! 📣",
  "Multiple transfers locked! You came, you dialed, you conquered! ⚔️",
  "3+ confirmed! You've set the pace for the entire floor today! 🏁",
  "You're in elite territory now — three or more transfers and climbing! 🧗",
  "Multiple transfers on the board — your work ethic is unmatched! 🔋",
  "3 or more leads! The advisors can't get enough of your name today! 📡",
  "You're putting on a clinic! Three-plus transfers and still going! 🎪",
  "Three or more! You turned today's shift into something memorable! 🎬",
  "Multiple transfers in! You've earned every single one with skill! 🏅",
  "3+ on the board — you belong at the top and you're proving it! ⬆️",
  "Three-plus transfers! The floor knows, the board shows, you GLOW! ✨"
];

let prevLeadCounts = {};
let leadAlertInitialized = false;
let alertViewerName = '';
const PRIVATE_ALERT_MESSAGES = [
  "Great transfer! Keep your momentum going. 🔥",
  "You're doing excellent work — stay focused and keep dialing. ⚡",
  "Strong result just now. Keep that same energy! 💪",
  "Nice job! Keep pushing and finish the shift strong. 🚀",
  "Beautiful execution on that call — keep it rolling. 🎯"
];

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getFirstName(fullName) {
  if (!fullName) return 'Rep';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 1 && parts[0].length <= 3 && /^[A-Z]+$/.test(parts[0])) return parts[1];
  return parts[0];
}

function checkLeadAlerts(newAgents) {
  if (!newAgents || !newAgents.length) return;
  const viewerRole = sessionStorage.getItem('bizUserRole') || 'agent';
  alertViewerName = normalizeName(sessionStorage.getItem('currentAgentName'));

  // Use berbiceTracker if available, else fall back to BB dailyLeads
  const tracker = (newAgents[0] && newAgents[0].berbiceTracker) || {};
  let snapshot = Object.keys(tracker).length ? tracker : {};
  if (!Object.keys(snapshot).length) {
    newAgents.forEach(a => {
      if ((a.team || getTeam(a.name)) === 'PR') snapshot[a.name] = a.dailyLeads || 0;
    });
  }
  if (!Object.keys(snapshot).length) return;

  // First load — store silently, no alerts
  if (!leadAlertInitialized) {
    Object.entries(snapshot).forEach(([n, c]) => { prevLeadCounts[n] = c; });
    leadAlertInitialized = true;
    return;
  }

  // Find reps with new leads
  const newReps = [];
  Object.entries(snapshot).forEach(([name, count]) => {
    const c = Number(count) || 0;
    const prev = Number(prevLeadCounts[name]) || 0;
    if (c > prev) newReps.push({ name, count: c, isFirst: prev === 0 });
    prevLeadCounts[name] = c;
  });

  if (viewerRole !== 'admin') {
    if (!alertViewerName) return;
    newReps.splice(0, newReps.length, ...newReps.filter(rep => normalizeName(rep.name) === alertViewerName));
  }
  if (!newReps.length) return;

  if (newReps.length === 1) {
    const { name, isFirst } = newReps[0];
    const firstName = getFirstName(name);
    const quote = LEAD_ALERT_QUOTES[Math.floor(Math.random() * LEAD_ALERT_QUOTES.length)];
    const msg = PRIVATE_ALERT_MESSAGES[Math.floor(Math.random() * PRIVATE_ALERT_MESSAGES.length)];
    _renderAlert({ icon: isFirst ? '🥇' : '🔥', name: 'Great job, ' + firstName + '!', msg, quote, firstLead: isFirst });
  } else {
    const hasFirstLeads = newReps.some(r => r.isFirst);
    const names = newReps.map(r => getFirstName(r.name));
    const nameStr = names.length === 2 ? names[0] + ' & ' + names[1]
      : names.slice(0,-1).join(', ') + ' & ' + names[names.length-1];
    const quote = LEAD_ALERT_QUOTES[Math.floor(Math.random() * LEAD_ALERT_QUOTES.length)];
    if (hasFirstLeads) {
      _renderAlert({ icon: '🥇', name: nameStr + ' hit the board!', msg: "Multiple reps getting their first lead of the day — the floor is heating up! 🔥", quote, firstLead: true });
    } else {
      _renderAlert({ icon: '⚡', name: nameStr + '!', msg: "Look at the team go! Everyone's putting up numbers! 💪", quote, firstLead: false });
    }
  }
}

function _renderAlert({icon, name, msg, quote, firstLead=false}) {
  const banner = document.getElementById('lead-alert-banner');
  const inner = banner.querySelector('.lab-inner');
  // Swap gold style for first lead, purple for regular
  if (firstLead) { inner.classList.add('first-lead'); } else { inner.classList.remove('first-lead'); }
  // Update content first, then show
  document.querySelector('.lab-icon').textContent = icon;
  document.getElementById('lab-text').innerHTML =
    escapeHtml(name) + '<span>' + escapeHtml(msg) + ' — ❭' + escapeHtml(quote) + '❮</span>';
  banner.classList.add('show');
  document.body.style.paddingTop = '72px';
  startTabBlink(icon + ' ' + name + (firstLead ? ' — First Lead Today!' : ' — New Lead!'));
}

function dismissLeadAlert() {
  document.getElementById('lead-alert-banner').classList.remove('show');
  document.body.style.paddingTop = '';
  stopTabBlink();
}

updateDashboard();
setInterval(updateDashboard,30000);
