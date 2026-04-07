import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, set, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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

onValue(broadcastRef, (snapshot) => {
  const data = snapshot.val();
  if (data && data.message && data.active) {
    showBroadcastBar(data.message);
  } else {
    hideBroadcastBar();
  }
});

onValue(triviaRef, (snapshot) => {
  const data = snapshot.val();
  window._triviaFirebaseScores = data || {};
  renderTriviaLeaderboard();
});

window._fbSendBroadcast = async (msg) => {
  await set(broadcastRef, { message: msg, active: true, ts: Date.now() });
};

window._fbClearBroadcast = async () => {
  await remove(broadcastRef);
};

window._fbSaveTriviaScore = async (roundKey, entry) => {
  const entryRef = ref(db, `trivia_scores/${roundKey}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  await set(entryRef, entry);
};

// Fire after Firebase listeners are all set up
window.dispatchEvent(new Event('firebase-ready'));
