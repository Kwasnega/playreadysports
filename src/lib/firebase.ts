import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCWsbhNzvBUR2eQT6jjtMCFKIxeyfax9LY",
  authDomain: "playreadysports-f910a.firebaseapp.com",
  databaseURL: "https://playreadysports-f910a-default-rtdb.firebaseio.com",
  projectId: "playreadysports-f910a",
  storageBucket: "playreadysports-f910a.firebasestorage.app",
  messagingSenderId: "838683677196",
  appId: "1:838683677196:web:99030681eb69499f6cd429",
  measurementId: "G-X8XC1XB8VS",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
// Persist sessions across reloads / tabs.
setPersistence(auth, browserLocalPersistence).catch(() => {});

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const db = getFirestore(firebaseApp);