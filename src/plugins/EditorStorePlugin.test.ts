import { Rect } from "fabric";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { Editor } from "../core/Editor";
import { useEditorStore } from "../stores";
import { asCanvas, MockCanvas } from "../test/MockCanvas";
import { BasePlugin } from "./BasePlugin";
import EditorStorePlugin from "./EditorStorePlugin";

/** 用来验证「后装载的插件会刷新 store 里的插件列表」 */
class OtherPlugin extends BasePlugin {
  static pluginName = "OtherPlugin";

  init(): void {
    // no-op
  }
}

function createEditor(options: { resetOnDestroy?: boolean } = {}): {
  editor: Editor;
  canvas: MockCanvas;
  store: ReturnType<typeof useEditorStore>;
} {
  const canvas = new MockCanvas();
  const editor = new Editor(asCanvas(canvas));
  const store = useEditorStore();

  editor.use(EditorStorePlugin, { store, ...options });
  return { editor, canvas, store };
}

beforeEach(() => {
  // Pinia 的 store 需要 active pinia；组件外的单测要自己铺一下
  setActivePinia(createPinia());
});

describe("useEditorStore", () => {
  it("初始是空画布状态", () => {
    const store = useEditorStore();

    expect(store.objectCount).toBe(0);
    expect(store.selectionMode).toBe("empty");
    expect(store.selected).toEqual([]);
    expect(store.hasObjects).toBe(false);
    expect(store.selectionLabel).toBe("未选中");
  });
});

describe("EditorStorePlugin", () => {
  it("装载时先做一次全量快照（画布可能已有内容）", () => {
    const canvas = new MockCanvas();
    const editor = new Editor(asCanvas(canvas));
    const store = useEditorStore();
    const reasons: string[] = [];
    editor.on("editorStore:synced", ({ reason }) => reasons.push(reason));
    // 先放对象、后装插件：没有这次全量同步，store 就会是 0
    canvas.add(new Rect({ width: 10, height: 10 }));

    editor.use(EditorStorePlugin, { store });

    expect(store.objectCount).toBe(1);
    expect(store.installedPlugins).toEqual(["EditorStorePlugin"]);
    // 装载过程中同步两次：插件自己的全量快照 → 随后 plugin:installed 再刷新插件列表
    expect(reasons).toEqual(["init", "plugin:installed"]);
    expect(store.lastEvent).toBe("plugin:installed");
  });

  it("object:added / object:removed 同步对象数量", () => {
    const { canvas, store } = createEditor();
    const rect = new Rect({ width: 10, height: 10 });

    canvas.add(rect);
    expect(store.objectCount).toBe(1);
    expect(store.hasObjects).toBe(true);
    expect(store.lastEvent).toBe("object:added");

    canvas.remove(rect);
    expect(store.objectCount).toBe(0);
    expect(store.hasObjects).toBe(false);
    expect(store.lastEvent).toBe("object:removed");
  });

  it("selection:changed 把选择状态翻译成 UI 状态", () => {
    const { canvas, store } = createEditor();
    const a = new Rect({ width: 10, height: 10 });
    const b = new Rect({ width: 10, height: 10 });
    canvas.add(a, b);

    canvas.setActiveObject(a);
    expect(store.selectionMode).toBe("one");
    expect(store.isSingleSelection).toBe(true);
    expect(store.selectionLabel).toBe("单选 1 个");
    expect(store.selected.map((item) => item.type)).toEqual(["Rect"]);

    canvas.fire("selection:updated", { selected: [a, b] });
    expect(store.selectionMode).toBe("multi");
    expect(store.isMultiSelection).toBe(true);
    expect(store.selectionLabel).toBe("多选 2 个");

    canvas.discardActiveObject();
    expect(store.selectionMode).toBe("empty");
    expect(store.hasSelection).toBe(false);
    // Editor 在 cleared 时会带上「刚被取消选中的对象」，store 侧要归一化成空
    expect(store.selected).toEqual([]);
  });

  it("plugin:installed 会刷新插件列表", () => {
    const { editor, store } = createEditor();

    editor.use(OtherPlugin);

    expect(store.installedPlugins).toEqual(["EditorStorePlugin", "OtherPlugin"]);
    expect(store.lastEvent).toBe("plugin:installed");
  });

  it("loadJSON 之后靠 hookImportAfter 重新同步（这条路径没有事件）", async () => {
    const { editor, canvas, store } = createEditor();
    canvas.add(new Rect({ width: 10, height: 10 }));
    expect(store.objectCount).toBe(1);

    await editor.loadJSON(JSON.stringify({ objects: [] }));

    expect(store.objectCount).toBe(0);
    expect(store.lastEvent).toBe("import");
  });

  it("每次同步都会派发 editorStore:synced", () => {
    const { editor, canvas } = createEditor();
    const reasons: string[] = [];
    editor.on("editorStore:synced", ({ reason }) => reasons.push(reason));

    canvas.add(new Rect({ width: 10, height: 10 }));

    expect(reasons).toEqual(["object:added"]);
  });

  it("syncEditorState() 经 API 代理可用，能修正静默变更", () => {
    const { editor, canvas, store } = createEditor();
    // 绕过事件直接改画布，模拟「外部代码动了 canvas 但没派发事件」
    canvas.objects.push(new Rect({ width: 10, height: 10 }));
    expect(store.objectCount).toBe(0);

    editor.syncEditorState();

    expect(store.objectCount).toBe(1);
    expect(store.lastEvent).toBe("manual");
    expect(editor.apiNames).toContain("syncEditorState");
  });

  it("不传 store 时自动取当前 Pinia 实例上的 store", () => {
    const canvas = new MockCanvas();
    const editor = new Editor(asCanvas(canvas));

    editor.use(EditorStorePlugin);

    expect(useEditorStore().installedPlugins).toEqual(["EditorStorePlugin"]);
  });

  it("destroy() 先解绑事件再清空 store", () => {
    const { editor, canvas, store } = createEditor();
    canvas.add(new Rect({ width: 10, height: 10 }));

    editor.dispose();

    expect(store.objectCount).toBe(0);
    expect(store.installedPlugins).toEqual([]);
    expect(store.lastEvent).toBeNull();

    // 解绑之后再触发事件，不应该再写回 store
    store.setObjectCount(5);
    canvas.fire("object:added", { target: new Rect({ width: 10, height: 10 }) });
    expect(store.objectCount).toBe(5);
  });

  it("resetOnDestroy: false 时销毁后保留 store 内容", () => {
    const { editor, canvas, store } = createEditor({ resetOnDestroy: false });
    canvas.add(new Rect({ width: 10, height: 10 }));

    editor.dispose();

    expect(store.objectCount).toBe(1);
  });
});
