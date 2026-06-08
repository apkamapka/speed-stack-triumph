import { createFileRoute } from "@tanstack/react-router";
import { TetrisApp } from "@/components/TetrisApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tetris — play in your browser" },
      {
        name: "description",
        content: "Mobile Tetris with rising speed and risk/reward multipliers. Touch and keyboard controls.",
      },
      { property: "og:title", content: "Tetris — play in your browser" },
      { property: "og:description", content: "Mobile Tetris with rising speed and multipliers." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="bg-background text-foreground">
      <TetrisApp />
    </main>
  );
}
