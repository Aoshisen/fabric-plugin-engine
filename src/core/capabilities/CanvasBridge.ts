import type { Canvas, CanvasEvents, FabricObject } from "fabric";
import type { SelectionMode } from "../types";
import type { EditorEvents } from "../contracts";

export class CanvasBridge {
  private readonly disposers: Array<() => void> = [];

  private readonly canvas: Canvas;
  private readonly events: EditorEvents;

  constructor(canvas: Canvas, events: EditorEvents) {
    this.canvas = canvas;
    this.events = events;
  }

  attach(): void {
    this.bindCanvasEvent("object:added", ({ target }) => {
      this.events.emit("object:added", target);
    });
    this.bindCanvasEvent("object:removed", ({ target }) => {
      this.events.emit("object:removed", target);
    });
    this.bindCanvasEvent("object:modified", ({ target }) => {
      if (target) this.events.emit("object:modified", target);
    });

    this.bindCanvasEvent("selection:created", ({ selected }) => {
      this.emitSelection(selected);
    });
    this.bindCanvasEvent("selection:updated", ({ selected }) => {
      this.emitSelection(selected);
    });
    this.bindCanvasEvent("selection:cleared", ({ deselected }) => {
      this.emitSelection(deselected, "empty");
    });
  }

  detach(): void {
    this.disposers.forEach((dispose) => dispose());
    this.disposers.length = 0;
  }

  private emitSelection(targets: FabricObject[] | undefined, forceMode?: SelectionMode): void {
    const list = targets ?? [];
    let mode: SelectionMode = "multi";
    if (forceMode) mode = forceMode;
    else if (list.length === 0) mode = "empty";
    else if (list.length === 1) mode = "one";

    this.events.emit("selection:changed", { mode, targets: list });
  }

  private bindCanvasEvent<K extends keyof CanvasEvents>(
    eventName: K,
    handler: (options: CanvasEvents[K]) => void,
  ): void {
    const disposer: unknown = this.canvas.on(eventName, handler);
    if (typeof disposer === "function") {
      this.disposers.push(disposer as () => void);
    }
  }
}
