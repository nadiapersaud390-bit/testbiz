let prevLeadCounts = {};
let leadAlertInitialized = false;
let alertViewerName = '';
let alertViewerYtelId = '';

// ── TIER 1: First lead — Breaking the Ice (100 quotes) ──
const QUOTES_FIRST_LEAD = [
  "That's how you break the ice — now keep the heat coming!",
  "First one is always the hardest. You made it look easy!",
  "The scoreboard is open! Now let's stack 'em up.",
  "Ice broken! Now let's turn up the temperature.",
  "First lead on the board — you set the tone!",
  "That's your foot in the door. Now kick it wide open!",
  "One down. The shift just got interesting.",
  "Good job getting off the mark — the momentum is yours now.",
  "You cracked it open! Keep that same energy dialing.",
  "First blood! The board belongs to you now.",
  "Great start — the hardest lead is always the first one.",
  "You're on the board! Every empire starts with one brick.",
  "That first transfer is the spark. Now light the whole room up.",
  "Boom! You're alive on the leaderboard — keep building!",
  "The ice is broken. Now let's make some waves.",
  "Lead one secured. Time to turn that into a streak.",
  "You got the first one — that's the hardest part done!",
  "Off the mark and rolling! Don't stop now.",
  "First transfer in the bag. The dial tone is your best friend.",
  "Nice work breaking through! Your next call is already waiting.",
  "That's one for the board! Keep your head down and keep dialing.",
  "One lead is all the proof you need — now get another!",
  "You broke the seal. Time to flood the board!",
  "First transfer secured! Confidence is built one call at a time.",
  "You kicked the door open. Now walk through it again and again.",
  "Step one is always the toughest. Step one: done. Now go!",
  "The board just got your name on it. Let's keep it there!",
  "That first dial that paid off — remember this feeling!",
  "You opened your account! Time to make a deposit on the next one.",
  "First transfer of the day — you're already ahead of where you started.",
  "Look at you! One lead in and already proving yourself. Keep it up.",
  "The silence before the first lead is the hardest part. You pushed through it!",
  "That's number one — now your only job is to make it not the last.",
  "You rang the bell! Don't stop swinging.",
  "First lead locked in. The rest of the shift is wide open.",
  "You're on the board and that's all that matters right now. Push for two!",
  "One lead changes everything. Now go change everything again.",
  "That first 'yes' hits different. Chase it again and again.",
  "The shift officially started when that lead transferred. Let's go!",
  "First lead of the day — you're running laps around those who haven't started.",
  "You got the ball rolling. Now keep it rolling, harder and faster.",
  "Don't stop at one. That first transfer was just the warm-up!",
  "Every rep on that board started with one. You just did yours.",
  "Great job! Now forget about that lead and go get the next one.",
  "One lead means you've figured out what works. Do it again!",
  "You broke through — now break through again, and again.",
  "That took guts. Now use those same guts on the next call.",
  "First lead is the foundation. Now build something on top of it!",
  "You started — and starting is half the battle. Finish the other half!",
  "The first one always feels special. Make the second one feel even better!",
  "Ice officially broken. Now let's see what you're really made of.",
  "Your first lead of the shift — that's how legends begin.",
  "Great execution on call number one. Call number two is waiting.",
  "You got the first one through sheer determination. Respect. Now get another.",
  "First lead secured. Confidence loaded. Fire away.",
  "That's how you start a shift — with action, not hesitation!",
  "You took the shot and it landed. Take it again!",
  "The dial tone paid off. Keep making it pay.",
  "First transfer of the day is yours! Keep building your count.",
  "You committed to the call and it worked. Keep committing.",
  "One on the board is worth a hundred excuses. No more excuses!",
  "A great shift always starts somewhere. Yours starts right here.",
  "Your very first lead today shows exactly who you are — now show us more!",
  "You turned a cold call into a hot lead. Do it again!",
  "First transfer: proof that your pitch works. Use that proof!",
  "From zero to one is the biggest jump of all. Everything after this is easier.",
  "That lead was your opening move. Now play the whole game!",
  "You've got the first W of the day. Stack more on top of it!",
  "The dial worked. The pitch worked. YOU worked. Do it again!",
  "First transfer logged — your shift has officially begun!",
  "The hardest call is the one you haven't made yet. You just proved you can do it.",
  "That's your opening statement to the floor. Make it a long speech!",
  "From silent to scoring — that's what you just did. Keep going!",
  "You broke your zero. Now let's break your personal best.",
  "Step one complete. The rest of the steps are waiting on you.",
  "That first transfer took grit. Now let grit become your identity today.",
  "You sparked it! Now fan the flame into a fire.",
  "First lead of the day means you refused to wait. That's a winner's mindset.",
  "Great start — the only direction from here is up.",
  "You didn't wait for the perfect call. You made the perfect call.",
  "One transfer logged. One step closer to owning this shift.",
  "Your name is on the board! Now let's make sure it stays there all day.",
  "That lead came from your effort and nothing else. Own it — then do it again.",
  "First one in the bag — now what are you going to do about it?",
  "You broke the ice with nothing but a phone and confidence. Respect!",
  "Starting strong is a choice. You made the right one.",
  "That's a great first step. Ten more of those and you're elite.",
  "First transfer of the shift — you're already in the top half of the room.",
  "The phone works when you do. You proved that. Now prove it again.",
  "First lead: delivered. Next task: get another one — right now.",
  "From no leads to one lead — you made the shift happen. Keep shifting!",
  "Your dial-to-transfer ratio just got a whole lot better. Keep it up!",
  "The board lights up one lead at a time. You just flipped the switch.",
  "Look at that — one lead already and the shift is barely started!",
  "You opened the gate. Now let the numbers pour through.",
  "Great job getting started! The hardest part is behind you now.",
  "First transfer of the day — you're a rep of action, not excuses.",
  "That call paid off because you made it. Never forget that.",
  "Lead one: done. The story of your shift is just beginning.",
  "You got the first one. That one is proof you can get ten more!"
];

