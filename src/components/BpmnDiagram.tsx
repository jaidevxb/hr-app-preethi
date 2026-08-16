import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import { useEffect, useRef, useState } from "react";
import Viewer from "bpmn-js/lib/Viewer";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";
import leaveRequestBpmnXml from "../workflow/leaveRequestWorkflow.bpmn?raw";

const VISITED_MARKER = "bpmn-visited";
const CURRENT_MARKER = "bpmn-current";

// Plain Viewer (no NavigatedViewer) — static, no drag-to-pan/scroll-to-zoom,
// so the diagram can't get knocked off-center by accidental interaction.
function fitAndCenter(canvas: Canvas) {
  canvas.zoom("fit-viewport", { x: 0, y: 0 });
}

export function BpmnDiagram({ visitedIds, currentId }: { visitedIds: string[]; currentId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const viewer = new Viewer({ container: containerRef.current });
    viewerRef.current = viewer;
    let cancelled = false;

    const importDone = viewer
      .importXML(leaveRequestBpmnXml)
      .then(() => {
        if (cancelled) return;
        fitAndCenter(viewer.get<Canvas>("canvas"));
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) console.error("Failed to render BPMN diagram", err);
      });

    return () => {
      cancelled = true;
      // React 18 StrictMode mounts effects twice in dev; destroying mid-import
      // races bpmn-js's internal render pipeline, so wait for it to settle first.
      importDone.finally(() => viewer.destroy());
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer) return;

    const canvas = viewer.get<Canvas>("canvas");
    const elementRegistry = viewer.get<ElementRegistry>("elementRegistry");

    elementRegistry.forEach((el) => {
      canvas.removeMarker(el.id, VISITED_MARKER);
      canvas.removeMarker(el.id, CURRENT_MARKER);
    });

    for (const id of visitedIds) {
      if (elementRegistry.get(id)) canvas.addMarker(id, VISITED_MARKER);
    }
    if (currentId && elementRegistry.get(currentId)) {
      canvas.addMarker(currentId, CURRENT_MARKER);
    }
  }, [ready, visitedIds, currentId]);

  return (
    <div className="bpmn-frame">
      <div ref={containerRef} className="bpmn-canvas" />
    </div>
  );
}
