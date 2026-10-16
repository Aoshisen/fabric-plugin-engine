import type {
  CoreEventHandler,
  CoreEvents,
  IPlugin,
  PluginConstructor,
  PluginOptions,
} from "./types";

export interface EditorEvents {
  on<K extends keyof CoreEvents>(event: K, handler: CoreEventHandler<K>): this;
  off<K extends keyof CoreEvents>(event: K, handler: CoreEventHandler<K>): this;
  emit<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void;
}

export interface PluginHost {
  use<T extends IPlugin>(PluginClass: PluginConstructor<T>, options?: PluginOptions): this;
  getPlugin<T extends IPlugin = IPlugin>(name: string): T | undefined;
  hasPlugin(name: string): boolean;
  getPluginOptions(name: string): PluginOptions | undefined;
  readonly installedPlugins: string[];
  readonly apiNames: string[];
  readonly hookPlugins: readonly IPlugin[];
}

export interface EditorSerializer {
  exportJSON(): string;
  loadJSON(json: string): Promise<void>;
}

export interface Disposable {
  readonly isDestroyed: boolean;
  dispose(): void;
}
