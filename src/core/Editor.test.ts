import { Rect } from "fabric";
import { describe, expect, it, vi } from "vite-plus/test";
import { Editor } from "./Editor";
import { BasePlugin } from "../plugins/BasePlugin";
import { asCanvas, MockCanvas } from "../test/MockCanvas";
import type { PluginOptions } from "./types";

/** 测试用插件：只关心「能被装载 / 能被代理 / 生命周期被调到」 */
class TestPlugin extends BasePlugin {
  static pluginName = "TestPlugin";
  static apis = ["ping"];
  static events = ["test:changed"];
  static options: PluginOptions = { greeting: "hi" };

  initCalls = 0;
  destroyCalls = 0;

  init(): void {
    this.initCalls += 1;
  }

  override destroy(): void {
    this.destroyCalls += 1;
  }

  ping(): string {
    return String(this.options.greeting);
  }
}

/** 声明了一个不存在的 api，用来验证代理时的保护逻辑 */
class BrokenApiPlugin extends BasePlugin {
  static pluginName = "BrokenApiPlugin";
  static apis = ["notImplemented"];

  init(): void {
    // no-op
  }
}

/** 勾住 JSON 导入导出的插件 */
class HookPlugin extends BasePlugin {
  static pluginName = "HookPlugin";

  importAfterCalls = 0;

  init(): void {
    // no-op
  }

  override hookExportBefore(json: string): string {
    const data = JSON.parse(json) as Record<string, unknown>;
    data.exportedBy = HookPlugin.pluginName;
    return JSON.stringify(data);
  }

  override hookImportBefore(json: string): string {
    const data = JSON.parse(json) as Record<string, unknown>;
    data.migrated = true;
    return JSON.stringify(data);
  }

  override hookImportAfter(): void {
    this.importAfterCalls += 1;
  }
}

function createEditor(): { editor: Editor; canvas: MockCanvas } {
  const canvas = new MockCanvas();
  return { editor: new Editor(asCanvas(canvas)), canvas };
}

