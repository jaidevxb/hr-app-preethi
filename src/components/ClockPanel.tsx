import type { ArmedTimer } from "../workflow/engine.js";
import { CLOCK_SPEEDS, formatDuration } from "../workflow/simulationClock.js";
import { Select } from "./Select.js";

const SPEED_OPTIONS = CLOCK_SPEEDS.map((speed) => ({ value: speed.id, label: speed.label }));

export function ClockPanel({
  speedId,
  onSpeedChange,
  elapsedSimMs,
  armedTimers,
  running,
}: {
  speedId: string;
  onSpeedChange: (id: string) => void;
  elapsedSimMs: number;
  armedTimers: ArmedTimer[];
  running: boolean;
}) {
  return (
    <div className="card clock-panel">
      <div className="clock-header">
        <div>
          <span className="eyebrow">Simulation clock</span>
          <p className="muted clock-elapsed">
            {formatDuration(elapsedSimMs)} elapsed in the process
          </p>
        </div>
        <Select
          className="clock-speed"
          label="Speed"
          value={speedId}
          options={SPEED_OPTIONS}
          onChange={onSpeedChange}
        />
      </div>

      {armedTimers.length > 0 ? (
        <ul className="timer-list">
          {armedTimers.map((timer) => {
            const expired = timer.remainingMs <= 0;
            return (
              <li key={timer.tokenId} className={expired ? "timer-row timer-row--due" : "timer-row"}>
                <span className="timer-node">{timer.nodeName}</span>
                <span className="muted">{timer.label ?? "boundary timer"}</span>
                <span className="timer-remaining">{formatDuration(timer.remainingMs)} left</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted clock-idle">No boundary timers are armed right now.</p>
      )}

      {!running && armedTimers.length > 0 && (
        <p className="muted clock-idle">
          The clock is paused — pick a speed to let the SLA run out on its own.
        </p>
      )}
    </div>
  );
}
