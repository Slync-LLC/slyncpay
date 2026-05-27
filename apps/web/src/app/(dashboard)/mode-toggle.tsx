"use client";

import { useTransition } from "react";
import { Beaker, Zap } from "lucide-react";
import { setMode } from "./actions";

export function ModeToggle({ mode }: { mode: "live" | "test" }) {
  const [pending, start] = useTransition();

  function switchTo(next: "live" | "test") {
    if (next === mode || pending) return;
    start(async () => {
      await setMode(next);
    });
  }

  return (
    <div className="px-3 pt-3">
      <div className="flex bg-muted rounded-md p-0.5 text-xs font-medium" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "live"}
          onClick={() => switchTo("live")}
          disabled={pending}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded transition-colors ${
            mode === "live"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Zap className="h-3 w-3" />
          Live
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "test"}
          onClick={() => switchTo("test")}
          disabled={pending}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded transition-colors ${
            mode === "test"
              ? "bg-white text-orange-700 shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Beaker className="h-3 w-3" />
          Sandbox
        </button>
      </div>
    </div>
  );
}
