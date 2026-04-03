import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getDatabase, ref, onValue, set, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

  // ⚠️ SETUP INSTRUCTIONS:
  // 1. Go to https://console.firebase.google.com
  // 2. Create a free project → Add a Web App → Copy your config below
  // 3. In the left panel → Build → Realtime Database → Create database (start in test mode)
  // Replace the placeholder config below with YOUR Firebase config:
  const firebaseConfig = {
    apiKey: "AIzaSyA5u7B8UJQOFG8yhE0YKWCiWCHQgaNu1mY",
    authDomain: "biz-dashboard-4396c.firebaseapp.com",
    databaseURL: "https://biz-dashboard-4396c-default-rtdb.firebaseio.com",
    projectId: "biz-dashboard-4396c",
    storageBucket: "biz-dashboard-4396c.firebasestorage.app",
    messagingSenderId: "394155720592",
    appId: "1:394155720592:web:b85a142cf8c885726b3d15",
    measurementId: "G-VMMZWCMLBR"
  };

  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const broadcastRef = ref(db, 'broadcast');
  const triviaRef = ref(db, 'trivia_scores');

  // Listen for broadcast messages in real-time
  onValue(broadcastRef, (snapshot) => {
    const data = snapshot.val();
    if (data && data.message && data.active) {
      showBroadcastBar(data.message);
    } else {
      hideBroadcastBar();
    }
  });

  // Listen for trivia scores in real-time — updates leaderboard for everyone
  onValue(triviaRef, (snapshot) => {
    const data = snapshot.val();
    window._triviaFirebaseScores = data || {};
    renderTriviaLeaderboard();
  });

  // Expose send/clear functions to global scope
  window._fbSendBroadcast = async (msg) => {
    await set(broadcastRef, { message: msg, active: true, ts: Date.now() });
  };
  window._fbClearBroadcast = async () => {
    await remove(broadcastRef);
  };
  window._fbSaveTriviaScore = async (roundKey, entry) => {
    const entryRef = ref(db, `trivia_scores/${roundKey}/${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
    await set(entryRef, entry);
  };