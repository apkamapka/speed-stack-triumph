// Firebase initialization. SSR-safe: nothing touches the network at import time.
// The web config is NOT a secret — security is enforced by Firestore Security Rules
// (see firestore.rules in the repo root), not by hiding these values.

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

let _db: Firestore | null = null;

// Lazy init: only runs the first time a Firestore call is made (client-side,
// from an event handler or effect). Keeps SSR/prerender free of Firebase.
export function getDb(): Firestore {
  if (_db) return _db;
  const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  try {
    // Auto-detect long-polling: if the default streaming transport is blocked
    // (some antivirus / proxy / VPN setups break it), Firestore falls back to
    // long-polling instead of hanging forever. Safe to keep on permanently.
    _db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch {
    // initializeFirestore throws if Firestore was already initialized (e.g. HMR).
    _db = getFirestore(app);
  }
  return _db;
}
