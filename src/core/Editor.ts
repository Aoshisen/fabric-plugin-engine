import { Canvas } from "fabric";
import type { CanvasEvents, FabricObject } from "fabric";
import mitt from "mitt";
import { ObjectRegistry } from "./ObjectRegistry";
import type {
  CoreEmitter,
  CoreEventMap,
  CoreEventHandler,
  CoreEvents,
  IPlugin,
  PluginConstructor,
  PluginOptions,
  SelectionMode,
} from "./types";

/**
 * 画布入参。
 *
 * 支持三种写法，前两种是业务常用写法，第三种是为了让核心层可测试：
 * 单测里可以塞一个 canvas 替身进来，不用真的起一个浏览器环境。
 */
export type EditorCanvasTarget = HTMLCanvasElement | string | Canvas;

/** 透传给 fabric `Canvas` 的配置项 */
export type EditorOptions = NonNullable<ConstructorParameters<typeof Canvas>[1]>;

/** 区分「元素 / id」和「已经是 Canvas 实例」 */
function resolveCanvas(target: EditorCanvasTarget, options?: EditorOptions): Canvas {
  if (typeof target === "string") return new Canvas(target, options);
  if (typeof HTMLCanvasElement !== "undefined" && target instanceof HTMLCanvasElement) {
    return new Canvas(target, options);
  }
  return target as Canvas;
}

/**
 * 编辑器核心类。
 *
 * 刻意用「组合 mitt」而不是「继承 EventEmitter」：
 * - mitt 只有 ~200B，浏览器原生兼容，不需要 polyfill；
 * - 事件名与 payload 由 `CoreEvents` 约束，`on/off/emit` 全程可推导；
 * - 组合比继承更好扩展（后续要换成别的总线只改一处）。
 *
 * 职责边界：
 * - 持有 canvas、对象注册表、事件总线、插件表；
 * - 把 fabric 的画布事件桥接成编辑器事件；
 * - 管理插件生命周期（装载 / 卸载 / API 代理 / JSON 钩子），插件自身的业务逻辑一律不进这里。
 */
export class Editor {
  /** fabric 画布实例 */
  readonly canvas: Canvas;
  /** 对象注册表：统一的对象实例化入口 */
  readonly registry: ObjectRegistry;

  private readonly emitter: CoreEmitter = mitt<CoreEventMap>();
  private readonly plugins = new Map<string, IPlugin>();
  private readonly installedOptions = new Map<string, PluginOptions>();
  private readonly apiProxies = new Map<string, (...args: unknown[]) => unknown>();
  private readonly canvasDisposers: Array<() => void> = [];
  private destroyed = false;

  constructor(target: EditorCanvasTarget, options?: EditorOptions) {
    this.canvas = resolveCanvas(target, options);
    this.registry = new ObjectRegistry();
    this.bridgeCanvasEvents();
  }

  /* ---------------------------------------------------------------------- */
  /* 事件代理                                                                */
  /* ---------------------------------------------------------------------- */

  /** 订阅编辑器事件，返回 this 以支持链式调用 */
  on<K extends keyof CoreEvents>(event: K, handler: CoreEventHandler<K>): this {
    this.emitter.on(event, handler as never);
    return this;
  }

  /** 取消订阅 */
  off<K extends keyof CoreEvents>(event: K, handler: CoreEventHandler<K>): this {
    this.emitter.off(event, handler as never);
    return this;
  }

  /** 派发事件（插件也可以通过它广播自定义事件） */
  emit<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void {
    this.emitter.emit(event, payload as never);
  }

  /* ---------------------------------------------------------------------- */
  /* 插件管理                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * 装载插件，支持链式调用。
   *
   * ```ts
   * new Editor(el).use(MyCustomObjectPlugin).use(OtherPlugin, { foo: 1 });
   * ```
   *
   * 装载顺序：构造实例 → 登记插件 → 代理 `static apis` → 调用 `init()` → 广播 `plugin:installed`。
   */
  use<T extends IPlugin>(PluginClass: PluginConstructor<T>, options: PluginOptions = {}): this {
    const name = PluginClass.pluginName;
    if (!name) {
      throw new Error("[Editor] 插件必须声明 static pluginName");
    }
    if (this.plugins.has(name)) {
      console.warn(`[Editor] 插件 "${name}" 已经装载过，本次跳过。`);
      return this;
    }

    const mergedOptions: PluginOptions = { ...PluginClass.options, ...options };
    const instance = new PluginClass(this.canvas, this, mergedOptions);

    this.plugins.set(name, instance);
    this.installedOptions.set(name, mergedOptions);
    this.proxyApis(name, instance, PluginClass.apis ?? []);

    instance.init();

    this.emit("plugin:installed", { name, options: mergedOptions });
    return this;
  }

