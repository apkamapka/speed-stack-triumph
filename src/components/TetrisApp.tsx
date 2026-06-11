import { useCallback, useState } from "react";
import { Tetris } from "@/components/Tetris";
import { LocalScores } from "@/components/LocalScores";
import { addLocalScore, type LocalScore } from "@/lib/localScores";

const GLOBAL_RANKING_URL = "https://akappstudio.pl/highscore/tetspeed";

type Screen = "menu" | "game" | "scores";

export function TetrisApp() {
  const [screen, setScreen] = useState<Screen>("menu");

  const handleSaveScore = useCallback((entry: LocalScore) => {
    addLocalScore(entry);
  }, []);

  if (screen === "game") {
    return <Tetris onExit={() => setScreen("menu")} onSaveScore={handleSaveScore} />;
  }
  if (screen === "scores") {
    return <LocalScores onBack={() => setScreen("menu")} />;
  }
  return (
    <Menu
      onNewGame={() => setScreen("game")}
      onScores={() => setScreen("scores")}
      globalUrl={GLOBAL_RANKING_URL}
    />
  );
}

function Menu({
  onNewGame,
  onScores,
  globalUrl,
}: {
  onNewGame: () => void;
  onScores: () => void;
  globalUrl: string;
}) {
  return (
    <div className="relative mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col items-center justify-center gap-8 overflow-hidden px-6">
      <FallingPieces />

      {/* Title */}
      <div className="relative text-center">
        <h1 className="font-black leading-none tracking-tight">
          <span className="title-glow block bg-gradient-to-r from-primary via-cyan-200 to-primary bg-clip-text text-[3.4rem] tracking-[0.08em] text-transparent">
            TETSPEED
          </span>
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          10 rounds · rising speed · multipliers
        </p>
      </div>

      {/* Buttons */}
      <div className="relative flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={onNewGame}
          className="rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_35%,transparent)] transition hover:opacity-90 active:scale-[0.98]"
        >
          New Game
        </button>
        <button
          onClick={onScores}
          className="rounded-xl bg-secondary py-3 font-semibold text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Local Scores
        </button>
        <a
          href={globalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 rounded-xl border border-border py-3 font-semibold text-foreground transition-colors hover:bg-card"
        >
          Global Ranking <span aria-hidden="true">↗</span>
        </a>
      </div>

      {/* Studio credit + legal links */}
      <div className="relative mt-2 flex flex-col items-center gap-2">
        <a
          href="https://akappstudio.pl/"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col items-center gap-2 opacity-70 transition-opacity hover:opacity-100"
        >
          <img
            src="/akapp-logo.png"
            alt="akApp studio logo"
            width={48}
            height={48}
            className="h-12 w-12 rounded-full"
          />
          <span className="text-xs text-muted-foreground transition-colors group-hover:text-foreground">
            created by <span className="font-semibold">akApp studio</span>
          </span>
        </a>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
          <a
            href="https://akappstudio.pl/Tetspeed/Terms%20of%20Service/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Terms of Service
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://akappstudio.pl/Tetspeed/Privacy%20Policy/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  );
}

// Decorative falling tetrominoes behind the menu. The list is a hardcoded
// constant (not random) so SSR and client render identically — randomness
// would cause hydration mismatches.
const MENU_PIECES: ReadonlyArray<{
  shape: ReadonlyArray<[number, number]>;
  color: string;
  left: string; // horizontal position
  size: number; // px per cell
  duration: number; // seconds for a full fall
  delay: number; // negative = starts mid-fall, so the screen is populated immediately
  opacity: number;
}> = [
  { shape: [[0, 0], [1, 0], [2, 0], [3, 0]], color: "var(--t-i)", left: "6%", size: 14, duration: 16, delay: -2, opacity: 0.16 },
  { shape: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "var(--t-o)", left: "20%", size: 12, duration: 21, delay: -9, opacity: 0.13 },
  { shape: [[1, 0], [0, 1], [1, 1], [2, 1]], color: "var(--t-t)", left: "33%", size: 16, duration: 14, delay: -6, opacity: 0.18 },
  { shape: [[1, 0], [2, 0], [0, 1], [1, 1]], color: "var(--t-s)", left: "47%", size: 12, duration: 23, delay: -14, opacity: 0.12 },
  { shape: [[0, 0], [1, 0], [1, 1], [2, 1]], color: "var(--t-z)", left: "60%", size: 15, duration: 17, delay: -4, opacity: 0.16 },
  { shape: [[0, 0], [0, 1], [1, 1], [2, 1]], color: "var(--t-j)", left: "74%", size: 13, duration: 20, delay: -11, opacity: 0.14 },
  { shape: [[2, 0], [0, 1], [1, 1], [2, 1]], color: "var(--t-l)", left: "88%", size: 14, duration: 15, delay: -7, opacity: 0.17 },
  { shape: [[0, 0], [1, 0], [2, 0], [3, 0]], color: "var(--t-t)", left: "14%", size: 10, duration: 26, delay: -18, opacity: 0.1 },
  { shape: [[1, 0], [0, 1], [1, 1], [2, 1]], color: "var(--t-i)", left: "53%", size: 11, duration: 24, delay: -20, opacity: 0.11 },
  { shape: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "var(--t-z)", left: "80%", size: 10, duration: 27, delay: -16, opacity: 0.1 },
];

function FallingPieces() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {MENU_PIECES.map((p, i) => (
        <div
          key={i}
          className="menu-fall absolute top-0"
          style={{
            left: p.left,
            opacity: p.opacity,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        >
          <div
            className="relative"
            style={{ width: p.size * 4, height: p.size * 2 }}
          >
            {p.shape.map(([x, y], j) => (
              <div
                key={j}
                className="absolute rounded-[2px]"
                style={{
                  left: x * p.size,
                  top: y * p.size,
                  width: p.size - 1,
                  height: p.size - 1,
                  background: p.color,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
