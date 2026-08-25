import type { PendingEvent } from "../workflow/engine.js";

/**
 * Message and signal events wait for something outside the process. In a real
 * deployment that's an API call or a broker; here it's a button.
 */
export function EventPanel({
  events,
  onDeliverMessage,
  onBroadcastSignal,
}: {
  events: PendingEvent[];
  onDeliverMessage: (name: string) => void;
  onBroadcastSignal: (name: string) => void;
}) {
  // A signal reaches every listener at once, so it's fired by name, not by token.
  const signalNames = [
    ...new Set(events.filter((event) => event.kind === "signal").map((event) => event.name)),
  ];
  const messages = events.filter((event) => event.kind === "message");

  return (
    <div className="card event-panel">
      <span className="eyebrow">Waiting on the outside world</span>
      <p className="muted event-intro">
        These branches are parked until something reaches them. A message goes to one waiting token;
        a signal is a broadcast and wakes every listener.
      </p>

      <ul className="event-list">
        {messages.map((event) => (
          <li key={event.tokenId} className="event-row">
            <span className="badge">Message</span>
            <span className="event-node">{event.nodeName}</span>
            <code className="event-name">{event.name}</code>
            <button className="btn btn-primary btn-small" onClick={() => onDeliverMessage(event.name)}>
              Deliver
            </button>
          </li>
        ))}

        {signalNames.map((name) => {
          const listeners = events.filter(
            (event) => event.kind === "signal" && event.name === name
          );
          return (
            <li key={name} className="event-row">
              <span className="badge">Signal</span>
              <span className="event-node">
                {listeners.length === 1
                  ? listeners[0].nodeName
                  : `${listeners.length} listeners`}
              </span>
              <code className="event-name">{name}</code>
              <button className="btn btn-primary btn-small" onClick={() => onBroadcastSignal(name)}>
                Broadcast
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
