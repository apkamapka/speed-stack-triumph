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
    <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col items-center justify-center gap-10 px-6">
      <div className="text-center">
        <h1 className="text-5xl font-black tracking-tight text-foreground">TETRIS</h1>
        <p className="mt-3 text-sm text-muted-foreground">10 rounds · rising speed · multipliers</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={onNewGame}
          className="rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground transition-opacity hover:opacity-90 active:opacity-80"
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
    </div>
  );
}
