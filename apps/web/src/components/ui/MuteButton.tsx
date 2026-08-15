type Props = {
  muted: boolean;
  onToggle: () => void;
  className?: string;
};

export function MuteButton({ muted, onToggle, className = "" }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      aria-pressed={muted}
      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-surface/15 text-surface transition hover:bg-surface/25 active:scale-95 ${className}`}
    >
      {muted ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
          <path
            d="M17 9l4 4m0-4l-4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
          <path
            d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7 7 0 0 1 0 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      )}
    </button>
  );
}
