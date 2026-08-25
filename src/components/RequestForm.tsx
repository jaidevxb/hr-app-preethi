import { useMemo, useState } from "react";
import type { FormField, StartEventNode, WorkflowContext } from "../workflow/types.js";
import { Select } from "./Select.js";

function initialValues(fields: FormField[]): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => [field.id, field.defaultValue ?? (field.type === "boolean" ? "false" : "")])
  );
}

/** Turn the string-keyed form state into the context the engine will branch on. */
function toContext(fields: FormField[], values: Record<string, string>): WorkflowContext {
  const context: WorkflowContext = {};
  for (const field of fields) {
    const raw = values[field.id] ?? "";
    if (field.type === "boolean") {
      context[field.id] = raw === "true";
    } else if (field.type === "long") {
      context[field.id] = Number(raw) || 0;
    } else {
      context[field.id] = raw.trim() || "—";
    }
  }
  return context;
}

export function RequestForm({
  start,
  processName,
  onSubmit,
}: {
  start: StartEventNode;
  processName: string;
  onSubmit: (ctx: WorkflowContext) => void;
}) {
  const fields = start.form;
  const [values, setValues] = useState(() => initialValues(fields));

  // Reset the inputs when the picker switches to a different process.
  const signature = useMemo(() => fields.map((field) => field.id).join(","), [fields]);
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setValues(initialValues(fields));
  }

  const set = (id: string, value: string) => setValues((prev) => ({ ...prev, [id]: value }));

  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(toContext(fields, values));
      }}
    >
      <span className="eyebrow">New Instance</span>
      <h2>{processName}</h2>

      {fields.length === 0 && (
        <p className="muted">This process declares no start form — submit to begin.</p>
      )}

      {fields.map((field) => {
        if (field.type === "boolean") {
          return (
            <label key={field.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={values[field.id] === "true"}
                onChange={(event) => set(field.id, String(event.target.checked))}
              />
              {field.label}
            </label>
          );
        }

        if (field.type === "enum") {
          return (
            <Select
              key={field.id}
              className="form-select"
              label={field.label}
              value={values[field.id] ?? ""}
              options={[
                { value: "", label: "Select…" },
                ...(field.options ?? []).map((option) => ({
                  value: option.id,
                  label: option.name,
                })),
              ]}
              onChange={(next) => set(field.id, next)}
            />
          );
        }

        return (
          <label key={field.id}>
            {field.label}
            <input
              type={field.type === "long" ? "number" : "text"}
              min={field.type === "long" ? 0 : undefined}
              value={values[field.id] ?? ""}
              placeholder={field.placeholder}
              onChange={(event) => set(field.id, event.target.value)}
            />
          </label>
        );
      })}

      <button type="submit" className="btn btn-primary btn-block">
        <span>Start Instance</span>
        <span aria-hidden>→</span>
      </button>
    </form>
  );
}
