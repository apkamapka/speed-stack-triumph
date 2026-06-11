// Global leaderboard access (Firestore). All functions are client-side only —
// call them from event handlers or effects, never during SSR.

import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { cleanText, containsProfanity } from "./profanity";

const SCORES = "scores";

export type ScoreInput = {
  nick: string;
  country: string; // ISO alpha-2, validated by the picker
  comment: string;
  score: number;
  lines: number;
  rounds: number;
};

export type GlobalScore = {
  id: string;
  nick: string;
  country: string;
  comment: string;
  score: number;
  lines: number;
  rounds: number;
};

// Writes one score document. Throws on validation failure or network error.
export async function submitScore(input: ScoreInput): Promise<void> {
  const nick = cleanText(input.nick).trim().slice(0, 20);
  if (!nick || /^\*+$/.test(nick)) {
    throw new Error("Please choose a different nickname.");
  }
  if (containsProfanity(input.country)) {
    throw new Error("Invalid country.");
  }
  const comment = cleanText(input.comment).trim().slice(0, 140);

  await addDoc(collection(getDb(), SCORES), {
    nick,
    country: input.country,
    comment,
    score: Math.max(0, Math.floor(input.score)),
    lines: Math.max(0, Math.floor(input.lines)),
    rounds: Math.max(0, Math.floor(input.rounds)),
    createdAt: serverTimestamp(),
  });
}

// Reads the global top 100, highest score first.
export async function fetchTop100(): Promise<GlobalScore[]> {
  const q = query(collection(getDb(), SCORES), orderBy("score", "desc"), limit(100));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const x = d.data() as Omit<GlobalScore, "id">;
    return { id: d.id, ...x };
  });
}

// Minimum score needed to enter the top 100. Returns null when the board has
// fewer than 100 entries — then any score > 0 qualifies.
export async function fetchTop100Cutoff(): Promise<number | null> {
  const q = query(collection(getDb(), SCORES), orderBy("score", "desc"), limit(100));
  const snap = await getDocs(q);
  if (snap.size < 100) return null;
  const last = snap.docs[snap.size - 1].data() as { score?: number };
  return typeof last.score === "number" ? last.score : null;
}
