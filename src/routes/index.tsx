import { createFileRoute } from "@tanstack/react-router";
import { TetrisApp } from "@/components/TetrisApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TetSpeed — play in your browser" },
      {
        name: "description",
        content: "TetSpeed — a mobile block-stacking game with rising speed and risk/reward multipliers. Touch and keyboard controls.",
      },
      { property: "og:title", content: "TetSpeed — play in your browser" },
      { property: "og:description", content: "TetSpeed — block stacking with rising speed and multipliers." },
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
