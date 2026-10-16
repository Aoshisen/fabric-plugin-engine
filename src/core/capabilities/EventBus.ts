import mitt from "mitt";
import type { CoreEmitter, CoreEventMap, CoreEventHandler, CoreEvents } from "../types";
import type { EditorEvents } from "../contracts";

/** 事件处理器在 `mitt` 里的统一形态：只吃一个 payload */
type AnyHandler = (payload: unknown) => void;

/**
 * 事件总线：`impl EditorEvents`。
 *
 * 刻意用「组合 mitt」而不是「继承 EventEmitter」：
 * - mitt 只有 ~200B，浏览器原生兼容，不需要 polyfill；
 * - 事件名与 payload 由 `CoreEvents` 约束，`on/off/emit` 全程可推导；
 * - 组合比继承更好扩展（后续要换成别的总线只改这一个文件）。
 *
 * 这里只负责「一条总线」，不知道 canvas、也不知道插件 —— 那两件事分别归
 * `CanvasBridge` 和 `PluginRegistry`。
 */
export class EventBus implements EditorEvents {
  private readonly emitter: CoreEmitter = mitt<CoreEventMap>();

  on<K extends keyof CoreEvents>(event: K, handler: CoreEventHandler<K>): this {
    this.emitter.on(event, handler as never);
    return this;
  }

  off<K extends keyof CoreEvents>(event: K, handler: CoreEventHandler<K>): this {
    this.emitter.off(event, handler as never);
    return this;
  }

  /**
   * 派发事件。
   *
   * 不走 `emitter.emit()` 而是自己遍历，是为了让**每个订阅者互相隔离**：
   * 某个插件在处理器里抛错，不应该打断同一事件上其他订阅者，
   * 更不应该让 `Editor.dispose()` 中途断掉。
   */
  emit<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void {
    const handlers = this.emitter.all.get(event) as AnyHandler[] | undefined;
    if (!handlers) return;

    // 先复制一份再遍历：处理器里可能会顺手订阅 / 退订自己
    for (const handler of handlers.slice()) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[Editor] 事件 "${String(event)}" 的处理器抛错：`, error);
      }
    }
  }

  /** 清空全部订阅（由销毁流程调用） */
  clear(): void {
    this.emitter.all.clear();
  }
}
