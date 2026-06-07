import { useCallback, useEffect, useRef, useState } from "react";

const COLS = 10;
const ROWS = 20;
const TOTAL_ROUNDS = 10;
const ROUND_SECONDS = 120;
const MULTIPLIER_SECONDS = 20;

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

function poolForRound(round: number): number[] {
  return MULTIPLIER_POOLS[round] ?? MULTIPLIER_POOLS[10];
}

function fmtMult(n: number): string {
  return Number.isInteger(n) ? `×${n}` : `×${n.toFixed(n < 1 ? 2 : 2).replace(/\.?0+$/, "")}`;
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

function randomPiece(): Piece {
  const key = KEYS[Math.floor(Math.random() * KEYS.length)];
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

export function Tetris() {
  const [board, setBoard] = useState<CellValue[][]>(emptyBoard);
  const [piece, setPiece] = useState<Piece>(() => randomPiece());
  const [nextPiece, setNextPiece] = useState<Piece>(() => randomPiece());
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [round, setRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [roundOver, setRoundOver] = useState<null | "time" | "topout">(null);
  const [matchOver, setMatchOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [multiplierUsed, setMultiplierUsed] = useState(false);
  const [multiplierActive, setMultiplierActive] = useState(false);
  const [multiplierTimeLeft, setMultiplierTimeLeft] = useState(0);
  const [usedMultIdx, setUsedMultIdx] = useState<number[]>([]);
  const [activeMultValue, setActiveMultValue] = useState<number>(1);

  const speed = round;

  const boardRef = useRef(board);
  const pieceRef = useRef(piece);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  const gameOverRef = useRef(gameOver);
  const roundOverRef = useRef(roundOver);
  const multiplierActiveRef = useRef(multiplierActive);
  const multiplierValueRef = useRef(1);

  boardRef.current = board;
  pieceRef.current = piece;
  speedRef.current = speed;
  pausedRef.current = paused || roundOver !== null || matchOver;
  gameOverRef.current = gameOver;
  roundOverRef.current = roundOver;
  multiplierActiveRef.current = multiplierActive;
  multiplierValueRef.current = activeMultValue;

  const reset = useCallback(() => {
    setBoard(emptyBoard());
    setPiece(randomPiece());
    setNextPiece(randomPiece());
    setScore(0);
    setLines(0);
    setRound(1);
    setTimeLeft(ROUND_SECONDS);
    setRoundOver(null);
    setMatchOver(false);
    setGameOver(false);
    setPaused(false);
    setMultiplierUsed(false);
    setMultiplierActive(false);
    setMultiplierTimeLeft(0);
    setUsedMultIdx([]);
    setActiveMultValue(1);
  }, []);

  const resetBoardOnly = useCallback(() => {
    setBoard(emptyBoard());
    setPiece(randomPiece());
    setNextPiece(randomPiece());
  }, []);

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
      setMultiplierUsed(false);
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
      if (roundOverRef.current !== null || matchOver || gameOver) return;
      const pool = poolForRound(round);
      if (idx < 0 || idx >= pool.length) return;
      if (usedMultIdx.includes(idx)) return;
      setUsedMultIdx((arr) => [...arr, idx]);
      setActiveMultValue(pool[idx]);
      setMultiplierUsed(true);
      setMultiplierActive(true);
      setMultiplierTimeLeft(MULTIPLIER_SECONDS);
    },
    [multiplierActive, matchOver, gameOver, round, usedMultIdx],
  );

  // Activate first still-available multiplier (used by M shortcut).
  const activateMultiplier = useCallback(() => {
    if (multiplierActive) return;
    const pool = poolForRound(round);
    const idx = pool.findIndex((_, i) => !usedMultIdx.includes(i));
    if (idx >= 0) activateMultiplierAt(idx);
  }, [multiplierActive, round, usedMultIdx, activateMultiplierAt]);

  const spawnNext = useCallback(() => {
    setPiece((prevNext) => {
      // use nextPiece as the new active
      const incoming = { ...nextPieceRef.current, x: 3, y: -1, rotation: 0 };
      if (collides(boardRef.current, incoming)) {
        setRoundOver((prev) => prev ?? "topout");
        return prevNext;
      }
      setNextPiece(randomPiece());
      return incoming;
    });
  }, []);

  // keep a ref to nextPiece for spawnNext
  const nextPieceRef = useRef(nextPiece);
  nextPieceRef.current = nextPiece;

  const lockPiece = useCallback(() => {
    const merged = merge(boardRef.current, pieceRef.current);
    const { board: cleared, cleared: n } = clearLines(merged);
    setBoard(cleared);
    if (n > 0) {
      setLines((l) => l + n);
      // Phase 1 scoring: speed × 10 per line, × active multiplier
      const mult = multiplierActiveRef.current ? multiplierValueRef.current : 1;
      setScore((s) => s + n * speedRef.current * 10 * mult);
    }
    spawnNext();
  }, [spawnNext]);

  const tryMove = useCallback((dx: number, dy: number): boolean => {
    const moved = { ...pieceRef.current, x: pieceRef.current.x + dx, y: pieceRef.current.y + dy };
    if (!collides(boardRef.current, moved)) {
      setPiece(moved);
      return true;
    }
    return false;
  }, []);

  const rotate = useCallback(() => {
    const rotated = { ...pieceRef.current, rotation: (pieceRef.current.rotation + 1) % 4 };
    // simple wall nudge
    for (const dx of [0, -1, 1, -2, 2]) {
      const test = { ...rotated, x: rotated.x + dx };
      if (!collides(boardRef.current, test)) {
        setPiece(test);
        return;
      }
    }
  }, []);

  const hardDrop = useCallback(() => {
    let p = pieceRef.current;
    while (!collides(boardRef.current, { ...p, y: p.y + 1 })) {
      p = { ...p, y: p.y + 1 };
    }
    setPiece(p);
    pieceRef.current = p;
    lockPiece();
  }, [lockPiece]);

  // gravity loop
  useEffect(() => {
    if (gameOver) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!pausedRef.current && !gameOverRef.current) {
        acc += dt;
        const mult = multiplierActiveRef.current ? multiplierValueRef.current : 1;
        const effectiveSpeed = speedRef.current * mult;
        const interval = gravityMs(effectiveSpeed);
        while (acc >= interval) {
          acc -= interval;
          if (!tryMove(0, 1)) {
            lockPiece();
          }
        }
      } else {
        acc = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tryMove, lockPiece, gameOver]);

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
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [multiplierActive]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameOverRef.current) {
        if (e.key === "Enter" || e.key === " ") reset();
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
          if (tryMove(0, 1)) setScore((s) => s + 1);
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
  }, [tryMove, rotate, hardDrop, reset, activateMultiplier]);

  // touch
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
      if (tryMove(0, 1)) setScore((s) => s + 1);
      start.y = t.clientY;
      start.moved = true;
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    if (gameOverRef.current) {
      reset();
      return;
    }
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

  // Build display board with active piece overlay
  const display = board.map((r) => r.slice());
  for (const [x, y] of getCells(piece)) {
    if (y >= 0 && y < ROWS && x >= 0 && x < COLS) display[y][x] = piece.key;
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto">
      <div className="flex w-full justify-between items-center text-sm">
        <Stat label="Runda" value={`${round}/${TOTAL_ROUNDS}`} />
        <Stat label="Wynik" value={score} />
        <Stat label="Linie" value={lines} />
        <Stat label="Prędkość" value={speed} />
        <Stat label="Czas" value={formatTime(timeLeft)} />
      </div>

      <div className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Mnożniki rundy {round}
          </span>
          <span className="text-base font-mono font-bold text-foreground">
            {multiplierActive ? (
              <>
                {fmtMult(activeMultValue)}{" "}
                <span className="text-primary">aktywny {multiplierTimeLeft}s</span>
              </>
            ) : (
              <span className="text-muted-foreground text-sm">
                wybierz mnożnik ({poolForRound(round).length - usedMultIdx.length} dostępnych)
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5 w-full">
        {poolForRound(round).map((val, i) => {
          const used = usedMultIdx.includes(i);
          const disabled =
            used || multiplierActive || roundOver !== null || matchOver || gameOver;
          return (
            <button
              key={i}
              onClick={() => activateMultiplierAt(i)}
              disabled={disabled}
              className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-mono font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent hover:text-accent-foreground"
              title={used ? "Wykorzystany" : `Aktywuj ${fmtMult(val)} na ${MULTIPLIER_SECONDS}s`}
            >
              {fmtMult(val)}
            </button>
          );
        })}
      </div>

      <div
        className="relative rounded-lg border border-border bg-card p-2 shadow-2xl touch-none select-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="grid gap-px"
          style={{
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            width: "min(92vw, 360px)",
            aspectRatio: `${COLS} / ${ROWS}`,
            background: "var(--grid-line)",
          }}
        >
          {display.flat().map((cell, i) => (
            <div
              key={i}
              className="rounded-[2px]"
              style={{
                background: cell === 0 ? "var(--card)" : COLORS[cell],
                boxShadow:
                  cell === 0
                    ? "inset 0 0 0 1px var(--grid-line)"
                    : "inset 0 0 0 1px rgba(255,255,255,0.15), 0 0 6px color-mix(in oklab, currentColor 30%, transparent)",
              }}
            />
          ))}
        </div>

        {(paused || gameOver || roundOver !== null || matchOver) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground mb-2">
                {matchOver
                  ? "Koniec meczu"
                  : roundOver === "time"
                    ? `Koniec rundy ${round}`
                    : roundOver === "topout"
                      ? `Skucha! Runda ${round}`
                      : gameOver
                        ? "Koniec gry"
                        : "Pauza"}
              </div>
              {roundOver !== null && !matchOver && (
                <div className="text-sm text-muted-foreground mb-3">
                  Następna runda: {round + 1} (prędkość {round + 1})
                </div>
              )}
              <button
                onClick={() => {
                  if (matchOver || gameOver) reset();
                  else if (roundOver !== null) nextRound();
                  else setPaused(false);
                }}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90"
              >
                {matchOver || gameOver
                  ? "Zagraj jeszcze raz"
                  : roundOver !== null
                    ? round >= TOTAL_ROUNDS
                      ? "Zakończ"
                      : "Następna runda"
                    : "Wznów"}
              </button>
            </div>
          </div>
        )}
      </div>

      <NextPreview piece={nextPiece} />

      <div className="grid grid-cols-3 gap-2 w-full sm:hidden">
        <TouchBtn onClick={() => tryMove(-1, 0)}>◀</TouchBtn>
        <TouchBtn onClick={rotate}>⟳</TouchBtn>
        <TouchBtn onClick={() => tryMove(1, 0)}>▶</TouchBtn>
        <TouchBtn onClick={() => tryMove(0, 1)}>▼</TouchBtn>
        <TouchBtn onClick={hardDrop}>⤓</TouchBtn>
        <TouchBtn onClick={() => setPaused((v) => !v)}>{paused ? "▶︎" : "❚❚"}</TouchBtn>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Klawiatura: ← → ruch, ↑/X obrót, ↓ soft drop, spacja hard drop, P pauza.
        <br />
        M — aktywuj kolejny dostępny mnożnik (20s, jeden naraz).
        <br />
        Dotyk: swipe ←/→ ruch, tap obrót, swipe ↓ soft drop, długi swipe ↓ hard drop.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-lg font-mono font-bold text-foreground">{value}</span>
    </div>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function TouchBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="py-3 rounded-md bg-secondary text-secondary-foreground text-xl font-bold active:bg-accent active:text-accent-foreground"
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
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span>Następny:</span>
      <div
        className="grid gap-px p-1 rounded bg-card border border-border"
        style={{ gridTemplateColumns: "repeat(4, 14px)" }}
      >
        {grid.flat().map((c, i) => (
          <div
            key={i}
            className="w-[14px] h-[14px] rounded-[2px]"
            style={{ background: c === 0 ? "transparent" : COLORS[c] }}
          />
        ))}
      </div>
    </div>
  );
}