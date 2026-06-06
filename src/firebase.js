import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// ══ Firebase Config ══════════════════════════════════════════════════════════
// من Firebase Console → Project Settings → Your apps
const firebaseConfig = {
  apiKey: "AIzaSyARoYOXDr9WX8RaLMhdSGukmurSwo9U5Y0",
  authDomain: "commission-a1260.firebaseapp.com",
  projectId: "commission-a1260",
  storageBucket: "commission-a1260.firebasestorage.app",
  messagingSenderId: "80318243656",
  appId: "1:80318243656:web:45cb85b61739e3a0b8097d",
  measurementId: "G-Z3B3V8T25Y"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
