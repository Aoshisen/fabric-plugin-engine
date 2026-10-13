import type { Canvas } from "fabric";
import type { Editor } from "../core/Editor";
import type { IPlugin, PluginOptions } from "../core/types";

/**
 * 插件基类。
 *
 * 只是把 canvas / editor / options 三个依赖收好，子类专注写 `init()` 的业务。
 * 不在这里调用 `init()`：装载时机统一由 `Editor.use()` 控制，
 * 这样「构造 → 登记 → 代理 API → 初始化 → 广播」的顺序以后要调整，也不用改每个插件。
 *
 * @example
 * export default class FooPlugin extends BasePlugin {
 *   static pluginName = 'FooPlugin';
 *   init() { ... }
 *   destroy() { ... }
 * }
 */
export abstract class BasePlugin implements IPlugin {
  protected readonly canvas: Canvas;
  protected readonly editor: Editor;
  protected readonly options: PluginOptions;

  constructor(canvas: Canvas, editor: Editor, options: PluginOptions = {}) {
    this.canvas = canvas;
    this.editor = editor;
    this.options = options;
  }

  /** 装载：注册对象类型、绑定事件、初始化状态 */
  abstract init(): void;

  /** 卸载：解绑事件、清理副作用（默认什么都不做，按需覆写） */
  destroy(): void {
    // no-op
  }

  /**
   * 下面三个钩子在这里给出「原样透传」的默认实现。
   *
   * 这样做的两个好处：
   * 1. 子类只需要覆写自己关心的钩子，并且可以直接写 `override`；
   * 2. `Editor` 侧不用再逐个判空，插件协议也仍然保持可选
   *    （不继承 BasePlugin 的插件依旧可以只实现需要的钩子）。
   */
  hookImportBefore(json: string): string | Promise<string> {
    return json;
  }

  hookImportAfter(): void {
    // no-op
  }

  hookExportBefore(json: string): string {
    return json;
  }
}
