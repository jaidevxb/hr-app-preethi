import { useState } from "react";
import { DocsPage } from "./pages/DocsPage.js";
import { WorkflowPage } from "./pages/WorkflowPage.js";

type Page = "workflow" | "docs";

export function App() {
  const [page, setPage] = useState<Page>("workflow");

  return (
    <div className="app-shell">
      <div className="top-accent" aria-hidden />
      <header className="topnav">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ◆
          </span>
          <div className="brand-text">
            <span className="brand-name">Leave Request</span>
            <span className="brand-tag">BPMN 2.0 Workflow · v1</span>
          </div>
        </div>
        <nav className="tabs">
          <button
            className={"navlink" + (page === "workflow" ? " is-active" : "")}
            onClick={() => setPage("workflow")}
          >
            Workflow
          </button>
          <button className={"navlink" + (page === "docs" ? " is-active" : "")} onClick={() => setPage("docs")}>
            Docs
          </button>
        </nav>
      </header>

      <main>{page === "workflow" ? <WorkflowPage /> : <DocsPage />}</main>

      <footer className="footer">
        <div>Leave Request Workflow — a BPMN process modeling project</div>
        <div className="footer-links">
          <a href="https://github.com/jaidevxb/hr-app-preethi" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <span className="footer-dot" aria-hidden>
            ·
          </span>
          <span className="footer-version">v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}
