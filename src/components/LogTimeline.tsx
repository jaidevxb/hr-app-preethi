import type { LogEntry } from "../workflow/types.js";

export function LogTimeline({ log }: { log: LogEntry[] }) {
  // Only worth showing token tags once the process has actually branched.
  const tokenIds = new Set(log.map((entry) => entry.tokenId).filter(Boolean));
  const showTokens = tokenIds.size > 1;

  return (
    <div className="card">
      <h3>Activity log</h3>
      <ol className="timeline">
        {log.map((entry, i) => (
          <li key={i}>
            {showTokens && <span className="timeline-token">{entry.tokenId ?? "—"}</span>}
            <span className="timeline-node">{entry.nodeName}</span>
            <span className="timeline-message">{entry.message}</span>
            <span className="timeline-time">{entry.timestamp.toLocaleTimeString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