// ── TIER 2: Building Momentum (2–3 leads, 100 quotes) ──
const QUOTES_BUILDING = [
  "Two leads in and you're already in rhythm — don't stop!",
  "Look at you building momentum! The floor is watching.",
  "You're stacking them up — this is what consistency looks like.",
  "Two transfers and climbing. Your dialer is hot right now!",
  "That's back-to-back execution. Keep the pressure on.",
  "You're finding your groove — now let's make it a pattern.",
  "Three leads? You're officially dangerous today.",
  "Momentum is everything — and you've got it. Ride it!",
  "The calls are paying off. You know what to do — keep dialing!",
  "Look at those numbers growing! You're in the zone.",
  "Two-three leads in and your confidence should be through the roof.",
  "This is what a good shift looks like. Stay focused!",
  "You're on a roll and the day isn't over yet — push harder!",
  "Every lead is proof your pitch is landing. Keep going!",
  "Back-to-back transfers — you're building something real here.",
  "That's consistent execution. The leaderboard is noticing.",
  "You're in the flow now. Don't let anything break your rhythm.",
  "Two or three might not seem like much — but it's more than most!",
  "Each transfer compounds. Stack one more and watch what happens.",
  "You're warming up the board. Keep the heat coming!",
  "That's the kind of momentum that turns an average shift into a great one.",
  "Numbers on the board and you're just getting started — let's go!",
  "You're proving your pitch works. Now prove it again.",
  "The grind is working. Don't you dare let up now.",
  "Two-three leads means you're locked in. Stay there!",
  "Two leads means your pitch is clicking. Don't fix what isn't broken!",
  "You're compounding your effort into results. Keep the compounding going.",
  "Two in and comfortable — that's when reps do dangerous things on the board.",
  "Three transfers and you're already a threat on this leaderboard.",
  "The momentum you have right now is a gift — don't waste it.",
  "Two leads down and your energy is only getting stronger. Keep going!",
  "Consistency is rare. Two-three leads shows you've got it.",
  "You've proven it once and then again. That's not luck — that's skill.",
  "Three leads means three times your pitch landed. It's working. Keep working it!",
  "The leaderboard is looking at you differently after that last lead.",
  "Two-three leads and the shift isn't half over. Where does this end up?",
  "You're stacking evidence that you know how to dial. Stack more!",
  "Each lead you add makes the next one feel more inevitable. Keep proving it.",
  "You're not on a hot streak — you're on a SKILL streak. Big difference.",
  "Three leads is the kind of pace that ends shifts with something to be proud of.",
  "The more leads you get, the more confident your next call will be. Keep building!",
  "You've already outperformed a big chunk of the floor. Don't stop there.",
  "Two-three leads in and your pitch is warming up. Full heat is coming!",
  "This is what momentum feels like — hold onto it and don't let go!",
  "Back-to-back transfers tells everyone on the floor who they should be watching.",
  "You're making the numbers happen, not waiting for them to happen. That's elite.",
  "Two leads in the bag and your confidence is contagious — spread it to the board.",
  "Consistent transfers means consistent effort. You're showing up on every call.",
  "Three leads means three times you controlled the conversation. Do it again!",
  "You're not getting lucky — you're getting good. Those are two very different things.",
  "Two-three leads shows hunger. The hungriest reps always eat well.",
  "Keep riding this wave — it's yours and the whole floor can see it.",
  "The board is starting to tell your story. Make it a good one!",
  "Two-three leads means your system is working. Trust it and keep executing.",
  "You're turning dials into dollars. Don't slow down now!",
  "Three leads already? You're running this floor right now.",
  "The pipeline is flowing because you kept the pressure on. Keep pushing!",
  "Momentum like this doesn't just happen — you built it. Keep building.",
  "Two transfers in and your mindset is clearly in the right place. Stay there!",
  "This is what it looks like when a rep is locked in. Stay locked in.",
  "Three leads means you're eating while others are still warming up their phones.",
  "You're proving with every lead that hard work converts. Don't stop proving it.",
  "Two-three leads is the sweet spot — hungry enough to push, confident enough to close.",
  "Every lead you get makes the next call easier to make. Keep building that confidence.",
  "Two-three leads and a whole lot of shift left. This could be a record day.",
  "The phones are your friend today. Keep making friends.",
  "Two leads means two conversations where YOU were better than the objection.",
  "Three in already — you're dialing with purpose and it shows.",
  "Back-to-back-to-back means you're not leaving anything on the floor today.",
  "The grind is paying off. Don't let up — the grind is just getting started!",
  "Two-three leads in and this shift is already trending upward. Push the trend!",
  "You're in a groove that most reps only dream about. Protect it with every dial.",
  "Three transfers on the board means three times the client said yes to YOU.",
  "Momentum is fragile — protect yours by making the next call right now.",
  "Two-three leads and your name is becoming a regular on that board. Keep it there.",
  "You've got the pace of a top performer today. Finish what you started.",
  "Two leads means your opener is working. Three means your close is too. Elite!",
  "The rep who goes from two to five leads is the one everyone remembers at end of shift.",
  "You're making every dial count. That's what separates good from great.",
  "Three leads and counting — this shift belongs to you if you want it.",
  "Every transfer you make today is an investment in your reputation on this floor.",
  "Two-three leads and your energy is telling on you — in the BEST way possible.",
  "The hustle is visible in your numbers. Keep the hustle alive.",
  "Three leads proves you can do this on repeat. Now prove it even more!",
  "You're dialing with purpose. The results are speaking louder than any excuse could.",
  "Two-three leads and the floor is quietly taking notice. Give them more to notice.",
  "Your work ethic is showing in your numbers today. Let it keep showing!",
  "Three leads in and the shift still has legs — how high can you take this?",
  "You've made three clients' day better today. They don't know it yet — but you do.",
  "This pace doesn't just happen — it comes from showing up on every single call.",
  "Two leads means you're a rep who delivers. Three means you deliver consistently.",
  "You're not coasting — you're building. There's a huge difference and it matters.",
  "Three transfers and still going — this is what a dominant shift looks like.",
  "The board shows two-three leads. Your work ethic shows why it's going higher.",
  "Back-to-back means you're not overthinking it — you're just doing it. Perfect.",
  "Two-three leads and the competition should be worried. Are they?",
  "You've found your rhythm. Now play it louder than anyone else on the floor.",
  "Three leads means three decisions you made correctly under pressure. Respect.",
  "Two leads in and the board is smiling at your name. Give it more reasons to smile.",
  "You're not just working the phones — you're working the room. Keep working it!"
];

