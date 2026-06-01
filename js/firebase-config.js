// js/firebase-config.js
// REPLACE with your own Firebase project config from Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyA5u7B8UJQOFG8yhE0YKWCiWCHQgaNu1mY",
  authDomain: "biz-dashboard-4396c.firebaseapp.com",
  projectId: "biz-dashboard-4396c",
  storageBucket: "biz-dashboard-4396c.firebasestorage.app",
  messagingSenderId: "394155720592",
  appId: "1:394155720592:web:b85a142cf8c885726b3d15"
};

// Initialize Firebase (only once)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
