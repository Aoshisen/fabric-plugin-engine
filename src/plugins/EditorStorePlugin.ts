import type { FabricObject } from "fabric";
import { BasePlugin } from "./BasePlugin";
import { useEditorStore } from "../stores";
import type { EditorUIStore } from "../stores";
import type { ObjectPropertiesSnapshot } from "./PropertyPlugin";
import type { CoreEvents, PluginOptions, SelectionMode } from "../core/types";

/** 插件配置 */
export interface EditorStorePluginOptions extends PluginOptions {
  /**
   * 同步目标的 Pinia store 实例。
   *
   * 不传时会自动 `useEditorStore()`（要求当前有 active pinia）。
   * 显式传入的好处：不用猜用的是哪个 pinia，也方便单测直接塞一个 store。
   */
  store?: EditorUIStore;
  /** 编辑器销毁时是否清空 store，默认 `true` */
  resetOnDestroy?: boolean;
}

/** 由选中对象数量推导选择模式，和 `Editor` 里的桥接逻辑保持一致 */
function modeOf(targets: FabricObject[]): SelectionMode {
  if (targets.length === 0) return "empty";
  return targets.length === 1 ? "one" : "multi";
}

/**
 * 状态插件：**只做一件事** —— 把 `Editor` 的事件翻译成 Pinia 里的 UI 状态。
 *
 * ```
 * fabric canvas ──▶ Editor（mitt 事件总线）──▶ EditorStorePlugin ──▶ Pinia store ──▶ 组件
 * ```
 *
 * 这样组件层完全不碰 Editor 实例：画布上发生什么，UI 就读什么。
 * 想再挂一个新的面板（图层面板、属性面板），只要读同一个 store。
 *
 * 几个容易被忽略的点：
 * - 装载时要先做一次**全量快照**：插件可能在画布已有内容之后才装上；
 * - `hookImportAfter()` 必须重新同步：导入 JSON 会整体替换画布对象，但不一定触发事件；
 * - `destroy()` 里要先解绑再清状态，否则清理过程中触发的事件又会写回 store。
 */
export default class EditorStorePlugin extends BasePlugin {
  static pluginName = "EditorStorePlugin";
  static events = ["editorStore:synced"];
  static apis = ["syncEditorState"];
  static options: EditorStorePluginOptions = { resetOnDestroy: true };

  private store!: EditorUIStore;
  /** 事件解绑函数；`Editor.destroy()` → `plugin.destroy()` 时会逐个执行 */
  private readonly disposers: Array<() => void> = [];

  private get pluginOptions(): EditorStorePluginOptions {
    return this.options as EditorStorePluginOptions;
  }

  init(): void {
    const store = this.pluginOptions.store ?? useEditorStore();
    if (!store) {
      throw new Error(
        "[EditorStorePlugin] 找不到 Pinia store，请用 editor.use(EditorStorePlugin, { store }) 传入。",
      );
    }
    this.store = store;

    // 1. 先全量同步一次，把「插件装载前画布上已有的内容」补上
    this.syncAll("init");

    // 2. 再订阅增量事件
    this.listen("object:added", () => this.syncObjects("object:added"));
    this.listen("object:removed", () => this.syncObjects("object:removed"));
    this.listen("object:modified", () => this.syncObjects("object:modified"));

    this.listen("selection:changed", ({ mode, targets }) => this.syncSelection(mode, targets));

    this.listen("properties:changed", ({ reason, snapshot }) =>
      this.syncProperties(reason, snapshot),
    );

    this.listen("plugin:installed", () => this.syncPlugins("plugin:installed"));
    this.listen("plugin:destroyed", () => this.syncPlugins("plugin:destroyed"));

    // 3. 属性快照的来源是 `properties:changed`，它只在 `PropertyPlugin` 里发。
    //    如果属性插件**先于**本插件装载，它装载时那次广播就没人接住了 ——
    //    所以在装载时主动补读一次。能力不在就静默跳过，靠事件兜底。
    if (this.editor.hasPlugin("PropertyPlugin")) {
      this.syncProperties("init", this.editor.readSelectedProperties());
    }
  }

  override destroy(): void {
    this.disposers.forEach((dispose) => dispose());
    this.disposers.length = 0;

    if (this.pluginOptions.resetOnDestroy !== false) {
      this.store.reset();
    }
  }

  /**
   * 导入 JSON 之后重新同步。
   * `loadFromJSON()` 会整体替换画布内容，而且不保证逐个派发 `object:added`，
   * 所以在插件钩子里主动兜一次。
   */
  override hookImportAfter(): void {
    this.syncAll("import");
  }

  /* ------------------------------- 对外 API ------------------------------- */

  /** 手动强制同步一次（可通过 `editor.syncEditorState()` 调用） */
  syncEditorState(): void {
    this.syncAll("manual");
  }

  /* ------------------------------- 内部实现 ------------------------------- */

  /**
   * 订阅编辑器事件并记下解绑函数。
   *
   * mitt 的 `off()` 需要同一个函数引用，所以这里把 handler 一起闭包进 disposer，
   * 不用像 `canvas.off('object:added')` 那样有误伤其他插件的风险。
   */
  private listen<K extends keyof CoreEvents>(
    event: K,
    handler: (payload: CoreEvents[K]) => void,
  ): void {
    this.editor.on(event, handler as never);
    this.disposers.push(() => this.editor.off(event, handler as never));
  }

  /** 全量快照：对象数 + 选择 + 插件列表 */
  private syncAll(reason: string): void {
    const active = this.canvas.getActiveObjects();
    this.store.setObjectCount(this.canvas.getObjects().length);
    this.store.setSelection(modeOf(active), active);
    this.store.setPlugins(this.editor.installedPlugins);
    this.commit(reason);
  }

  private syncObjects(reason: string): void {
    this.store.setObjectCount(this.canvas.getObjects().length);
    this.commit(reason);
  }

  private syncSelection(mode: SelectionMode, targets: FabricObject[]): void {
    this.store.setSelection(mode, targets);
    this.commit("selection:changed");
  }

  /**
   * 属性快照。
   *
   * 注意这里**不**自己去调 `toObject()`：谁读对象、读哪些字段是 `PropertyPlugin`
   * 的职责，本插件只负责把收到的东西放进 store。
   */
  private syncProperties(reason: string, snapshot: ObjectPropertiesSnapshot | null): void {
    this.store.setSelectedProperties(snapshot);
    this.commit(reason);
  }

  private syncPlugins(reason: string): void {
    this.store.setPlugins(this.editor.installedPlugins);
    this.commit(reason);
  }

  /** 所有同步都收口到这里：记事件名 + 广播一次，方便外部（devtools / 其他插件）挂观察 */
  private commit(reason: string): void {
    this.store.markEvent(reason);
    this.editor.emit("editorStore:synced", {
      reason,
      objectCount: this.store.objectCount,
      selectionMode: this.store.selectionMode,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* 类型增强：让核心层认识这个插件                                              */
/* -------------------------------------------------------------------------- */

declare module "../core/types" {
  interface CoreEvents {
    /** EditorStorePlugin 每次把 Editor 事件同步进 store 后派发 */
    "editorStore:synced": {
      /** 触发同步的事件名，或 `init` / `import` / `manual` */
      reason: string;
      objectCount: number;
      selectionMode: SelectionMode;
    };
  }
}

declare module "../core/Editor" {
  interface Editor {
    /** 手动强制把当前画布状态同步进 store */
    syncEditorState(): void;
  }
}