// ── TIER 3: On Fire (4–5 leads, 100 quotes) ──
const QUOTES_ON_FIRE = [
  "Four-five leads?! You are absolutely on fire right now!",
  "This is elite-level dialing. You're carrying the floor!",
  "Five leads and climbing — you're the one to beat today!",
  "At this pace you're heading for a legendary shift. Don't stop!",
  "You're not just dialing — you're SELLING. What a performance!",
  "Four leads in and you're dominating the board. Stay hungry!",
  "This is what champions look like in action. Keep grinding!",
  "You've hit your stride and it shows. The leaderboard belongs to you.",
  "Five transfers?! The floor needs to learn your name today.",
  "You are in full beast mode. Do NOT let up!",
  "This pace wins shifts. You're rewriting today's story.",
  "Four-five leads means you've cracked the code. Double down!",
  "You're making it look effortless — this is pure skill on display.",
  "At this level you're not just hitting numbers — you're setting the standard.",
  "Five in? The competition is watching your number climb.",
  "You're in a zone most reps never find. Stay locked in!",
  "Call after call, transfer after transfer — this is your day!",
  "Four leads shows grit. Five leads shows greatness. What's next?",
  "You've separated yourself from the pack. Go even further!",
  "Every objection today is falling to you. Keep attacking those calls!",
  "You've got momentum, confidence, and skill firing all at once. Unstoppable!",
  "The board doesn't lie — and right now it's saying you're elite.",
  "Four-five leads is the kind of shift that gets remembered. Make it count!",
  "You're the standard on this floor right now. Own it!",
  "Half the floor wishes they were where you are. Keep building your lead!",
  "Four leads and you haven't even hit your stride yet. Imagine what's coming next!",
  "Five in and you're rewriting the expectations for this shift. Keep writing!",
  "You're on a pace that legends are built from. Don't stop now.",
  "Four leads means you are absolutely cooking right now. Keep the heat up!",
  "Five transfers already — you're not having a good shift, you're having a GREAT one.",
  "This is elite territory and you belong here. Prove it with the next dial.",
  "Four leads in and the floor is turning to watch. Give them a show!",
  "You're running hot and the board shows it. Keep the temperature up!",
  "Five transfers means five perfect conversations. You're operating at a different level.",
  "At four-five leads your shift is no longer about surviving — it's about dominating.",
  "The top of the leaderboard isn't far off. Are you going after it?",
  "Four leads and climbing — your name is the one everyone is watching.",
  "Five transfers in and you're proving that elite performance isn't an accident.",
  "You've outperformed most of the floor already. What does the rest of the day hold?",
  "Four-five leads means you're not just dialing — you're DELIVERING.",
  "Five in already and you're making it look easy. It's not easy. That's the point.",
  "Your dial count is translating into transfers at an elite level. Keep converting.",
  "Four leads says you showed up. Five leads says you showed OUT.",
  "You're in a class of your own today. No one on this floor is matching your pace.",
  "Five leads and the shift's not over — this is how record days happen!",
  "Four-five transfers means your pitch is basically a weapon at this point.",
  "You're lighting up the board and the whole floor feels the energy you're bringing.",
  "Five in and you're not done — the grind that got you here will take you further.",
  "Four leads means you're elite. Five leads means you're exceptional. What comes next?",
  "You've proven you can hit four and five. Now prove five can become ten.",
  "The scoreboard is screaming your name right now. Are you listening?",
  "Four-five leads and you haven't slowed down once. That's championship-level focus.",
  "Every one of those five transfers came from effort. Own every single one.",
  "You're in the zone where everything is clicking — don't overthink it, just keep dialing.",
  "Five leads means five times you overcame an objection. That's five wins.",
  "The rest of the floor is trying to catch up to where you already are.",
  "Four leads in — you've got the floor's attention. Now take their respect too.",
  "At five leads, you've crossed from good to great. Chase outstanding next.",
  "You're setting the pace for the entire floor right now. Run faster.",
  "Four-five in and your confidence is a weapon now. Use it on the next call.",
  "Five transfers — you're not participating in this shift anymore, you're WINNING it.",
  "The pace you're keeping right now is what turns a good day into a legendary one.",
  "Four leads proves you can do it consistently. Five proves you can keep going.",
  "You've found the formula today: dial, pitch, close, repeat.",
  "Five in and you're the example the floor manager points to when they say 'do that.'",
  "Four-five leads and the energy you're bringing is contagious. The floor feels it!",
  "You're creating your highlight reel one transfer at a time. Keep rolling the tape.",
  "At this count you're not chasing the board anymore — you're running it.",
  "Five leads means five clients who connected with your pitch. You're elite at this.",
  "Four in already and the best part? You're just getting warmed up.",
  "Five transfers shows precision. Shows skill. Shows heart. Keep showing all three.",
  "You've separated from the pack. Now put some real distance between you and them.",
  "Four-five leads means your work rate is elite. Your mindset clearly matches it.",
  "Five leads and the shift is YOURS if you want it. How badly do you want it?",
  "At this pace you're the most dangerous rep on the floor. Act like it.",
  "Four leads and counting — this is what peak performance looks like in real time.",
  "Five transfers already means you've been locked in from the first dial. Incredible!",
  "You are not slowing down. Good. Don't.",
  "Four-five leads and you haven't peaked yet — scary thought for the competition.",
  "Every one of those leads was earned through grit, skill, and discipline. Remember that.",
  "At five leads you're telling a story on that board. Make it the best story of the day.",
  "Four in and your momentum is building. The best reps let momentum work for them.",
  "Five transfers — you're doing everything right today. Don't stop doing everything right.",
  "The shift could've gone any direction. You pointed it straight to the top.",
  "Four leads means you've cracked four different conversations. You're getting good at this.",
  "Five in and counting — you're officially one of the big names on the floor today.",
  "This is the pace of a true top performer. Protect it and push it further.",
  "Four-five leads doesn't happen by accident. It happens because you chose to make it happen.",
  "You're not lucky today — you're LETHAL. Keep it going.",
  "Five leads and you're making the job look easy. It isn't. That's why we respect you.",
  "At this count your manager is watching and smiling. Give them more to smile about.",
  "Four leads in and you've got the floor on notice. Five and you've got them worried.",
  "Every rep on the floor wants to be where you are right now. Stay there.",
  "Five in and you haven't flinched once. That's mental toughness. That's a winner.",
  "Four-five leads says your closer is on fire. Your opener clearly is too.",
  "At this pace you're not just on the leaderboard — you ARE the leaderboard.",
  "Five transfers logged. The story of your shift is already incredible. Keep writing it.",
  "Four-five leads and you've got every reason in the world to make one more call. Make it."
];