describe("Editor", () => {
  it("新实例自带空的注册表与插件表", () => {
    const { editor } = createEditor();

    expect(editor.registry).toBeDefined();
    expect(editor.installedPlugins).toEqual([]);
    expect(editor.apiNames).toEqual([]);
    expect(editor.isDestroyed).toBe(false);
  });

  it("把 fabric 的 object:added / object:removed 桥接成编辑器事件", () => {
    const { editor, canvas } = createEditor();
    const added: unknown[] = [];
    const removed: unknown[] = [];

    editor.on("object:added", (object) => added.push(object));
    editor.on("object:removed", (object) => removed.push(object));

    const rect = new Rect({ width: 10, height: 10 });
    canvas.add(rect);
    canvas.remove(rect);

    expect(added).toEqual([rect]);
    expect(removed).toEqual([rect]);
  });

  it("选择状态：单选取 one、多选取 multi、清空取 empty", () => {
    const { editor, canvas } = createEditor();
    const modes: string[] = [];
    const counts: number[] = [];

    editor.on("selection:changed", ({ mode, targets }) => {
      modes.push(mode);
      counts.push(targets.length);
    });

    const a = new Rect({ width: 10, height: 10 });
    const b = new Rect({ width: 10, height: 10 });

    canvas.fire("selection:created", { selected: [a] });
    canvas.fire("selection:updated", { selected: [a, b] });
    canvas.fire("selection:cleared", { deselected: [a, b] });

    expect(modes).toEqual(["one", "multi", "empty"]);
    expect(counts).toEqual([1, 2, 2]);
  });

  it("use() 装载插件：调用 init 并广播 plugin:installed", () => {
    const { editor } = createEditor();
    const installed: string[] = [];
    editor.on("plugin:installed", ({ name }) => installed.push(name));

    editor.use(TestPlugin);

    expect(editor.hasPlugin("TestPlugin")).toBe(true);
    expect(editor.installedPlugins).toEqual(["TestPlugin"]);
    expect(editor.getPlugin<TestPlugin>("TestPlugin")?.initCalls).toBe(1);
    expect(installed).toEqual(["TestPlugin"]);
  });

  it("重复装载同一个插件会被跳过并给出警告", () => {
    const { editor } = createEditor();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    editor.use(TestPlugin).use(TestPlugin);

    expect(editor.getPlugin<TestPlugin>("TestPlugin")?.initCalls).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("use() 时传入的选项会覆盖插件的默认配置", () => {
    const { editor } = createEditor();

    editor.use(TestPlugin, { greeting: "overridden" });

    expect(editor.getPlugin<TestPlugin>("TestPlugin")?.ping()).toBe("overridden");
    expect(editor.getPluginOptions("TestPlugin")).toEqual({ greeting: "overridden" });
  });

  it("static apis 声明的方法会被代理到 Editor 实例上", () => {
    const { editor } = createEditor();

    editor.use(TestPlugin);

    const proxied = editor as unknown as { ping: () => string };
    expect(editor.apiNames).toEqual(["ping"]);
    expect(proxied.ping()).toBe("hi");
  });

  it("api 名写在 apis 里但实例上不存在时，只告警不挂载", () => {
    const { editor } = createEditor();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    editor.use(BrokenApiPlugin);

    expect(editor.apiNames).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("destroy() 会卸载插件、清掉代理、销毁画布", () => {
    const { editor, canvas } = createEditor();
    editor.use(TestPlugin);
    const plugin = editor.getPlugin<TestPlugin>("TestPlugin");
    const events: string[] = [];
    editor.on("editor:destroyed", ({ canvas: destroyed }) =>
      events.push(String(destroyed === editor.canvas)),
    );

    editor.dispose();

    expect(plugin?.destroyCalls).toBe(1);
    expect(editor.isDestroyed).toBe(true);
    expect(editor.installedPlugins).toEqual([]);
    expect(editor.apiNames).toEqual([]);
    expect((editor as unknown as Record<string, unknown>).ping).toBeUndefined();
    expect(canvas.disposed).toBe(true);
    expect(events).toEqual(["true"]);
  });

  it("destroy() 幂等，重复调用不会重复卸载插件", () => {
    const { editor } = createEditor();
    editor.use(TestPlugin);
    const plugin = editor.getPlugin<TestPlugin>("TestPlugin");

    editor.dispose();
    editor.dispose();

    expect(plugin?.destroyCalls).toBe(1);
  });

  it("exportJSON / loadJSON 会把各插件的钩子串起来", async () => {
    const { editor, canvas } = createEditor();
    editor.use(HookPlugin);
    const plugin = editor.getPlugin<HookPlugin>("HookPlugin")!;

    const json = editor.exportJSON();
    expect(JSON.parse(json)).toMatchObject({ exportedBy: "HookPlugin" });

    await editor.loadJSON(json);

    expect(canvas.loadedJSON).toMatchObject({ migrated: true });
    expect(plugin.importAfterCalls).toBe(1);
  });
});

/**
 * 能力单元：验证「一个 trait = 一个单元」的拆分是真的成立。
 *
 * 这些断言不看门面，直接打 `editor.events` / `editor.plugins` / `editor.serializer`，
 * 确认门面只是转发、底层单元能独立工作、且两边共用同一份状态。
 */
describe("能力单元", () => {
  it("editor.events 与门面共用同一条总线", () => {
    const { editor } = createEditor();
    const viaUnit: string[] = [];
    const viaFacade: string[] = [];

    // 单元上订阅，门面派发
    editor.events.on("plugin:destroyed", ({ name }) => viaUnit.push(name));
    editor.emit("plugin:destroyed", { name: "A" });

    // 门面上订阅，单元派发
    editor.on("plugin:destroyed", ({ name }) => viaFacade.push(name));
    editor.events.emit("plugin:destroyed", { name: "B" });

    expect(viaUnit).toEqual(["A", "B"]);
    expect(viaFacade).toEqual(["B"]);
  });

  it("一个订阅者抛错不会打断同一事件上的其他订阅者", () => {
    const { editor } = createEditor();
    const seen: string[] = [];
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    editor.on("plugin:destroyed", () => {
      throw new Error("boom");
    });
    editor.on("plugin:destroyed", ({ name }) => seen.push(name));

    expect(() => editor.emit("plugin:destroyed", { name: "A" })).not.toThrow();
    expect(seen).toEqual(["A"]);
    expect(errors).toHaveBeenCalledOnce();

    errors.mockRestore();
  });

  it("editor.plugins.hookPlugins 与 installedPlugins 同步", () => {
    const { editor } = createEditor();
    expect(editor.hookPlugins).toEqual([]);

    editor.use(TestPlugin);

    expect(editor.hookPlugins.map((plugin) => plugin.constructor.name)).toEqual(["TestPlugin"]);
    expect(editor.hookPlugins).toHaveLength(editor.installedPlugins.length);
  });

  it("editor.serializer 可独立调用，行为与门面一致", async () => {
    const { editor, canvas } = createEditor();
    editor.use(HookPlugin);

    // 单元直调 → 钩子照样串起来
    const viaUnit = editor.serializer.exportJSON();
    expect(JSON.parse(viaUnit)).toMatchObject({ exportedBy: "HookPlugin" });

    // 门面转发 → 同一份逻辑
    expect(JSON.parse(editor.exportJSON())).toMatchObject({ exportedBy: "HookPlugin" });

    await editor.serializer.loadJSON(viaUnit);
    expect(canvas.loadedJSON).toMatchObject({ migrated: true });
  });

  it("dispose 之后总线已清空，再派发不会触达旧订阅", () => {
    const { editor } = createEditor();
    const seen: string[] = [];
    editor.events.on("object:added", (object) => seen.push(String(object)));

    editor.dispose();

    editor.emit("object:added", new Rect({ width: 10, height: 10 }));

    expect(seen).toEqual([]);
  });
});
