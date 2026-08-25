import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { version } from "../package.json";
import { App } from "./App.js";
import { processLibrary } from "./workflow/processes/index.js";

/**
 * The shell used to be branded for the one process that existed at the time,
 * and stayed that way through five more landing. These pin the parts that
 * should be derived rather than typed.
 */
describe("app shell", () => {
  const markup = () => renderToStaticMarkup(<App />);

  it("names the whole simulator, not whichever process shipped first", () => {
    const html = markup();

    expect(html).toContain("BPMN Simulator");
    for (const { definition } of processLibrary) {
      // No single process's name belongs in the header or footer.
      expect(html).not.toContain(`${definition.name} —`);
    }
  });

  it("counts the processes from the library", () => {
    expect(markup()).toContain(`${processLibrary.length} processes`);
  });

  it("shows the version from package.json", () => {
    expect(markup()).toContain(`v${version}`);
  });
});