// ── TIER 4: Legend Mode & Call Center Motivation (6+ leads, 100 quotes) ──
const QUOTES_LEGEND = [
  "Every dial is a new chance to change your life. Never stop calling.",
  "The phone is the only tool you need to win today. Use it.",
  "Call centers are built by reps who refuse to quit. Be that rep.",
  "Rejection isn't failure — it's just the price of the next transfer.",
  "The more you dial, the luckier you get. Keep going.",
  "In this game, consistency beats talent. Show up on every call.",
  "Every 'no' you hear is someone else's 'yes' getting closer.",
  "The best reps don't wait for motivation — they create it with every dial.",
  "Your voice is your weapon. Use it with confidence on every call.",
  "Volume solves everything. When in doubt — dial more.",
  "Top performers in this industry share one trait: they never stop dialing.",
  "A transfer isn't luck — it's the result of 20, 30, 50 dials. You earned it.",
  "The phone doesn't know you're tired. Dial like you're fresh.",
  "Your pitch gets stronger with every single call you make. Trust the process.",
  "Call centers reward one thing above all else: relentless effort. Keep it up.",
  "You're not just making calls — you're building a career one transfer at a time.",
  "Today's grind is tomorrow's glory. Every transfer counts.",
  "The top of the leaderboard is lonely — because not everyone is willing to work for it.",
  "One more dial could be the one. You'll never know unless you make it.",
  "Champions in this business are made between the rejections. Push through.",
  "A great rep doesn't wait for a hot list — they make every list hot.",
  "Stay on script, stay confident, stay dialing. Results follow the relentless.",
  "The floor is yours if you want it. What are you willing to do to take it?",
  "In sales, activity is everything. The more you do, the more you get.",
  "Your best call hasn't happened yet. Keep dialing until it does.",
  "In a call center, effort is currency. You're rich today. Keep spending.",
  "Six leads and you've officially entered the conversation for top performer of the day.",
  "The phone rings for a reason. Every rep who answers it has a chance. You're taking yours.",
  "Elite reps don't have better days — they have better standards. Yours are showing.",
  "This level of production takes guts, skill, and relentlessness. You have all three.",
  "Six-plus leads and you're running the floor now. Don't give up the lead.",
  "The best call center reps share one trait: they make one more call when others stop.",
  "You're outworking, outperforming, and outproducing the competition. Keep going.",
  "Every lead past five is a bonus that most reps never claim. You're claiming yours.",
  "A call center legend isn't born — they're built, one transfer at a time. Like you.",
  "Six leads means you stayed the course when others broke from it. Respect.",
  "The grind is a test. Every lead past six proves you're passing it.",
  "You're not just on the board — you're the board right now. Protect your position.",
  "The phone is the great equalizer. Skill and effort win. You're proving both.",
  "Six-plus leads is what happens when preparation meets relentless execution.",
  "You've built something special today. Don't leave before you've seen what it becomes.",
  "In this industry, activity always wins. You're the most active rep right now.",
  "The dial tone doesn't care how you feel. But you dial anyway. That's a pro.",
  "Six leads means the system is working because YOU are working. Keep working!",
  "Call centers don't build legends from the top — they build them from the grind. That's you.",
  "Every rep who dials enough eventually finds their rhythm. You found yours.",
  "Six-plus leads and your effort is compounding into results. Let it compound.",
  "A great call center rep knows: the next call is always the most important one.",
  "You're creating momentum that the whole floor feels. Use it. Share it. Keep building.",
  "The call center floor rewards persistence above everything else. You're being rewarded.",
  "Six-plus leads means you're showing what's possible. Others will dial harder because of you.",
  "When you stop counting and just keep dialing — that's when the numbers really take off.",
  "Every transfer you make is a result, a win, and a reminder of what you're capable of.",
  "The reps who get to 6+ leads are the ones who don't overthink between calls.",
  "Six leads means six different people heard your pitch and said yes. That's an art.",
  "You didn't wait for a good list or a good mood. You made a good day. Own it.",
  "The top performers in call centers share one secret: they dial when no one else will.",
  "Six-plus leads and you're not done. In this game you are never done.",
  "Your persistence is your pitch. Your follow-through is your close. You've got both.",
  "Six leads says you treated every call like it was the first one of the day. That's elite.",
  "The call center floor belongs to the consistent. You are consistent. You belong here.",
  "Six-plus leads means every 'no' today brought you closer to the 'yes' that just happened.",
  "You are the example of what happens when you commit to the process completely.",
  "Six leads and still going — you're what every floor manager wishes for in a rep.",
  "The transfer rate that top performers have isn't magic. It's volume plus skill.",
  "Six-plus leads means you're converting at a level that's hard to argue with.",
  "Your best shift ever is the one you're currently building. Don't stop building it.",
  "A rep with six leads is dangerous. One who keeps dialing past six is unstoppable.",
  "Call centers are built on reps like you — relentless, consistent, and results-driven.",
  "Six leads means you've mastered the art of turning conversations into conversions.",
  "Every dial is a data point. Your data today says you're exceptional.",
  "Six-plus leads and you're proving the doubters wrong with every single dial.",
  "The best call center skill isn't the pitch — it's the courage to pick up the phone after rejection.",
  "Six leads means you've outlasted every obstacle, every objection, and every slow period today.",
  "You're the rep other reps are talking about today. Make sure they can't stop talking.",
  "Six-plus leads tells the story of a rep who came to work today with a purpose.",
  "The floor has rhythms — and you found one today that's working. Ride it to the end.",
  "Persistence is what separates the good from the great. You're squarely in great.",
  "Six leads and the phones keep ringing. The difference? You keep picking up.",
  "You're building the kind of shift that gets referenced in future training sessions.",
  "Six-plus leads means you turned every rejection into fuel. You've got a full tank.",
  "The call center is a battlefield. Six leads means you've won six battles today.",
  "Your consistency today is a message to the floor: this is how it's done.",
  "Six leads — if you keep dialing at this pace, you'll be the name everyone remembers.",
  "The top of the leaderboard wasn't built in one call. You've been building it all shift.",
  "Six-plus leads means you're producing results, not excuses. That's a career.",
  "In call centers, the ones who break records do it one dial at a time. You're doing that.",
  "Six leads and counting — at this point the shift is yours. Don't give it back.",
  "You didn't just show up today — you showed UP. The board reflects every bit of your effort.",
  "Six-plus leads and the floor can feel your energy. Don't let it drop.",
  "Call centers run on transfers. You're the engine powering this floor right now.",
  "Six leads means your mindset, pitch, and effort are all aligned. That's unstoppable.",
  "The rep who makes one more call when they're tired is the rep who wins the shift.",
  "Six-plus in and you're writing history on this floor today. Make it a great story.",
  "You're not just dialing — you're delivering results that the whole team benefits from.",
  "At six leads your resolve is clear: you came here to win and you're doing exactly that.",
  "Six transfers means six perfect executions under pressure. That's mastery.",
  "You've outlasted every slow moment and every tough call today. Six leads proves it.",
  "The best investment a rep can make is one more dial. You keep making that investment.",
  "Six-plus leads and the shift isn't over. In call centers, the last hour is where legends are made."
];

