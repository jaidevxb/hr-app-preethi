import type { ValidationIssue } from "../workflow/validate.js";

export function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return (
    <div className={`card validation-panel${errors.length > 0 ? " validation-panel--error" : ""}`}>
      <div className="validation-header">
        <span className="eyebrow">Validation</span>
        <span className="muted validation-summary">
          {issues.length === 0
            ? "No structural issues"
            : `${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${
                warnings.length === 1 ? "" : "s"
              }`}
        </span>
      </div>

      {issues.length === 0 ? (
        <p className="muted validation-clean">
          Every element is reachable, an end event can be arrived at, and no join waits on a branch
          that can't come.
        </p>
      ) : (
        <ul className="validation-list">
          {[...errors, ...warnings].map((issue, i) => (
            <li key={i} className={`validation-item validation-item--${issue.severity}`}>
              <span className="validation-badge">{issue.severity === "error" ? "✕" : "!"}</span>
              <div>
                {issue.nodeName && <div className="validation-node">{issue.nodeName}</div>}
                <div className="muted">{issue.message}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
