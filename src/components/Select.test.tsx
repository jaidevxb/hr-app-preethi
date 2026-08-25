import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { describeProcess, processHighlights } from "../workflow/describeProcess.js";
import { findProcess, processLibrary } from "../workflow/processes/index.js";
import { Select } from "./Select.js";

const OPTIONS = [
  { value: "a", label: "Alpha", hint: "first" },
  { value: "b", label: "Beta", warning: true },
];

describe("Select", () => {
  const render = (value: string) =>
    renderToStaticMarkup(
      <Select label="Process" value={value} options={OPTIONS} onChange={() => {}} />
    );

  it("shows the selected option and keeps the list closed", () => {
    const html = render("b");

    expect(html).toContain("Beta");
    expect(html).toContain('aria-expanded="false"');
    // The popup only exists once opened, so no option rows in the markup.
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain("first");
  });

  it("wires the combobox up for screen readers", () => {
    const html = render("a");

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain("aria-controls=");
    expect(html).toContain("aria-labelledby=");
  });

  it("falls back to a placeholder when the value matches nothing", () => {
    const html = renderToStaticMarkup(
      <Select label="Process" value="" options={[]} onChange={() => {}} />
    );
    expect(html).toContain("Select…");
  });
});

describe("processHighlights", () => {
  it("reads a process's notable elements off its definition", () => {
    expect(processHighlights(findProcess("Process_LeaveRequest").definition)).toEqual([
      "parallel",
      "decision",
      "SLA timer",
      "service task",
    ]);

    expect(processHighlights(findProcess("Process_EmployeeOffboarding").definition)).toContain(
      "inclusive OR"
    );

    const po = processHighlights(findProcess("Process_VendorPurchaseOrder").definition);
    expect(po).toEqual(expect.arrayContaining(["message", "signal", "timer", "terminate"]));
  });

  it("describes every process in the library without running long", () => {
    for (const { definition } of processLibrary) {
      const hint = describeProcess(definition);
      expect(hint.length, `${definition.name} hint`).toBeGreaterThan(0);
      expect(hint.split(" · ").length, `${definition.name} tag count`).toBeLessThanOrEqual(4);
    }
  });
});