function pickQuote(count, isFirst) {
  let pool;
  if (isFirst || count <= 1)   pool = QUOTES_FIRST_LEAD;
  else if (count <= 3)         pool = QUOTES_BUILDING;
  else if (count <= 5)         pool = QUOTES_ON_FIRE;
  else                         pool = QUOTES_LEGEND;
  return pool[Math.floor(Math.random() * pool.length)];
}

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

function trimTeamPrefix(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length <= 1) return String(name || '').trim();
  const first = parts[0].toUpperCase();
  if (/^[A-Z]{2,4}$/.test(first) || /^GY[BP]$/.test(first)) return parts.slice(1).join(' ');
  return String(name || '').trim();
}

function isSameAgentName(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return normalizeName(trimTeamPrefix(a)) === normalizeName(trimTeamPrefix(b));
}

function getFirstName(fullName) {
  if (!fullName) return 'Rep';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 1 && parts[0].length <= 3 && /^[A-Z]+$/.test(parts[0])) return parts[1];
  return parts[0];
}

function resolveViewerIdentity() {
  const sessionName = sessionStorage.getItem('currentAgentName') || '';
  let profileName = '', profileYtelId = '';
  try {
    const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
    if (profile) {
      profileName   = profile.name   || '';
      profileYtelId = profile.ytelId || '';
    }
  } catch (e) {}
  alertViewerName   = normalizeName(sessionName || profileName);
  alertViewerYtelId = String(profileYtelId || '').trim();
}

