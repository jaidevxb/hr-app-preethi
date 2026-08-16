import { useState } from "react";
import type { WorkflowContext } from "../workflow/types.js";

export function RequestForm({ onSubmit }: { onSubmit: (ctx: WorkflowContext) => void }) {
  const [employeeName, setEmployeeName] = useState("");
  const [days, setDays] = useState("1");
  const [reason, setReason] = useState("");

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          employeeName: employeeName.trim() || "Employee",
          days: days.trim() || "1",
          reason: reason.trim() || "—",
        });
      }}
    >
      <span className="eyebrow">New Request</span>
      <h2>Leave Request</h2>
      <p className="muted">Kicks off the Start Event and routes straight to Manager Review.</p>

      <label>
        Employee name
        <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="e.g. Priya" />
      </label>
      <label>
        Number of days
        <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
      </label>
      <label>
        Reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family trip" />
      </label>

      <button type="submit" className="btn btn-primary">
        Submit Request
      </button>
    </form>
  );
}
