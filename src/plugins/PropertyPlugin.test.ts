import { Rect } from "fabric";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Editor } from "../core/Editor";
import { objectTypeName } from "../core/objectType";
import { useEditorStore } from "../stores";
import { asCanvas, MockCanvas } from "../test/MockCanvas";
import EditorStorePlugin from "./EditorStorePlugin";
import PropertyPlugin from "./PropertyPlugin";

function createEditor(): { editor: Editor; canvas: MockCanvas; reasons: string[] } {
  const canvas = new MockCanvas();
  const editor = new Editor(asCanvas(canvas));

  editor.use(EditorStorePlugin, { store: useEditorStore() });
  editor.use(PropertyPlugin);

  const reasons: string[] = [];
  editor.on("properties:changed", ({ reason }) => reasons.push(reason));

  return { editor, canvas, reasons };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("PropertyPlugin", () => {
  it("没有选中对象时快照是 null", () => {
    const { editor } = createEditor();

    expect(editor.readSelectedProperties()).toBeNull();
  });

  it("快照就是 toObject() 的输出，带 type", () => {
    const { editor, canvas } = createEditor();
    const rect = new Rect({ left: 30, top: 40, width: 120, height: 60, fill: "#4f7cff" });
    canvas.add(rect);

    canvas.setActiveObject(rect);
    const snapshot = editor.readSelectedProperties();

    expect(snapshot?.type).toBe("Rect");
    expect(snapshot?.values.width).toBe(120);
    expect(snapshot?.values.left).toBe(30);
    expect(snapshot?.values.fill).toBe("#4f7cff");
    // 和直接序列化的结果一致
    expect(snapshot?.values).toEqual(rect.toObject());
  });

  it("多选时不给快照：多选没有「一个对象的属性」", () => {
    const { editor, canvas } = createEditor();
    const a = new Rect({ width: 10, height: 10 });
    const b = new Rect({ width: 10, height: 10 });
    canvas.add(a, b);

    canvas.setActiveObject(a);
    expect(editor.readSelectedProperties()).not.toBeNull();

    canvas.setActiveObjects([a, b]);
    expect(editor.readSelectedProperties()).toBeNull();
  });

  it("updateSelectedProperties 把补丁写回对象并广播新快照", () => {
    const { editor, canvas, reasons } = createEditor();
    const rect = new Rect({ width: 100, height: 50, fill: "#000000" });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    reasons.length = 0;

    const next = editor.updateSelectedProperties({ width: 260, fill: "#ff0000", opacity: 0.4 });

    expect(rect.width).toBe(260);
    expect(rect.fill).toBe("#ff0000");
    expect(rect.opacity).toBe(0.4);
    expect(next?.values.width).toBe(260);
    expect(reasons).toEqual(["update"]);
  });

  it("type / version 不允许被补丁改掉", () => {
    const { editor, canvas } = createEditor();
    const rect = new Rect({ width: 10, height: 10 });
    canvas.add(rect);
    canvas.setActiveObject(rect);

    editor.updateSelectedProperties({ type: "Circle", version: "0.0.0", width: 20 });

    expect(objectTypeName(rect)).toBe("Rect");
    expect(editor.readSelectedProperties()?.values.type).toBe("Rect");
    expect(rect.width).toBe(20);
  });

  it("补丁里只有结构字段时不动对象", () => {
    const { editor, canvas } = createEditor();
    const rect = new Rect({ width: 10, height: 10 });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    const set = vi.spyOn(rect, "set");

    editor.updateSelectedProperties({ type: "Circle" });

    expect(set).not.toHaveBeenCalled();
  });

  it("没有选中对象时写补丁是空操作", () => {
    const { editor, canvas } = createEditor();
    const rect = new Rect({ width: 10, height: 10 });
    canvas.add(rect);

    expect(editor.updateSelectedProperties({ width: 999 })).toBeNull();
    expect(rect.width).toBe(10);
  });

  it("选择变化会广播快照", () => {
    const { editor, canvas, reasons } = createEditor();
    const rect = new Rect({ width: 10, height: 10 });
    canvas.add(rect);
    reasons.length = 0;

    canvas.setActiveObject(rect);
    expect(reasons).toContain("selection:changed");

    canvas.discardActiveObject();
    expect(reasons).toContain("selection:changed");
    expect(editor.readSelectedProperties()).toBeNull();
  });

  it("拖拽过程中的帧会广播（Node 下没有 rAF，同步执行）", () => {
    const { canvas, reasons } = createEditor();
    const rect = new Rect({ width: 10, height: 10 });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    reasons.length = 0;

    canvas.fire("object:moving", { target: rect });

    expect(reasons).toEqual(["object:transforming"]);
  });

  it("同一帧内的多次拖拽事件被压成一次广播", () => {
    const { canvas, reasons } = createEditor();
    const rect = new Rect({ width: 10, height: 10 });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    reasons.length = 0;

    // Node 里没有 rAF，用一个「先攒着不执行」的替身把排队状态固定下来
    const queued: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queued.push(() => callback(0));
      return queued.length;
    });

    canvas.fire("object:moving", { target: rect });
    canvas.fire("object:moving", { target: rect });
    canvas.fire("object:scaling", { target: rect });
    expect(queued).toHaveLength(1);

    queued[0]();
    expect(reasons).toEqual(["object:transforming"]);

    vi.unstubAllGlobals();
  });

  it("导入 JSON 之后重新广播（这条路没有逐个对象的事件）", async () => {
    const { editor, canvas, reasons } = createEditor();
    canvas.add(new Rect({ width: 10, height: 10 }));
    reasons.length = 0;

    await editor.loadJSON(JSON.stringify({ objects: [] }));

    expect(reasons).toEqual(["import"]);
  });

  it("destroy 之后不再广播", () => {
    const { editor, canvas, reasons } = createEditor();
    const rect = new Rect({ width: 10, height: 10 });
    canvas.add(rect);

    editor.dispose();
    reasons.length = 0;
    canvas.fire("object:added", { target: new Rect({ width: 1, height: 1 }) });

    expect(reasons).toEqual([]);
  });
});