function isViewerAgent(agentObj) {
  if (alertViewerYtelId && agentObj.ytelId) {
    return String(agentObj.ytelId).trim() === alertViewerYtelId;
  }
  return isSameAgentName(agentObj.name || '', alertViewerName);
}

function findViewerEntry(agentsArr) {
  if (!agentsArr || !agentsArr.length) return null;
  if (alertViewerYtelId) {
    const byId = agentsArr.find(a => String(a.ytelId || '').trim() === alertViewerYtelId);
    if (byId) return byId;
  }
  if (alertViewerName) {
    return agentsArr.find(a => isSameAgentName(a.name || '', alertViewerName)) || null;
  }
  return null;
}

function checkLeadAlerts(newAgents) {
  if (!newAgents || !newAgents.length) return;

  const viewerRole = sessionStorage.getItem('bizUserRole') || 'agent';
  const isAdmin    = viewerRole === 'admin';

  resolveViewerIdentity();

  // Build snapshot keyed by agent name
  const tracker = (newAgents[0] && newAgents[0].berbiceTracker) || {};
  let snapshot = Object.keys(tracker).length ? { ...tracker } : {};
  newAgents.forEach(a => {
    if (!a || !a.name) return;
    if (snapshot[a.name] === undefined || snapshot[a.name] === null) {
      snapshot[a.name] = a.dailyLeads || 0;
    }
  });
  if (!Object.keys(snapshot).length) return;

  // ── First load: seed counts, show welcome-back for agent only ──
  if (!leadAlertInitialized) {
    Object.entries(snapshot).forEach(([n, c]) => { prevLeadCounts[n] = c; });
    leadAlertInitialized = true;

    if (!isAdmin && (alertViewerName || alertViewerYtelId)) {
      const ownAgent = findViewerEntry(newAgents);
      const ownCount = ownAgent ? (Number(ownAgent.dailyLeads) || 0) : 0;
      if (ownCount > 0) {
        const firstName = getFirstName(ownAgent.name);
        const quote     = pickQuote(ownCount, false);
        const plural    = ownCount === 1 ? '' : 's';
        _renderAlert({
          icon: ownCount === 1 ? '🥇' : '🔥',
          name: 'Welcome back, ' + firstName + '!',
          msg:  'You currently have ' + ownCount + ' lead' + plural + ' today. Keep going!',
          quote,
          firstLead: ownCount === 1
        });
      }
    }
    return;
  }

  // ── Subsequent polls: detect new leads ──
  const newReps = [];
  Object.entries(snapshot).forEach(([name, count]) => {
    const c    = Number(count) || 0;
    const prev = Number(prevLeadCounts[name]) || 0;
    if (c > prev) {
      const agentObj = newAgents.find(a => a.name === name) || { name };
      newReps.push({ name, count: c, isFirst: prev === 0, agentObj });
    }
    prevLeadCounts[name] = c;
  });

  if (!newReps.length) return;

  if (isAdmin) {
    // ── ADMIN: all simultaneous leads show together in one banner ──
    if (newReps.length === 1) {
      const { name, count, isFirst } = newReps[0];
      const firstName = getFirstName(name);
      const quote     = pickQuote(count, isFirst);
      const plural    = count === 1 ? '' : 's';
      const msg       = isFirst
        ? firstName + ' just got their FIRST lead of the day! 🥇'
        : firstName + ' just transferred — now at ' + count + ' lead' + plural + ' today! 🔥';
      _renderAlert({ icon: isFirst ? '🥇' : '🔥', name: firstName + ' — New Lead!', msg, quote, firstLead: isFirst });
    } else {
      const hasFirst  = newReps.some(r => r.isFirst);
      const icon      = hasFirst ? '🥇' : '⚡';
      const title     = newReps.length + ' New Leads Just Hit the Floor!';
      const agentList = newReps.map(r => {
        const fn     = getFirstName(r.name);
        const plural = r.count === 1 ? '' : 's';
        return r.isFirst
          ? fn + ' (1st lead! 🥇)'
          : fn + ' (' + r.count + ' lead' + plural + ')';
      }).join('  •  ');
      const maxCount = Math.max(...newReps.map(r => r.count));
      const quote    = pickQuote(maxCount, hasFirst);
      _renderAlert({ icon, name: title, msg: agentList, quote, firstLead: hasFirst });
    }
  } else {
    // ── AGENT: sees ONLY their own lead alert, nothing else ──
    if (!alertViewerName && !alertViewerYtelId) return;
    const ownReps = newReps.filter(rep => isViewerAgent(rep.agentObj));
    if (!ownReps.length) return;

    const { name, count, isFirst } = ownReps[0];
    const firstName = getFirstName(name);
    const quote     = pickQuote(count, isFirst);
    const msg       = PRIVATE_ALERT_MESSAGES[Math.floor(Math.random() * PRIVATE_ALERT_MESSAGES.length)];
    _renderAlert({ icon: isFirst ? '🥇' : '🔥', name: 'Great job, ' + firstName + '!', msg, quote, firstLead: isFirst });
  }
}

function _renderAlert({icon, name, msg, quote, firstLead = false}) {
  const banner = document.getElementById('lead-alert-banner');
  const inner  = banner.querySelector('.lab-inner');
  if (firstLead) { inner.classList.add('first-lead'); } else { inner.classList.remove('first-lead'); }
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
setInterval(updateDashboard, 10000);
