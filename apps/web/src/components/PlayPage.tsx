import { useMemo } from "react";
import { MAX_PLAYERS, MIN_PLAYERS } from "@chowka/shared";
import { PlayScreen } from "./PlayScreen";

export function PlayPage() {
  const { code, name, max } = useMemo(() => {
    if (typeof window === "undefined") return { code: "", name: "", max: null };
    const params = new URLSearchParams(window.location.search);
    const rawMax = Number(params.get("max"));
    const max =
      Number.isFinite(rawMax) && rawMax >= MIN_PLAYERS && rawMax <= MAX_PLAYERS
        ? rawMax
        : null;
    return {
      code: params.get("code")?.toUpperCase() ?? "",
      name: (params.get("name") ?? "").trim().slice(0, 16),
      max,
    };
  }, []);

  if (!code || !name) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-center text-surface/80">
          {!code ? "Missing lobby code." : "Missing player name."}{" "}
          <a className="font-semibold text-o2 underline" href="/">
            Return home
          </a>
        </p>
      </main>
    );
  }

  return <PlayScreen code={code} playerName={name} desiredMax={max} />;
}
