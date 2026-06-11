import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { COUNTRIES } from "@/lib/countries";
import { submitScore } from "@/lib/globalScores";
import { loadProfile, saveProfile } from "@/lib/playerProfile";

const GLOBAL_RANKING_URL = "https://akappstudio.pl/highscore/tetspeed";

type Status = "idle" | "sending" | "sent" | "error";

export function ScoreSubmitDialog({
  open,
  onOpenChange,
  score,
  lines,
  rounds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  score: number;
  lines: number;
  rounds: number;
}) {
  const [nick, setNick] = useState("");
  const [country, setCountry] = useState("PL");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const sending = status === "sending";
  const done = status === "sent";

  // Fresh form every time the dialog opens for a new match, prefilled with the
  // remembered profile so a returning player only has to tap Submit.
  useEffect(() => {
    if (open) {
      setStatus("idle");
      setError("");
      const p = loadProfile();
      if (p) {
        setNick(p.nick);
        setCountry(p.country);
        setComment(p.comment);
      } else {
        setComment("");
      }
    }
  }, [open]);

  async function handleSubmit() {
    setError("");
    if (!nick.trim()) {
      setError("Enter a nickname.");
      return;
    }
    setStatus("sending");
    try {
      await submitScore({ nick, country, comment, score, lines, rounds });
      saveProfile({ nick: nick.trim(), country, comment });
      setStatus("sent");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not submit. Try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-sm border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>Submit to Global Ranking</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Score <span className="font-mono font-bold text-primary">{score}</span> · {lines} lines
            · {rounds} rounds
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <p className="text-foreground">Your score is in the global ranking! 🎉</p>
            <a
              href={GLOBAL_RANKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
            >
              View ranking <span aria-hidden="true">↗</span>
            </a>
            <button
              onClick={() => onOpenChange(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nick">Nickname</Label>
              <Input
                id="nick"
                value={nick}
                maxLength={20}
                placeholder="Your name"
                onChange={(e) => setNick(e.target.value)}
                disabled={sending}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="country">Country</Label>
              {/* Native select: best picker UX on mobile. */}
              <select
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={sending}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comment">Comment for the world</Label>
              <Textarea
                id="comment"
                value={comment}
                maxLength={140}
                rows={2}
                placeholder="Say something (optional)"
                onChange={(e) => setComment(e.target.value)}
                disabled={sending}
              />
              <span className="self-end text-[11px] text-muted-foreground">
                {comment.length}/140
              </span>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                onClick={() => onOpenChange(false)}
                disabled={sending}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <Button onClick={handleSubmit} disabled={sending}>
                {sending ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
