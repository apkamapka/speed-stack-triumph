// On-device high score table, persisted in the browser's localStorage.
// All access is SSR-safe: on the server (no window) reads return [] and writes are no-ops.

export type LocalScore = {
  score: number;
  lines: number;
  rounds: number;
  date: number; // epoch milliseconds
};

const STORAGE_KEY = "tetspeed.localScores";
const MAX_ENTRIES = 10;

export function loadLocalScores(): LocalScore[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is LocalScore =>
          !!e && typeof e === "object" && typeof (e as LocalScore).score === "number",
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function addLocalScore(entry: LocalScore): LocalScore[] {
  if (typeof window === "undefined") return [];
  const next = [...loadLocalScores(), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private-mode write errors
  }
  return next;
}

export function clearLocalScores(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
