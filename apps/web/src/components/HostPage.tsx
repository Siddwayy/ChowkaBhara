import { useMemo } from "react";
import { HostScreen } from "./HostScreen";

export function HostPage() {
  const code = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("code")?.toUpperCase() ?? "";
  }, []);

  if (!code) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-surface/80">
          Missing room code.{" "}
          <a className="font-semibold text-o2 underline" href="/">
            Return home
          </a>
        </p>
      </main>
    );
  }

  return <HostScreen code={code} />;
}
