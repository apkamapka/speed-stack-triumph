// Courtesy profanity filter. Intentionally simple: it masks a small wordlist
// after light normalization (leet/diacritics). It is EASY to bypass — treat it
// as a first line, with manual moderation (deleting documents in the Firebase
// console) as the real enforcement. Extend BAD_WORDS as needed.

const BAD_WORDS = [
  // Polish
  "kurwa",
  "chuj",
  "huj",
  "jebac",
  "jebać",
  "pierdol",
  "spierdalaj",
  "skurwysyn",
  "cipa",
  "dziwka",
  "pizda",
  "kutas",
  "debil",
  // English
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "dick",
  "bastard",
];

// Map common leet substitutions back to letters so "ku4wa" / "sh1t" get caught.
const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics (ó -> o, ł stays handled below)
    .replace(/ł/g, "l")
    .replace(/[0134578@$]/g, (c) => LEET[c] ?? c);
}

export function containsProfanity(text: string): boolean {
  const norm = normalize(text);
  return BAD_WORDS.some((w) => norm.includes(w));
}

// Masks any matched word in the ORIGINAL string (length-preserving, case-insensitive).
export function cleanText(text: string): string {
  let out = text;
  for (const w of BAD_WORDS) {
    out = out.replace(new RegExp(escapeRegExp(w), "gi"), "*".repeat(w.length));
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