  /** 取插件实例（带泛型，方便拿到插件自身的额外方法） */
  getPlugin<T extends IPlugin = IPlugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined;
  }

  /** 插件是否已装载 */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /** 取插件生效后的配置（默认配置 + use 时传入的覆盖项） */
  getPluginOptions(name: string): PluginOptions | undefined {
    return this.installedOptions.get(name);
  }

  /** 已装载的插件名 */
  get installedPlugins(): string[] {
    return [...this.plugins.keys()];
  }

  /** 已代理到 Editor 实例上的插件 API 名 */
  get apiNames(): string[] {
    return [...this.apiProxies.keys()];
  }

  /* ---------------------------------------------------------------------- */
  /* JSON 导入导出（插件钩子在这里串起来）                                     */
  /* ---------------------------------------------------------------------- */

  /** 导出为 JSON 字符串，依次执行各插件的 `hookExportBefore` */
  exportJSON(): string {
    let json = JSON.stringify(this.canvas.toJSON());
    for (const plugin of this.plugins.values()) {
      if (plugin.hookExportBefore) json = plugin.hookExportBefore(json);
    }
    return json;
  }

  /** 从 JSON 恢复画布，依次执行各插件的 `hookImportBefore` / `hookImportAfter` */
  async loadJSON(json: string): Promise<void> {
    let data = json;
    for (const plugin of this.plugins.values()) {
      if (plugin.hookImportBefore) data = await plugin.hookImportBefore(data);
    }

    await this.canvas.loadFromJSON(JSON.parse(data) as Record<string, unknown>);
    this.canvas.requestRenderAll();

    for (const plugin of this.plugins.values()) {
      plugin.hookImportAfter?.();
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 销毁                                                                    */
  /* ---------------------------------------------------------------------- */

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /** 释放编辑器：卸载所有插件 → 解绑画布事件 → 清空总线 → 销毁 canvas */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    for (const [name, plugin] of this.plugins) {
      try {
        plugin.destroy();
      } catch (error) {
        console.error(`[Editor] 卸载插件 "${name}" 失败：`, error);
      }
      this.emit("plugin:destroyed", { name });
    }
    this.plugins.clear();
    this.installedOptions.clear();

    this.canvasDisposers.forEach((dispose) => dispose());
    this.canvasDisposers.length = 0;

    const self = this as unknown as Record<string, unknown>;
    for (const apiName of this.apiProxies.keys()) delete self[apiName];
    this.apiProxies.clear();

    this.emit("editor:destroyed", { canvas: this.canvas });
    this.emitter.all.clear();

    void this.disposeCanvas();
  }

  /* ---------------------------------------------------------------------- */
  /* 内部实现                                                                */
  /* ---------------------------------------------------------------------- */

  /** 把插件声明的 API 绑到 Editor 实例上，调用方直接 `editor.createMyObject()` */
  private proxyApis(name: string, instance: IPlugin, apis: readonly string[]): void {
    const self = this as unknown as Record<string, unknown>;

    for (const apiName of apis) {
      const method = (instance as unknown as Record<string, unknown>)[apiName];
      if (typeof method !== "function") {
        console.warn(
          `[Editor] 插件 "${name}" 声明了 api "${apiName}"，但实例上没有这个方法，已跳过。`,
        );
        continue;
      }
      const bound = method.bind(instance) as (...args: unknown[]) => unknown;
      this.apiProxies.set(apiName, bound);
      self[apiName] = bound;
    }
  }

  /** 画布事件 → 编辑器事件 */
  private bridgeCanvasEvents(): void {
    this.bindCanvasEvent("object:added", ({ target }) => {
      this.emit("object:added", target);
    });
    this.bindCanvasEvent("object:removed", ({ target }) => {
      this.emit("object:removed", target);
    });
    this.bindCanvasEvent("object:modified", ({ target }) => {
      if (target) this.emit("object:modified", target);
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

  private emitSelection(targets: FabricObject[] | undefined, forceMode?: SelectionMode): void {
    const list = targets ?? [];
    let mode: SelectionMode = "multi";
    if (forceMode) mode = forceMode;
    else if (list.length === 0) mode = "empty";
    else if (list.length === 1) mode = "one";

    this.emit("selection:changed", { mode, targets: list });
  }

  /**
   * 绑定画布事件并记录解绑函数。
   * fabric 的 `on()` 会返回一个 disposer，用它解绑比 `off()` 更精确，
   * 不会误伤插件自己绑在同一事件上的处理器。
   */
  private bindCanvasEvent<K extends keyof CanvasEvents>(
    eventName: K,
    handler: (options: CanvasEvents[K]) => void,
  ): void {
    const disposer: unknown = this.canvas.on(eventName, handler);
    if (typeof disposer === "function") {
      this.canvasDisposers.push(disposer as () => void);
    }
  }

  private disposeCanvas(): Promise<unknown> | undefined {
    const disposable = this.canvas as unknown as { dispose?: () => Promise<boolean> };
    return disposable.dispose?.();
  }
}
