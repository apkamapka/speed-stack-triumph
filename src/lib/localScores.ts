import { useEffect, useState } from "react";
import { loadLocalScores, clearLocalScores, type LocalScore } from "@/lib/localScores";

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
}

export function LocalScores({ onBack }: { onBack: () => void }) {
  const [scores, setScores] = useState<LocalScore[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  // Read from localStorage on the client only (avoids SSR mismatch).
  useEffect(() => {
    setScores(loadLocalScores());
  }, []);

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col gap-4 px-4 py-5">
      <header className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold tracking-tight text-foreground">Local Scores</h1>
        <span className="w-12" />
      </header>

      <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-card">
        {scores.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            No scores yet. Play a game and your best results will show up here.
          </div>
        ) : (
          <ol>
            {scores.map((s, i) => (
              <li
                key={`${s.date}-${i}`}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <span
                  className={`w-6 text-center font-mono text-sm font-bold ${
                    i === 0 ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1 font-mono text-lg font-bold text-foreground">
                  {s.score.toLocaleString()}
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  R{s.rounds} · {s.lines} lines
                  <br />
                  {formatDate(s.date)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {scores.length > 0 &&
        (confirmClear ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-card px-3 py-2 text-sm">
            <span className="text-foreground">Clear all local scores?</span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  clearLocalScores();
                  setScores([]);
                  setConfirmClear(false);
                }}
                className="rounded-md bg-destructive px-3 py-1 font-medium text-destructive-foreground"
              >
                Clear
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="rounded-md bg-secondary px-3 py-1 text-secondary-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            className="rounded-md py-2 text-sm text-muted-foreground hover:text-destructive"
          >
            Clear scores
          </button>
        ))}
    </div>
  );
}
