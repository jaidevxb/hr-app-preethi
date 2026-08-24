import { useEffect } from "react";
import type { LogEntry } from "../workflow/types.js";

const STEP_MS = 700;

export function ReplayPanel({
  log,
  index,
  playing,
  onIndexChange,
  onPlayingChange,
  onExit,
}: {
  log: LogEntry[];
  index: number;
  playing: boolean;
  onIndexChange: (index: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onExit: () => void;
}) {
  const last = log.length - 1;
  const entry = log[Math.min(index, last)];

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      onPlayingChange(false);
      return;
    }
    const id = window.setTimeout(() => onIndexChange(index + 1), STEP_MS);
    return () => window.clearTimeout(id);
  }, [playing, index, last, onIndexChange, onPlayingChange]);

  return (
    <div className="card replay-panel">
      <div className="replay-header">
        <span className="eyebrow">Replay</span>
        <span className="muted replay-counter">
          step {Math.min(index, last) + 1} of {log.length}
        </span>
      </div>

      <div className="replay-entry">
        {entry?.tokenId && <span className="timeline-token">{entry.tokenId}</span>}
        <span className="timeline-node">{entry?.nodeName}</span>
        <span className="muted">{entry?.message}</span>
      </div>

      <input
        className="replay-scrubber"
        type="range"
        min={0}
        max={last}
        value={Math.min(index, last)}
        onChange={(event) => {
          onPlayingChange(false);
          onIndexChange(Number(event.target.value));
        }}
        aria-label="Replay position"
      />

      <div className="btn-row replay-controls">
        <button
          className="btn btn-ghost"
          onClick={() => {
            onPlayingChange(false);
            onIndexChange(Math.max(0, index - 1));
          }}
          disabled={index <= 0}
        >
          ◀ Back
        </button>
        <button
          className="btn btn-primary"
          onClick={() => (index >= last ? onIndexChange(0) : onPlayingChange(!playing))}
        >
          {playing ? "Pause" : index >= last ? "Replay from start" : "Play"}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            onPlayingChange(false);
            onIndexChange(Math.min(last, index + 1));
          }}
          disabled={index >= last}
        >
          Next ▶
        </button>
        <button className="btn btn-ghost" onClick={onExit}>
          Back to live
        </button>
      </div>
    </div>
  );
}
