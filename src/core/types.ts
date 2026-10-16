import type { Canvas, FabricObject } from "fabric";
import type { Emitter } from "mitt";
import type { Editor } from "./Editor";

export type SelectionMode = "one" | "multi" | "empty";

export interface CoreEvents {
  "editor:destroyed": { canvas: Canvas };

  "plugin:installed": { name: string; options: PluginOptions };
  "plugin:destroyed": { name: string };

  "object:added": FabricObject;
  "object:removed": FabricObject;
  "object:modified": FabricObject;

  "selection:changed": { mode: SelectionMode; targets: FabricObject[] };
}

export type CoreEventMap = { [K in keyof CoreEvents]: CoreEvents[K] };

export type CoreEmitter = Emitter<CoreEventMap>;

export type CoreEventHandler<K extends keyof CoreEvents> = (payload: CoreEvents[K]) => void;

export interface ObjectTypeMap {}

export type RegisteredTypeName = Extract<keyof ObjectTypeMap, string>;

export type RegisteredObject<K extends RegisteredTypeName> = ObjectTypeMap[K];

// oxlint-disable-next-line no-explicit-any
export type ObjectCtor<T = FabricObject> = new (options?: any) => T;

export type PluginOptions = Record<string, unknown>;

export interface IPlugin {
  init(): void;
  destroy(): void;
  hookImportBefore?(json: string): string | Promise<string>;
  hookImportAfter?(): void;
  hookExportBefore?(json: string): string;
}

export interface PluginConstructor<T extends IPlugin = IPlugin> {
  new (canvas: Canvas, editor: Editor, options: PluginOptions): T;
  pluginName: string;
  apis?: readonly string[];
  events?: readonly string[];
  options?: PluginOptions;
}

export type PluginUse = PluginConstructor | [PluginConstructor, PluginOptions?];
