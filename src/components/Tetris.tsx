import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalScore } from "@/lib/localScores";
import { loadLocalScores } from "@/lib/localScores";
import { ScoreSubmitDialog } from "@/components/ScoreSubmitDialog";
import { fetchTop100Cutoff } from "@/lib/globalScores";
import { sfx, unlockAudio, isMuted, setMuted } from "@/lib/sounds";

const COLS = 10;
const ROWS = 20;
const TOTAL_ROUNDS = 10;
const ROUND_SECONDS = 120;
const MULTIPLIER_SECONDS = 20;
const LOCK_DELAY_MS = 300; // grace window after the piece touches down
const MAX_LOCK_RESETS = 2; // how many times moving/rotating can extend the window
const FLASH_MS = 140; // line-clear flash duration
const DAS_MS = 170; // hold delay before a touch button starts auto-repeating
const ARR_MS = 55; // auto-repeat rate while holding

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

// Per-round multiplier pools (10 values each). Calibrated so max(mult) × speed ≤ 15.
// Early rounds: chunky (×2–×15). Late rounds: fine-grained (×0.9–×1.5).
const MULTIPLIER_POOLS: Record<number, number[]> = {
  1:  [2, 3, 4, 5, 6, 7, 8, 10, 12, 15],
  2:  [1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 7.5],
  3:  [1.3, 1.5, 1.8, 2, 2.5, 3, 3.5, 4, 4.5, 5],
  4:  [1.2, 1.3, 1.5, 1.8, 2, 2.3, 2.6, 3, 3.5, 3.75],
  5:  [1.1, 1.2, 1.3, 1.5, 1.7, 1.9, 2.1, 2.4, 2.7, 3],
  6:  [0.9, 1.1, 1.2, 1.3, 1.45, 1.6, 1.8, 2, 2.2, 2.5],
  7:  [0.9, 1.05, 1.1, 1.2, 1.3, 1.4, 1.5, 1.65, 1.85, 2.1],
  8:  [0.9, 1.0, 1.05, 1.1, 1.2, 1.3, 1.4, 1.5, 1.65, 1.85],
  9:  [0.9, 0.95, 1.05, 1.1, 1.15, 1.2, 1.25, 1.35, 1.5, 1.65],
  10: [0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.4, 1.5],
};

// We display 9 multiplier slots (the NEXT-piece preview takes the 10th slot).
// To keep the carefully-calibrated pools as the single source of truth, we
// derive a 9-value pool by dropping one mid-range value. The floor (entry
// multiplier) and the deliberate per-round ceiling (e.g. ×15 in round 1) are
// preserved. Change DROPPED_MULT_INDEX to remove a different value instead.
const DROPPED_MULT_INDEX = 6;

function poolForRound(round: number): number[] {
  const base = MULTIPLIER_POOLS[round] ?? MULTIPLIER_POOLS[10];
  return [...base.slice(0, DROPPED_MULT_INDEX), ...base.slice(DROPPED_MULT_INDEX + 1)];
}

function fmtMult(n: number): string {
  return Number.isInteger(n) ? `×${n}` : `×${n.toFixed(2).replace(/\.?0+$/, "")}`;
}

function fmtSpeed(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

type CellValue = 0 | TetrominoKey;
type TetrominoKey = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

const COLORS: Record<TetrominoKey, string> = {
  I: "var(--t-i)",
  O: "var(--t-o)",
  T: "var(--t-t)",
  S: "var(--t-s)",
  Z: "var(--t-z)",
  J: "var(--t-j)",
  L: "var(--t-l)",
};

// Rotation states for each tetromino (list of [x,y] offsets)
const SHAPES: Record<TetrominoKey, ReadonlyArray<ReadonlyArray<[number, number]>>> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

const KEYS: TetrominoKey[] = ["I", "O", "T", "S", "Z", "J", "L"];

type Piece = {
  key: TetrominoKey;
  rotation: number;
  x: number;
  y: number;
};

function emptyBoard(): CellValue[][] {
  return Array.from({ length: ROWS }, () => Array<CellValue>(COLS).fill(0));
}

// 7-bag randomizer: every run of 7 pieces contains each tetromino exactly once,
// so droughts (e.g. no I-piece for 30 spawns) cannot happen.
let bag: TetrominoKey[] = [];

function resetBag() {
  bag = [];
}

function nextFromBag(): Piece {
  if (bag.length === 0) {
    bag = [...KEYS];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  const key = bag.pop()!;
  return { key, rotation: 0, x: 3, y: -1 };
}

function getCells(p: Piece): [number, number][] {
  return SHAPES[p.key][p.rotation % 4].map(([x, y]) => [p.x + x, p.y + y]);
}

function collides(board: CellValue[][], p: Piece): boolean {
  for (const [x, y] of getCells(p)) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y >= 0 && board[y][x] !== 0) return true;
  }
  return false;
}

