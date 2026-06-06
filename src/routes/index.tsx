import { createFileRoute } from "@tanstack/react-router";
import { Tetris } from "@/components/Tetris";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tetris — graj w przeglądarce" },
      { name: "description", content: "Mobilny Tetris z regulacją prędkości. Sterowanie dotykiem i klawiaturą." },
      { property: "og:title", content: "Tetris — graj w przeglądarce" },
      { property: "og:description", content: "Mobilny Tetris z regulacją prędkości." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground py-6 px-4">
      <header className="max-w-md mx-auto mb-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Tetris</h1>
        <p className="text-xs text-muted-foreground">Faza 1: rdzeń + sterowanie</p>
      </header>
      <Tetris />
    </div>
  );
}
