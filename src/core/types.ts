import type { Canvas, FabricObject } from "fabric";
import type { Emitter } from "mitt";
import type { Editor } from "./Editor";

/* -------------------------------------------------------------------------- */
/* 事件                                                                        */
/* -------------------------------------------------------------------------- */

/** 画布选择状态：单选 / 多选 / 空选 */
export type SelectionMode = "one" | "multi" | "empty";

/**
 * 核心事件表。
 *
 * 这里刻意用 `interface` 而不是 `type`，因为插件需要往事件表里补自己的事件：
 *
 * ```ts
 * declare module "../core/types" {
 *   interface CoreEvents {
 *     "myPlugin:change": { payload: MyCustomObject };
 *   }
 * }
 * ```
 *
 * 这样 `editor.on("myPlugin:change", (p) => ...)` 里的 `p` 会自动推导。
 */
export interface CoreEvents {
  /** 编辑器已销毁 */
  "editor:destroyed": { canvas: Canvas };

  /** 插件装载完成 */
  "plugin:installed": { name: string; options: PluginOptions };
  /** 插件已卸载 */
  "plugin:destroyed": { name: string };

  /** 画布对象增 / 删 / 改 */
  "object:added": FabricObject;
  "object:removed": FabricObject;
  "object:modified": FabricObject;

  /** 选择状态变化 */
  "selection:changed": { mode: SelectionMode; targets: FabricObject[] };
}

/**
 * mitt 的泛型约束要求参数满足 `Record<string, unknown>`，
 * 而 interface 没有隐式索引签名，所以这里用映射类型中转一次。
 * 新增事件依然只写在 `CoreEvents` 里。
 */
export type CoreEventMap = { [K in keyof CoreEvents]: CoreEvents[K] };

/** 事件总线类型 */
export type CoreEmitter = Emitter<CoreEventMap>;

/** 事件回调签名（payload 由事件名自动推导） */
export type CoreEventHandler<K extends keyof CoreEvents> = (payload: CoreEvents[K]) => void;

/* -------------------------------------------------------------------------- */
/* 对象注册表                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 「对象类型名 -> 对象实例类型」映射表（空接口，靠模块增强填充）。
 *
 * - fabric 内置对象：见 `src/types/fabric.d.ts`
 * - 自定义对象：见各自插件文件，例如 `src/plugins/MyCustomObjectPlugin.ts`
 */
export interface ObjectTypeMap {}

/**
 * 已登记的类型名，用于约束 `ObjectRegistry.registerType()` / `create()` 的第一个参数。
 * 用 `Extract` 而不是 `& string`：后者在键已经全是字符串字面量时是冗余的。
 */
export type RegisteredTypeName = Extract<keyof ObjectTypeMap, string>;

/** 根据类型名取出实例类型 */
export type RegisteredObject<K extends RegisteredTypeName> = ObjectTypeMap[K];

/**
 * 对象构造器。
 *
 * fabric 各内置类的构造参数类型并不统一（`Partial<RectProps>` / `Partial<CircleProps>`...），
 * 这里只能用 `any` 兜住；真正的类型安全由 `ObjectTypeMap` + `create()` 重载来保证。
 */
// oxlint-disable-next-line no-explicit-any
export type ObjectCtor<T = FabricObject> = new (options?: any) => T;

/* -------------------------------------------------------------------------- */
/* 插件协议                                                                     */
/* -------------------------------------------------------------------------- */

/** 插件配置 / 透传给插件的选项 */
export type PluginOptions = Record<string, unknown>;

/**
 * 插件协议：只要类满足这个结构，就能被 `editor.use()` 装载。
 * 也可以直接继承 `BasePlugin`（推荐），省掉 canvas / editor / options 的样板代码。
 */
export interface IPlugin {
  /** 装载：注册对象类型、绑定画布事件等 */
  init(): void;
  /** 卸载：解绑事件、清理副作用 */
  destroy(): void;
  /** 导入 JSON 之前：迁移 / 改写旧版本数据 */
  hookImportBefore?(json: string): string | Promise<string>;
  /** 导入 JSON 之后：恢复插件自身的运行时状态 */
  hookImportAfter?(): void;
  /** 导出 JSON 之前：清理不该被序列化的插件私有字段 */
  hookExportBefore?(json: string): string;
}

/** 插件类（静态侧声明元信息，`Editor.use()` 依赖这些字段） */
export interface PluginConstructor<T extends IPlugin = IPlugin> {
  new (canvas: Canvas, editor: Editor, options: PluginOptions): T;
  /** 插件唯一标识，同时作为 `getPlugin()` 的 key */
  pluginName: string;
  /** 需要代理挂到 Editor 实例上的方法名（`editor.createMyObject()` 这类 API） */
  apis?: readonly string[];
  /** 该插件会派发的事件名（仅用于文档化 / 调试） */
  events?: readonly string[];
  /** 插件默认配置，可在 `editor.use(Plugin, { ... })` 时被覆盖 */
  options?: PluginOptions;
}

/**
 * 「登记一个插件」的两种写法，供 `EditorCanvas` 这类宿主组件声明插件清单：
 *
 * ```ts
 * const plugins: PluginUse[] = [
 *   MyCustomObjectPlugin,                    // 用插件默认配置
 *   [EditorStorePlugin, { store }],          // 额外注入配置（例如 Pinia store）
 * ];
 * ```
 */
export type PluginUse = PluginConstructor | [PluginConstructor, PluginOptions?];
