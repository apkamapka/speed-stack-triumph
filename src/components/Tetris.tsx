import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalScore } from "@/lib/localScores";
import { ScoreSubmitDialog } from "@/components/ScoreSubmitDialog";

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

type TetrisProps = {
  onExit: () => void;
  onSaveScore: (entry: LocalScore) => void;
};

export function Tetris({ onExit, onSaveScore }: TetrisProps) {
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
  const [submitOpen, setSubmitOpen] = useState(false);
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
  const savedRef = useRef(false);

  boardRef.current = board;
  pieceRef.current = piece;
  speedRef.current = speed;
  pausedRef.current = paused || roundOver !== null || matchOver;
  gameOverRef.current = gameOver;
  roundOverRef.current = roundOver;
  multiplierActiveRef.current = multiplierActive;
  multiplierValueRef.current = activeMultValue;

  const reset = useCallback(() => {
    savedRef.current = false;
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
        setMatchOver(true);
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
      // scoring: speed × 10 per line, × active multiplier
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

  const softDrop = useCallback(() => {
    // Soft drop only accelerates the fall — no points. Points come from cleared lines only.
    tryMove(0, 1);
  }, [tryMove]);

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

  // save final score to the local ranking, once per finished match
  useEffect(() => {
    if (matchOver && !savedRef.current) {
      savedRef.current = true;
      onSaveScore({ score, lines, rounds: round, date: Date.now() });
    }
  }, [matchOver, score, lines, round, onSaveScore]);

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
  }, [tryMove, rotate, hardDrop, softDrop, reset, activateMultiplier]);

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

  const pool = poolForRound(round);
  const multDisabled = multiplierActive || roundOver !== null || matchOver || gameOver;
  const overlayUp = paused || gameOver || roundOver !== null || matchOver;

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
          <MultColumn pool={pool} start={0} end={5} used={usedMultIdx} disabledAll={multDisabled} onPick={activateMultiplierAt} />

          <div className="relative flex items-center justify-center">
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
            {display.flat().map((cell, i) => (
              <div
                key={i}
                className="rounded-[2px]"
                style={{
                  background: cell === 0 ? "var(--card)" : COLORS[cell],
                  boxShadow:
                    cell === 0
                      ? "inset 0 0 0 1px var(--grid-line)"
                      : "inset 0 0 0 1px rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </div>

          {/* Active multiplier badge */}
          {multiplierActive && (
            <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground shadow-lg">
              {fmtMult(activeMultValue)} · {multiplierTimeLeft}s
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
                        : gameOver
                          ? "Game over"
                          : "Paused"}
                </div>
                {matchOver && (
                  <>
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
                  {matchOver && (
                    <button
                      onClick={() => setSubmitOpen(true)}
                      className="rounded-md border border-primary px-5 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
                    >
                      Submit to Global Ranking ↗
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (matchOver || gameOver) reset();
                      else if (roundOver !== null) nextRound();
                      else setPaused(false);
                    }}
                    className="rounded-md bg-primary px-5 py-2 font-medium text-primary-foreground hover:opacity-90"
                  >
                    {matchOver || gameOver
                      ? "Play again"
                      : roundOver !== null
                        ? round >= TOTAL_ROUNDS
                          ? "Finish"
                          : "Next round"
                        : "Resume"}
                  </button>
                  {(paused || matchOver || gameOver) && (
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

          <MultColumn pool={pool} start={5} end={10} used={usedMultIdx} disabledAll={multDisabled} onPick={activateMultiplierAt} />
        </div>
      </div>

      {/* Bottom: movement | next preview | actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <TouchBtn onClick={() => tryMove(-1, 0)}>◀</TouchBtn>
          <TouchBtn onClick={softDrop}>▼</TouchBtn>
          <TouchBtn onClick={() => tryMove(1, 0)}>▶</TouchBtn>
        </div>
        <NextPreview piece={nextPiece} />
        <div className="flex gap-1.5">
          <TouchBtn onClick={rotate}>⟳</TouchBtn>
          <TouchBtn onClick={hardDrop}>⤓</TouchBtn>
        </div>
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
}: {
  pool: number[];
  start: number;
  end: number;
  used: number[];
  disabledAll: boolean;
  onPick: (idx: number) => void;
}) {
  return (
    <div className="flex w-[48px] shrink-0 flex-col gap-1.5">
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

function TouchBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-xl font-bold text-secondary-foreground active:bg-accent active:text-accent-foreground"
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
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Next</span>
      <div
        className="grid gap-px rounded border border-border bg-card p-1"
        style={{ gridTemplateColumns: "repeat(4, 9px)" }}
      >
        {grid.flat().map((c, i) => (
          <div
            key={i}
            className="h-[9px] w-[9px] rounded-[1px]"
            style={{ background: c === 0 ? "transparent" : COLORS[c] }}
          />
        ))}
      </div>
    </div>
  );
}
