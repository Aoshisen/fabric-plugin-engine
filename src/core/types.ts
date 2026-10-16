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
  /**
   * 拖拽 / 缩放 / 旋转 / 斜切**过程中**的实时帧。
   *
   * `object:modified` 只在松手后派发一次，属性面板靠它会出现「拖动时数字不动」的割裂感，
   * 所以这里额外桥出一路高频事件。它由 fabric 自己的渲染帧驱动，
   * 订阅方如果要做重活，请自行按帧合并（见 `PropertyPlugin`）。
   */
  "object:transforming": FabricObject;

  "selection:changed": { mode: SelectionMode; targets: FabricObject[] };
}

export type CoreEventMap = { [K in keyof CoreEvents]: CoreEvents[K] };

export type CoreEmitter = Emitter<CoreEventMap>;

export type CoreEventHandler<K extends keyof CoreEvents> = (payload: CoreEvents[K]) => void;

export interface ObjectTypeMap {}

export type RegisteredTypeName = Extract<keyof ObjectTypeMap, string>;

export type RegisteredObject<K extends RegisteredTypeName> = ObjectTypeMap[K];

/**
 * 对象构造函数。
 *
 * 参数特意放宽成 `any[]`：fabric 这一族类的签名并不统一 ——
 * `new Rect(options)` 是一个参数，`new Text(text, options)` 是两个。
 * 用 `(options?: object) => T` 描述会把 `Text` / `Path` / `Line` 全挡在门外，
 * 而注册表恰恰要能装下它们。
 */
// oxlint-disable-next-line no-explicit-any
export type ObjectCtor<T = FabricObject> = new (...args: any[]) => T;

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