function merge(board: CellValue[][], p: Piece): CellValue[][] {
  const next = board.map((r) => r.slice());
  for (const [x, y] of getCells(p)) {
    if (y >= 0 && y < ROWS && x >= 0 && x < COLS) next[y][x] = p.key;
  }
  return next;
}

function clearLines(board: CellValue[][]): { board: CellValue[][]; cleared: number } {
  const kept = board.filter((row) => row.some((c) => c === 0));
  const cleared = ROWS - kept.length;
  const empties = Array.from({ length: cleared }, () => Array<CellValue>(COLS).fill(0));
  return { board: [...empties, ...kept], cleared };
}

// Gravity interval in ms based on speed (1..20). Speed 1 ≈ 800ms, speed 20 ≈ 50ms.
function gravityMs(speed: number): number {
  const clamped = Math.max(1, Math.min(20, speed));
  return Math.round(800 * Math.pow(0.78, clamped - 1));
}

type TetrisProps = {
  onExit: () => void;
  onSaveScore: (entry: LocalScore) => void;
};

export function Tetris({ onExit, onSaveScore }: TetrisProps) {
  const [board, setBoard] = useState<CellValue[][]>(emptyBoard);
  const [piece, setPiece] = useState<Piece>(() => nextFromBag());
  const [nextPiece, setNextPiece] = useState<Piece>(() => nextFromBag());
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [round, setRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [roundOver, setRoundOver] = useState<null | "time" | "topout">(null);
  const [matchOver, setMatchOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  // null = still checking against the global top 100; true/false = verdict
  const [qualified, setQualified] = useState<boolean | null>(null);
  // 3-2-1-GO before each round; null = round running
  const [countdown, setCountdown] = useState<number | null>(3);
  const [muted, setMutedState] = useState(true); // true until synced from localStorage
  const [shake, setShake] = useState(false);
  const [popup, setPopup] = useState<{ id: number; text: string } | null>(null);
  const [isPersonalBest, setIsPersonalBest] = useState(false);
  const [multiplierActive, setMultiplierActive] = useState(false);
  const [multiplierTimeLeft, setMultiplierTimeLeft] = useState(0);
  const [usedMultIdx, setUsedMultIdx] = useState<number[]>([]);
  const [activeMultValue, setActiveMultValue] = useState<number>(1);
  // Rows currently flashing white before they collapse (line-clear animation).
  const [flashRows, setFlashRows] = useState<number[]>([]);

  const speed = round;

  const boardRef = useRef(board);
  const pieceRef = useRef(piece);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  const roundOverRef = useRef(roundOver);
  const multiplierActiveRef = useRef(multiplierActive);
  const multiplierValueRef = useRef(1);
  const savedRef = useRef(false);
  // true while the line-clear flash is playing — input and gravity are frozen
  const clearingRef = useRef(false);
  // lock delay: when the piece is grounded, it locks only after the deadline passes
  const lockDelayRef = useRef<{ deadline: number; resets: number } | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(countdown);
  // hard drop plays its own thud — skip the regular lock click that follows
  const skipLockSoundRef = useRef(false);

  boardRef.current = board;
  pieceRef.current = piece;
  speedRef.current = speed;
  pausedRef.current = paused || roundOver !== null || matchOver || countdown !== null;
  countdownRef.current = countdown;
  roundOverRef.current = roundOver;
  multiplierActiveRef.current = multiplierActive;
  multiplierValueRef.current = activeMultValue;

  const clearTransients = useCallback(() => {
    clearingRef.current = false;
    lockDelayRef.current = null;
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
    setFlashRows([]);
  }, []);

  const reset = useCallback(() => {
    savedRef.current = false;
    resetBag();
    clearTransients();
    setBoard(emptyBoard());
    setPiece(nextFromBag());
    setNextPiece(nextFromBag());
    setScore(0);
    setLines(0);
    setRound(1);
    setTimeLeft(ROUND_SECONDS);
    setRoundOver(null);
    setMatchOver(false);
    setPaused(false);
    setQualified(null);
    setSubmitOpen(false);
    setCountdown(3);
    setShake(false);
    setPopup(null);
    setIsPersonalBest(false);
    setMultiplierActive(false);
    setMultiplierTimeLeft(0);
    setUsedMultIdx([]);
    setActiveMultValue(1);
  }, [clearTransients]);

  const resetBoardOnly = useCallback(() => {
    resetBag();
    clearTransients();
    setBoard(emptyBoard());
    setPiece(nextFromBag());
    setNextPiece(nextFromBag());
  }, [clearTransients]);

  const nextRound = useCallback(() => {
    setRound((r) => {
      const nr = r + 1;
      if (nr > TOTAL_ROUNDS) {
        setMatchOver(true);
        setRoundOver(null);
        return r;
      }
      setTimeLeft(ROUND_SECONDS);
      setRoundOver(null);
      resetBoardOnly();
      setCountdown(3);
      setMultiplierActive(false);
      setMultiplierTimeLeft(0);
      setUsedMultIdx([]);
      setActiveMultValue(1);
      return nr;
    });
  }, [resetBoardOnly]);

  const activateMultiplierAt = useCallback(
    (idx: number) => {
      if (multiplierActive) return;
      if (roundOverRef.current !== null || matchOver) return;
      const pool = poolForRound(round);
      if (idx < 0 || idx >= pool.length) return;
      if (usedMultIdx.includes(idx)) return;
      setUsedMultIdx((arr) => [...arr, idx]);
      setActiveMultValue(pool[idx]);
      setMultiplierActive(true);
      setMultiplierTimeLeft(MULTIPLIER_SECONDS);
      vibrate([20, 30, 20]);
      sfx.power();
      setShake(true);
      window.setTimeout(() => setShake(false), 320);
    },
    [multiplierActive, matchOver, round, usedMultIdx],
  );

  // Activate first still-available multiplier (used by M shortcut).
  const activateMultiplier = useCallback(() => {
    if (multiplierActive) return;
    const pool = poolForRound(round);
    const idx = pool.findIndex((_, i) => !usedMultIdx.includes(i));
    if (idx >= 0) activateMultiplierAt(idx);
  }, [multiplierActive, round, usedMultIdx, activateMultiplierAt]);

  const spawnNext = useCallback(() => {
    lockDelayRef.current = null;
    setPiece((prevNext) => {
      // use nextPiece as the new active
      const incoming = { ...nextPieceRef.current, x: 3, y: -1, rotation: 0 };
      if (collides(boardRef.current, incoming)) {
        setRoundOver((prev) => prev ?? "topout");
        setMatchOver(true);
        vibrate(80);
        return prevNext;
      }
      setNextPiece(nextFromBag());
      return incoming;
    });
  }, []);

  // keep a ref to nextPiece for spawnNext
  const nextPieceRef = useRef(nextPiece);
  nextPieceRef.current = nextPiece;

  const lockPiece = useCallback(() => {
    if (clearingRef.current) return;
    lockDelayRef.current = null;
    const merged = merge(boardRef.current, pieceRef.current);
    const fullRows: number[] = [];
    merged.forEach((row, y) => {
      if (row.every((c) => c !== 0)) fullRows.push(y);
    });

    if (fullRows.length === 0) {
      vibrate(8);
      if (!skipLockSoundRef.current) sfx.lock();
      skipLockSoundRef.current = false;
      setBoard(merged);
      spawnNext();
      return;
    }

    const n = fullRows.length;
    skipLockSoundRef.current = false;
    vibrate(n === 4 ? [30, 40, 30] : 25);
    setLines((l) => l + n);
    // scoring: speed × 10 per line, × active multiplier
    const mult = multiplierActiveRef.current ? multiplierValueRef.current : 1;
    const points = n * speedRef.current * 10 * mult;
    setScore((s) => s + points);
    sfx.clear(n, speedRef.current * mult);
    setPopup({ id: Date.now(), text: `+${Math.round(points)}` });
    if (n === 4) {
      setShake(true);
      window.setTimeout(() => setShake(false), 320);
    }

    // show the full rows flashing white briefly, then collapse them
    clearingRef.current = true;
    setBoard(merged);
    setFlashRows(fullRows);
    flashTimeoutRef.current = window.setTimeout(() => {
      flashTimeoutRef.current = null;
      clearingRef.current = false;
      setFlashRows([]);
      setBoard(clearLines(merged).board);
      if (roundOverRef.current === null) spawnNext();
    }, FLASH_MS);
  }, [spawnNext]);

  // Moving/rotating while grounded extends the lock window (up to MAX_LOCK_RESETS).
  const extendLockDelay = useCallback(() => {
    const ld = lockDelayRef.current;
    if (ld && ld.resets < MAX_LOCK_RESETS) {
      lockDelayRef.current = {
        deadline: performance.now() + LOCK_DELAY_MS,
        resets: ld.resets + 1,
      };
    }
  }, []);

  const tryMove = useCallback(
    (dx: number, dy: number): boolean => {
      if (clearingRef.current || countdownRef.current !== null) return false;
      const moved = { ...pieceRef.current, x: pieceRef.current.x + dx, y: pieceRef.current.y + dy };
      if (!collides(boardRef.current, moved)) {
        pieceRef.current = moved;
        setPiece(moved);
        extendLockDelay();
        if (dx !== 0) sfx.move();
        return true;
      }
      return false;
    },
    [extendLockDelay],
  );

  const rotate = useCallback(() => {
    if (clearingRef.current || countdownRef.current !== null) return;
    const rotated = { ...pieceRef.current, rotation: (pieceRef.current.rotation + 1) % 4 };
    // simple wall nudge
    for (const dx of [0, -1, 1, -2, 2]) {
      const test = { ...rotated, x: rotated.x + dx };
      if (!collides(boardRef.current, test)) {
        pieceRef.current = test;
        setPiece(test);
        extendLockDelay();
        sfx.rotate();
        return;
      }
    }
  }, [extendLockDelay]);

  const hardDrop = useCallback(() => {
    if (clearingRef.current || countdownRef.current !== null) return;
    let p = pieceRef.current;
    while (!collides(boardRef.current, { ...p, y: p.y + 1 })) {
      p = { ...p, y: p.y + 1 };
    }
    setPiece(p);
    pieceRef.current = p;
    sfx.hardDrop();
    skipLockSoundRef.current = true;
    lockPiece();
  }, [lockPiece]);

  const softDrop = useCallback(() => {
    // Soft drop only accelerates the fall — no points. Points come from cleared lines only.
    tryMove(0, 1);
  }, [tryMove]);

  // gravity loop (with lock delay: a grounded piece gets a short grace window
  // before locking, checked every frame — not only on gravity steps)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!pausedRef.current && !clearingRef.current) {
        const grounded = collides(boardRef.current, {
          ...pieceRef.current,
          y: pieceRef.current.y + 1,
        });
        if (grounded) {
          acc = 0;
          const ld = lockDelayRef.current;
          if (ld === null) {
            lockDelayRef.current = { deadline: now + LOCK_DELAY_MS, resets: 0 };
          } else if (now >= ld.deadline) {
            lockPiece();
          }
        } else {
          lockDelayRef.current = null;
          acc += dt;
          const mult = multiplierActiveRef.current ? multiplierValueRef.current : 1;
          const effectiveSpeed = speedRef.current * mult;
          const interval = gravityMs(effectiveSpeed);
          while (acc >= interval) {
            acc -= interval;
            if (!tryMove(0, 1)) break; // just landed — lock delay takes over next frame
          }
        }
      } else {
        acc = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tryMove, lockPiece]);

  // clean up a pending flash timeout on unmount
  useEffect(
    () => () => {
      if (flashTimeoutRef.current !== null) window.clearTimeout(flashTimeoutRef.current);
    },
    [],
  );

  // round timer
  useEffect(() => {
    if (matchOver || roundOver !== null) return;
    const id = setInterval(() => {
      if (pausedRef.current && roundOverRef.current === null) return;
      if (roundOverRef.current !== null) return;
      setTimeLeft((t) => {
        if (t <= 1) {
          setRoundOver((prev) => prev ?? "time");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [matchOver, roundOver, round]);

  // multiplier countdown
  useEffect(() => {
    if (!multiplierActive) return;
    const id = setInterval(() => {
      setMultiplierTimeLeft((t) => {
        if (t <= 1) {
          setMultiplierActive(false);
          setActiveMultValue(1);
          return 0;
        }
        if (t - 1 <= 3) sfx.multTick();
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [multiplierActive]);

  // save final score to the local ranking, once per finished match;
  // compare against the previous best BEFORE saving to detect a new record
  useEffect(() => {
    if (matchOver && !savedRef.current) {
      savedRef.current = true;
      const prevBest = loadLocalScores()[0]?.score ?? 0;
      setIsPersonalBest(score > 0 && score > prevBest);
      onSaveScore({ score, lines, rounds: round, date: Date.now() });
    }
  }, [matchOver, score, lines, round, onSaveScore]);

  // 3-2-1-GO countdown before each round
  useEffect(() => {
    if (countdown === null) return;
    sfx.countdown(countdown);
    const id = window.setTimeout(
      () => setCountdown(countdown === 0 ? null : countdown - 1),
      countdown === 0 ? 500 : 800,
    );
    return () => window.clearTimeout(id);
  }, [countdown]);

  // unlock audio on the first user gesture (mobile autoplay policy)
  // and sync the mute toggle from localStorage
  useEffect(() => {
    setMutedState(isMuted());
    const unlock = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // auto-pause when the app/tab goes to the background
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && roundOverRef.current === null) {
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // round-over / game-over jingles
  useEffect(() => {
    if (roundOver === "time") sfx.roundEnd();
    else if (roundOver === "topout") sfx.gameOver();
  }, [roundOver]);

  // auto-remove the floating score popup after its animation
  useEffect(() => {
    if (!popup) return;
    const id = window.setTimeout(() => setPopup(null), 900);
    return () => window.clearTimeout(id);
  }, [popup]);

  // When the match ends, check the score against the global top 100.
  // If it qualifies, open the (prefilled) submit dialog automatically.
  useEffect(() => {
    if (!matchOver) return;
    if (score <= 0) {
      setQualified(false);
      return;
    }
    let cancelled = false;
    fetchTop100Cutoff()
      .then((cutoff) => {
        if (cancelled) return;
        const ok = cutoff === null || score > cutoff;
        setQualified(ok);
        if (ok) {
          sfx.fanfare();
          setSubmitOpen(true);
        }
      })
      .catch(() => {
        // Network/Firestore hiccup: don't block the player — let them submit manually.
        if (!cancelled) setQualified(true);
      });
    return () => {
      cancelled = true;
    };
  }, [matchOver, score]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't steal keys while the user is typing in a form field — otherwise
      // Space (hard drop) eats spaces in the score-submit dialog on desktop.
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          tryMove(-1, 0);
          break;
        case "ArrowRight":
          e.preventDefault();
          tryMove(1, 0);
          break;
        case "ArrowDown":
          e.preventDefault();
          softDrop();
          break;
        case "ArrowUp":
        case "x":
        case "X":
          e.preventDefault();
          rotate();
          break;
        case " ":
          e.preventDefault();
          hardDrop();
          break;
        case "p":
        case "P":
          setPaused((v) => !v);
          break;
        case "m":
        case "M":
          e.preventDefault();
          activateMultiplier();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tryMove, rotate, hardDrop, softDrop, activateMultiplier]);

  // touch (gestures on the board)
  const touchRef = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: performance.now(), moved: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const cell = 28;
    if (Math.abs(dx) >= cell && Math.abs(dx) > Math.abs(dy)) {
      tryMove(dx > 0 ? 1 : -1, 0);
      start.x = t.clientX;
      start.moved = true;
    } else if (dy >= cell && Math.abs(dy) > Math.abs(dx)) {
      softDrop();
      start.y = t.clientY;
      start.moved = true;
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = performance.now() - start.t;
    if (!start.moved && Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 250) {
      rotate();
    } else if (dy > 120 && Math.abs(dy) > Math.abs(dx) * 2) {
      hardDrop();
    }
  };

  // Build display board with active piece + ghost overlay.
  // While the line-clear flash plays, the piece is already merged into the
  // board, so we skip both overlays.
  const clearing = flashRows.length > 0;
  const display = board.map((r) => r.slice());
  const ghostCells = new Set<number>();
  if (!clearing) {
    // ghost piece: where the active piece would land on a hard drop
    let ghost = piece;
    while (!collides(board, { ...ghost, y: ghost.y + 1 })) ghost = { ...ghost, y: ghost.y + 1 };
    for (const [x, y] of getCells(ghost)) {
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) ghostCells.add(y * COLS + x);
    }
    for (const [x, y] of getCells(piece)) {
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
        display[y][x] = piece.key;
        ghostCells.delete(y * COLS + x);
      }
    }
  }

  const pool = poolForRound(round);
  const multDisabled = multiplierActive || roundOver !== null || matchOver;
  const overlayUp = paused || roundOver !== null || matchOver;

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col gap-2 overflow-hidden px-2 py-2 select-none">
      {/* Top: stats + pause */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5">
        <Stat label="Round" value={`${round}/${TOTAL_ROUNDS}`} />
        <Stat label="Score" value={score} hot />
        <Stat label="Lines" value={lines} />
        <Stat
          label="Speed"
          value={multiplierActive ? `${fmtSpeed(speed * activeMultValue)}⚡` : speed}
          hot={multiplierActive}
        />
        <Stat label="Time" value={formatTime(timeLeft)} />
        <button
          onClick={() => {
            const m = !muted;
            setMuted(m);
            setMutedState(m);
            if (!m) unlockAudio();
          }}
          aria-label={muted ? "Unmute" : "Mute"}
          className="ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-base text-secondary-foreground active:bg-accent active:text-accent-foreground"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          onClick={() => setPaused((v) => !v)}
          aria-label="Pause"
          className="ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-base text-secondary-foreground active:bg-accent active:text-accent-foreground"
        >
          {paused ? "▶" : "❚❚"}
        </button>
      </div>

      {/* Middle: vertically-centered play row. Board height is the smaller of the
          available height and what the width (after both columns) allows, so it
          always fits on one screen and never clips a column. */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          className="flex items-stretch gap-2"
          style={{
            height: "min(calc(100dvh - 140px), calc((min(100vw, 480px) - 128px) * 2))",
            maxHeight: "100%",
          }}
        >
          <MultColumn
            pool={pool}
            start={0}
            end={4}
            used={usedMultIdx}
            disabledAll={multDisabled}
            onPick={activateMultiplierAt}
            header={<NextPreview piece={nextPiece} />}
          />

          <div className={`relative flex items-center justify-center ${shake ? "board-shake" : ""}`}>
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="grid touch-none gap-px rounded-md border border-border shadow-2xl"
            style={{
              gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
              height: "100%",
              aspectRatio: `${COLS} / ${ROWS}`,
              background: "var(--grid-line)",
            }}
          >
            {display.flat().map((cell, i) => {
              const isFlash = clearing && flashRows.includes(Math.floor(i / COLS));
              const isGhost = cell === 0 && ghostCells.has(i);
              return (
                <div
                  key={i}
                  className="rounded-[2px]"
                  style={{
                    background: isFlash
                      ? "rgba(255,255,255,0.92)"
                      : cell === 0
                        ? "var(--card)"
                        : COLORS[cell],
                    boxShadow: isFlash
                      ? "0 0 10px rgba(255,255,255,0.7)"
                      : isGhost
                        ? `inset 0 0 0 1.5px color-mix(in srgb, ${COLORS[piece.key]} 55%, transparent)`
                        : cell === 0
                          ? "inset 0 0 0 1px var(--grid-line)"
                          : "inset 0 0 0 1px rgba(255,255,255,0.15)",
                  }}
                />
              );
            })}
          </div>

          {/* Active multiplier badge */}
          {multiplierActive && (
            <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground shadow-lg">
              {fmtMult(activeMultValue)} · {multiplierTimeLeft}s
            </div>
          )}

          {/* Floating score popup on line clears */}
          {popup && (
            <div
              key={popup.id}
              className="popup-rise pointer-events-none absolute left-1/2 top-1/3 z-10 font-mono text-2xl font-black text-primary"
              style={{ textShadow: "0 0 12px color-mix(in srgb, var(--primary) 70%, transparent)" }}
            >
              {popup.text}
            </div>
          )}

          {/* 3-2-1-GO round countdown */}
          {countdown !== null && !overlayUp && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div
                key={countdown}
                className="countdown-pop font-mono text-7xl font-black text-primary"
                style={{ textShadow: "0 0 24px color-mix(in srgb, var(--primary) 70%, transparent)" }}
              >
                {countdown === 0 ? "GO!" : countdown}
              </div>
            </div>
          )}

          {/* Overlay: pause / round / match */}
          {overlayUp && (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/85 backdrop-blur-sm">
              <div className="px-4 text-center">
                <div className="mb-2 text-2xl font-bold text-foreground">
                  {matchOver && roundOver === "topout"
                    ? "Stack out — game over"
                    : matchOver
                      ? "Match complete"
                      : roundOver === "time"
                        ? `Round ${round} complete`
                        : "Paused"}
                </div>
                {matchOver && (
                  <>
                    {isPersonalBest && (
                      <div className="mb-2 inline-block rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary">
                        🏅 New personal best!
                      </div>
                    )}
                    <div className="mb-1 text-base text-foreground">
                      Score: <span className="font-mono font-bold">{score}</span>
                    </div>
                    <div className="mb-3 text-sm text-muted-foreground">
                      Lines: {lines} · Rounds: {round}/{TOTAL_ROUNDS}
                    </div>
                  </>
                )}
                {roundOver !== null && !matchOver && (
                  <div className="mb-3 text-sm text-muted-foreground">
                    Next round: {round + 1} (speed {round + 1})
                  </div>
                )}
                <div className="flex flex-col items-center gap-2">
                  {matchOver && qualified === null && (
                    <p className="text-sm text-muted-foreground">Checking global Top 100…</p>
                  )}
                  {matchOver && qualified === true && (
                    <>
                      <p className="text-sm font-semibold text-primary">
                        🏆 Your score makes the global Top 100!
                      </p>
                      <button
                        onClick={() => setSubmitOpen(true)}
                        className="rounded-md border border-primary px-5 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
                      >
                        Submit to Global Ranking ↗
                      </button>
                    </>
                  )}
                  {matchOver && qualified === false && (
                    <p className="text-sm text-muted-foreground">
                      This score didn't reach the global Top 100 — keep stacking!
                    </p>
                  )}
                  <button
                    onClick={() => {
                      if (matchOver) reset();
                      else if (roundOver !== null) nextRound();
                      else setPaused(false);
                    }}
                    className="rounded-md bg-primary px-5 py-2 font-medium text-primary-foreground hover:opacity-90"
                  >
                    {matchOver
                      ? "Play again"
                      : roundOver !== null
                        ? round >= TOTAL_ROUNDS
                          ? "Finish"
                          : "Next round"
                        : "Resume"}
                  </button>
                  {(paused || matchOver) && (
                    <button
                      onClick={onExit}
                      className="rounded-md px-5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Menu
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

          <MultColumn pool={pool} start={4} end={9} used={usedMultIdx} disabledAll={multDisabled} onPick={activateMultiplierAt} />
        </div>
      </div>

      {/* Bottom controls: left · rotate · soft drop · hard drop · right.
          Hold ◀ ▼ ▶ to auto-repeat (DAS). */}
      <div className="flex items-stretch gap-2 px-1">
        <TouchBtn repeat onPress={() => tryMove(-1, 0)}>◀</TouchBtn>
        <TouchBtn onPress={rotate}>⟳</TouchBtn>
        <TouchBtn repeat onPress={softDrop}>▼</TouchBtn>
        <TouchBtn onPress={hardDrop}>⤓</TouchBtn>
        <TouchBtn repeat onPress={() => tryMove(1, 0)}>▶</TouchBtn>
      </div>

      <ScoreSubmitDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        score={score}
        lines={lines}
        rounds={round}
      />
    </div>
  );
}

function Stat({ label, value, hot }: { label: string; value: number | string; hot?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center leading-tight">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm font-bold ${hot ? "text-primary" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function MultColumn({
  pool,
  start,
  end,
  used,
  disabledAll,
  onPick,
  header,
}: {
  pool: number[];
  start: number;
  end: number;
  used: number[];
  disabledAll: boolean;
  onPick: (idx: number) => void;
  header?: React.ReactNode;
}) {
  return (
    <div className="flex w-[48px] shrink-0 flex-col gap-1.5">
      {header}
      {pool.slice(start, end).map((val, i) => {
        const idx = start + i;
        const isUsed = used.includes(idx);
        const disabled = isUsed || disabledAll;
        return (
          <button
            key={idx}
            onClick={() => onPick(idx)}
            disabled={disabled}
            title={isUsed ? "Used" : `Activate ${fmtMult(val)} for ${MULTIPLIER_SECONDS}s`}
            className="flex flex-1 items-center justify-center rounded-md bg-secondary font-mono text-xs font-bold text-secondary-foreground active:bg-accent active:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-25"
          >
            {fmtMult(val)}
          </button>
        );
      })}
    </div>
  );
}

function TouchBtn({
  children,
  onPress,
  repeat = false,
}: {
  children: React.ReactNode;
  onPress: () => void;
  repeat?: boolean;
}) {
  const delayRef = useRef<number | null>(null);
  const repeatRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (delayRef.current !== null) {
      window.clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    if (repeatRef.current !== null) {
      window.clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    onPress();
    if (!repeat) return;
    stop();
    delayRef.current = window.setTimeout(() => {
      delayRef.current = null;
      repeatRef.current = window.setInterval(onPress, ARR_MS);
    }, DAS_MS);
  };

  return (
    <button
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className="flex h-14 flex-1 touch-none select-none items-center justify-center rounded-lg bg-secondary text-2xl font-bold text-secondary-foreground active:bg-accent active:text-accent-foreground"
    >
      {children}
    </button>
  );
}

function NextPreview({ piece }: { piece: Piece }) {
  const cells = SHAPES[piece.key][0];
  const grid = Array.from({ length: 4 }, () => Array<CellValue>(4).fill(0));
  for (const [x, y] of cells) grid[y][x] = piece.key;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md bg-secondary py-1">
      <span className="text-[8px] uppercase tracking-wide text-muted-foreground">Next</span>
      <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(4, 8px)" }}>
        {grid.flat().map((c, i) => (
          <div
            key={i}
            className="h-[8px] w-[8px] rounded-[1px]"
            style={{ background: c === 0 ? "transparent" : COLORS[c] }}
          />
        ))}
      </div>
    </div>
  );
}
