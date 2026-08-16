import type { LogEntry } from "../workflow/types.js";

export function LogTimeline({ log }: { log: LogEntry[] }) {
  return (
    <div className="card">
      <h3>Activity log</h3>
      <ol className="timeline">
        {log.map((entry, i) => (
          <li key={i}>
            <span className="timeline-node">{entry.nodeName}</span>
            <span className="timeline-message">{entry.message}</span>
            <span className="timeline-time">{entry.timestamp.toLocaleTimeString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
