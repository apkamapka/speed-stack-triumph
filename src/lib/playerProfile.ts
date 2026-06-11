// Remembered player identity (nick / country / comment) used to prefill the
// score-submit dialog. Stored in localStorage; SSR-safe (no window at import).

const KEY = "sst.playerProfile.v1";

export type PlayerProfile = {
  nick: string;
  country: string; // ISO alpha-2
  comment: string;
};

export function loadProfile(): PlayerProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PlayerProfile>;
    if (typeof p.nick !== "string" || typeof p.country !== "string") return null;
    return {
      nick: p.nick.slice(0, 20),
      country: p.country,
      comment: typeof p.comment === "string" ? p.comment.slice(0, 140) : "",
    };
  } catch {
    return null;
  }
}

export function saveProfile(p: PlayerProfile) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage full / blocked — not critical, just skip
  }
}
