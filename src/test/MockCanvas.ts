import type { Canvas, FabricObject } from "fabric";

type Listener = (payload: unknown) => void;

/**
 * fabric `Canvas` 的测试替身。
 *
 * 核心层只用到 canvas 的一小块能力（事件绑定、对象增删、重绘、序列化、销毁），
 * 单测里没必要真的起一个浏览器画布环境，所以在 Node 下用这个替身。
 * 需要交给 `new Editor()` 时套一层 `asCanvas()`。
 *
 * 之所以不把 `ICanvasLike` 铺到核心层：`Editor.canvas` 的公开契约就是真实的
 * fabric `Canvas`（插件要拿它做各种事），把类型放宽反而会削弱下游的类型提示。
 */
export class MockCanvas {
  /** 画布上的对象，按加入顺序排列 */
  readonly objects: FabricObject[] = [];
  /** 最后一次 `loadFromJSON()` 收到的数据 */
  loadedJSON: unknown;
  /** 是否已被 `dispose()` */
  disposed = false;

  private readonly listeners = new Map<string, Set<Listener>>();

  /** 返回解绑函数，行为与 fabric `Observable.on()` 保持一致 */
  on(eventName: string, handler: Listener): () => void {
    const handlers = this.listeners.get(eventName) ?? new Set<Listener>();
    handlers.add(handler);
    this.listeners.set(eventName, handlers);

    return () => {
      handlers.delete(handler);
    };
  }

  off(eventName: string, handler?: Listener): void {
    if (handler) this.listeners.get(eventName)?.delete(handler);
    else this.listeners.delete(eventName);
  }

  /** 主动触发画布事件，用来模拟用户操作 */
  fire(eventName: string, payload: unknown = {}): void {
    // 先复制一份再遍历：处理器里可能会顺手把自己解绑掉
    for (const handler of Array.from(this.listeners.get(eventName) ?? [])) {
      handler(payload);
    }
  }

  add(...objects: FabricObject[]): number {
    this.objects.push(...objects);
    for (const object of objects) this.fire("object:added", { target: object });
    return this.objects.length;
  }

  remove(...objects: FabricObject[]): FabricObject[] {
    for (const object of objects) {
      const index = this.objects.indexOf(object);
      if (index >= 0) this.objects.splice(index, 1);
      this.fire("object:removed", { target: object });
    }
    return objects;
  }

  getObjects(): FabricObject[] {
    return [...this.objects];
  }

  requestRenderAll(): void {
    // no-op：测试环境不需要真的重绘
  }

  toJSON(): Record<string, unknown> {
    return { objects: this.objects.map((object) => object.toObject()) };
  }

  async loadFromJSON(json: unknown): Promise<this> {
    this.loadedJSON = json;
    return this;
  }

  async dispose(): Promise<boolean> {
    this.disposed = true;
    return true;
  }
}

/** 把替身交给 `new Editor()` */
export function asCanvas(mock: MockCanvas): Canvas {
  return mock as unknown as Canvas;
}
