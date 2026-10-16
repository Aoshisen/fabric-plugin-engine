import type { Canvas } from "fabric";
import type { Editor } from "../Editor";
import type { IPlugin, PluginConstructor, PluginOptions } from "../types";
import type { EditorEvents, PluginHost } from "../contracts";

export interface PluginHostContext {
  readonly canvas: Canvas;
  readonly editor: Editor;
  readonly events: EditorEvents;
}

export class PluginRegistry implements PluginHost {
  private readonly plugins = new Map<string, IPlugin>();
  private readonly installedOptions = new Map<string, PluginOptions>();
  private readonly apiProxies = new Map<string, (...args: unknown[]) => unknown>();

  private readonly context: PluginHostContext;

  constructor(context: PluginHostContext) {
    this.context = context;
  }

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
    const instance = new PluginClass(this.context.canvas, this.context.editor, mergedOptions);

    this.plugins.set(name, instance);
    this.installedOptions.set(name, mergedOptions);
    this.proxyApis(name, instance, PluginClass.apis ?? []);

    instance.init();

    this.context.events.emit("plugin:installed", { name, options: mergedOptions });
    return this;
  }

  getPlugin<T extends IPlugin = IPlugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined;
  }

  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  getPluginOptions(name: string): PluginOptions | undefined {
    return this.installedOptions.get(name);
  }

  get installedPlugins(): string[] {
    return [...this.plugins.keys()];
  }

  get apiNames(): string[] {
    return [...this.apiProxies.keys()];
  }

  get hookPlugins(): readonly IPlugin[] {
    return [...this.plugins.values()];
  }

  destroyAll(): void {
    for (const [name, plugin] of this.plugins) {
      try {
        plugin.destroy();
      } catch (error) {
        console.error(`[Editor] 卸载插件 "${name}" 失败：`, error);
      }
      this.context.events.emit("plugin:destroyed", { name });
    }

    this.plugins.clear();
    this.installedOptions.clear();

    const target = this.context.editor as unknown as Record<string, unknown>;
    for (const apiName of this.apiProxies.keys()) delete target[apiName];
    this.apiProxies.clear();
  }

  private proxyApis(name: string, instance: IPlugin, apis: readonly string[]): void {
    const target = this.context.editor as unknown as Record<string, unknown>;

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
      target[apiName] = bound;
    }
  }
}