describe("PropertyPlugin 与 EditorStorePlugin 协作", () => {
  it("快照经事件流进 store，未选中时被清空", () => {
    const { canvas } = createEditor();
    const store = useEditorStore();
    const rect = new Rect({ width: 120, height: 60, left: 30 });
    canvas.add(rect);

    canvas.setActiveObject(rect);
    expect(store.selectedType).toBe("Rect");
    expect(store.selectedValues?.width).toBe(120);
    expect(store.canEditProperties).toBe(true);

    canvas.discardActiveObject();
    expect(store.selectedValues).toBeNull();
    expect(store.canEditProperties).toBe(false);
  });

  it("属性写回之后 store 里的值跟着变", () => {
    const { editor, canvas } = createEditor();
    const store = useEditorStore();
    const rect = new Rect({ width: 100, height: 50 });
    canvas.add(rect);
    canvas.setActiveObject(rect);

    editor.updateSelectedProperties({ width: 300 });

    expect(store.selectedValues?.width).toBe(300);
    expect(store.lastEvent).toBe("update");
  });

  it("顺序反过来（属性插件先装）也能拿到快照", () => {
    const canvas = new MockCanvas();
    const editor = new Editor(asCanvas(canvas));
    const store = useEditorStore();
    const rect = new Rect({ width: 42, height: 10 });
    canvas.add(rect);
    canvas.setActiveObject(rect);

    // 先装属性插件：它 init() 时广播的快照这时还没有接收方
    editor.use(PropertyPlugin);
    editor.use(EditorStorePlugin, { store });

    expect(store.selectedValues?.width).toBe(42);
  });
});
