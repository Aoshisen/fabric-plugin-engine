import { Canvas } from "fabric";
import { ObjectRegistry } from "./ObjectRegistry";
import { CanvasBridge, EventBus, Lifecycle, PluginRegistry, Serializer } from "./capabilities";
import type {
  CoreEventHandler,
  CoreEvents,
  IPlugin,
  PluginConstructor,
  PluginOptions,
} from "./types";
import type { Disposable, EditorEvents, EditorSerializer, PluginHost } from "./contracts";

export type EditorCanvasTarget = HTMLCanvasElement | string | Canvas;

export type EditorOptions = NonNullable<ConstructorParameters<typeof Canvas>[1]>;

function resolveCanvas(target: EditorCanvasTarget, options?: EditorOptions): Canvas {
  if (typeof target === "string") return new Canvas(target, options);
  if (typeof HTMLCanvasElement !== "undefined" && target instanceof HTMLCanvasElement) {
    return new Canvas(target, options);
  }
  return target as Canvas;
}

export class Editor implements EditorEvents, PluginHost, EditorSerializer, Disposable {
  /** fabric 画布实例 */
  readonly canvas: Canvas;
  /** 对象注册表：统一的对象实例化入口 */
  readonly registry: ObjectRegistry;

  /** 事件能力单元 */
  readonly events: EventBus;
  /** 插件宿主能力单元 */
  readonly plugins: PluginRegistry;
  /** 序列化能力单元 */
  readonly serializer: Serializer;

  private readonly bridge: CanvasBridge;
  private readonly lifecycle = new Lifecycle();

  constructor(target: EditorCanvasTarget, options?: EditorOptions) {
    this.canvas = resolveCanvas(target, options);
    this.registry = new ObjectRegistry();

    this.events = new EventBus();
    this.plugins = new PluginRegistry({
      canvas: this.canvas,
      editor: this,
      events: this.events,
    });
    this.serializer = new Serializer(this.canvas, this.plugins);

    this.bridge = new CanvasBridge(this.canvas, this.events);
    this.bridge.attach();
  }

  on<K extends keyof CoreEvents>(event: K, handler: CoreEventHandler<K>): this {
    this.events.on(event, handler);
    return this;
  }

  off<K extends keyof CoreEvents>(event: K, handler: CoreEventHandler<K>): this {
    this.events.off(event, handler);
    return this;
  }

  emit<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void {
    this.events.emit(event, payload);
  }

  use<T extends IPlugin>(PluginClass: PluginConstructor<T>, options: PluginOptions = {}): this {
    this.plugins.use(PluginClass, options);
    return this;
  }

  getPlugin<T extends IPlugin = IPlugin>(name: string): T | undefined {
    return this.plugins.getPlugin<T>(name);
  }

  hasPlugin(name: string): boolean {
    return this.plugins.hasPlugin(name);
  }

  getPluginOptions(name: string): PluginOptions | undefined {
    return this.plugins.getPluginOptions(name);
  }

  get installedPlugins(): string[] {
    return this.plugins.installedPlugins;
  }

  get apiNames(): string[] {
    return this.plugins.apiNames;
  }

  get hookPlugins(): readonly IPlugin[] {
    return this.plugins.hookPlugins;
  }

  exportJSON(): string {
    return this.serializer.exportJSON();
  }

  loadJSON(json: string): Promise<void> {
    return this.serializer.loadJSON(json);
  }

  get isDestroyed(): boolean {
    return this.lifecycle.isDestroyed;
  }

  dispose(): void {
    this.lifecycle.run(() => {
      this.plugins.destroyAll();
      this.bridge.detach();

      this.events.emit("editor:destroyed", { canvas: this.canvas });
      this.events.clear();
      // fabric 的 dispose() 是异步的，这里不 await：销毁流程本身是同步收尾
      void this.canvas.dispose();
    });
  }
}
