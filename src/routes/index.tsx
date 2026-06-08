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
    <main className="bg-background text-foreground">
      <Tetris />
    </main>
  );
}
