import type { FabricObject } from "fabric";
import { BasePlugin } from "./BasePlugin";
import { objectTypeName } from "../core/objectType";
import type { CoreEvents, PluginOptions } from "../core/types";

/** 一个对象的属性快照：类型名 + `toObject()` 的结果 */
export interface ObjectPropertiesSnapshot {
  /** fabric 类型名（`Rect` / `Textbox` / `MyCustomObject` …） */
  type: string;
  /** `object.toObject()` 的输出，键顺序与导出 JSON 一致 */
  values: Record<string, unknown>;
}

export interface PropertyPluginOptions extends PluginOptions {
  /** 多选时是否也发布快照（默认 `false`：多选无法确定「编辑谁」） */
  publishOnMultiSelection?: boolean;
}

/** Node（单测环境）没有 requestAnimationFrame，退化成同步执行 */
function nextFrame(callback: () => void): void {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(callback);
  } else {
    callback();
  }
}

/**
 * 属性插件：管对象的**属性读写**。
 *
 * ```
 * selection / object 事件 ──▶ PropertyPlugin ──▶ properties:changed ──▶ EditorStorePlugin ──▶ 属性面板
 *                                     ▲
 *              属性面板改值 ── updateSelectedProperties()
 * ```
 *
 * 两个刻意的取舍：
 *
 * 1. **只收发普通对象，不交出实例。** 快照就是 `toObject()` 的结果，
 *    属性面板拿到的是一份纯数据，没有任何操作画布的能力 —— UI 不可能绕过
 *    `updateSelectedProperties()` 偷偷改对象，状态来源也就还是唯一的。
 * 2. **只支持单选。** 多选时 fabric 的 activeSelection 是个临时容器，
 *    本身没有 `toObject()` 意义上的「属性」，硬要定义只会误导使用者。
 *
 * 顺带解决一个体验问题：`object:modified` 只在松手后发一次，
 * 拖动过程中数字是死的；这里额外订阅 `object:transforming` 并按帧合并，
 * 所以拖着对象时面板上的坐标是跟着跳的。
 *
 * @example
 * editor.use(PropertyPlugin)
 * editor.updateSelectedProperties({ fill: "#f00", opacity: 0.5 })
 */
export default class PropertyPlugin extends BasePlugin {
  static pluginName = "PropertyPlugin";
  static apis = ["readSelectedProperties", "updateSelectedProperties"];
  static events = ["properties:changed"];
  static options: PropertyPluginOptions = { publishOnMultiSelection: false };

  private readonly disposers: Array<() => void> = [];
  /** 已经排了一帧待发的刷新，避免一次拖拽里重复排队 */
  private transformPending = false;

  init(): void {
    // 先发布一次：插件可能在画布已经有内容、甚至已经有选中对象之后才装上
    this.publish("init");

    this.listen("selection:changed", () => this.publish("selection:changed"));
    this.listen("object:added", () => this.publish("object:added"));
    this.listen("object:removed", () => this.publish("object:removed"));
    this.listen("object:modified", () => this.publish("object:modified"));
    this.listen("object:transforming", () => this.scheduleTransformPublish());
  }

  override destroy(): void {
    this.disposers.forEach((dispose) => dispose());
    this.disposers.length = 0;
    this.transformPending = false;
  }

  /** 导入 JSON 会整体替换画布内容，且不保证逐个派发事件 —— 这里必须兜一次 */
  override hookImportAfter(): void {
    this.publish("import");
  }

  /* ------------------------------- 对外 API ------------------------------- */

  /**
   * 读当前选中对象的属性快照。
   *
   * @returns 恰好选中一个对象时返回快照，未选中或多选时返回 `null`
   */
  readSelectedProperties(): ObjectPropertiesSnapshot | null {
    const object = this.singleActiveObject();
    if (!object) return null;

    return { type: objectTypeName(object), values: object.toObject() };
  }

  /**
   * 把一份补丁写回当前选中对象。
   *
   * `patch` 的 key 应当是 `toObject()` 里出现过的字段（面板就是按这个生成的），
   * `type` / `version` 会被忽略 —— 前者决定反序列化时找哪个类，后者是写入时的
   * fabric 版本号，都不该由使用者改动。
   *
   * @returns 应用后的新快照；没有单一选中对象时返回 `null`
   */
  updateSelectedProperties(patch: Record<string, unknown>): ObjectPropertiesSnapshot | null {
    const object = this.singleActiveObject();
    if (!object) return null;

    const writable = { ...patch };
    delete writable.type;
    delete writable.version;

    if (Object.keys(writable).length > 0) {
      object.set(writable);
      // 改了位置 / 尺寸 / 角度之后，命中区域要跟着重算，否则再点就选不中了
      object.setCoords();
      this.canvas.requestRenderAll();
      this.publish("update");
    }

    return this.readSelectedProperties();
  }

  /* ------------------------------- 内部实现 ------------------------------- */

  private singleActiveObject(): FabricObject | null {
    const active = this.canvas.getActiveObjects();
    return active.length === 1 ? active[0] : null;
  }

  private listen<K extends keyof CoreEvents>(
    event: K,
    handler: (payload: CoreEvents[K]) => void,
  ): void {
    this.editor.on(event, handler as never);
    this.disposers.push(() => this.editor.off(event, handler as never));
  }

  private publish(reason: string): void {
    this.editor.emit("properties:changed", {
      reason,
      snapshot: this.readSelectedProperties(),
    });
  }

  /**
   * 拖拽 / 缩放过程中按帧合并刷新。
   *
   * `object:moving` 是跟着鼠标事件走的，一帧里可能来好几次，
   * 而每次刷新都要跑一遍 `toObject()` 并让 Vue 重渲染整个面板。
   * 用一个「已排队」标记把同一帧内的多次请求压成一次就够了。
   */
  private scheduleTransformPublish(): void {
    if (this.transformPending) return;
    this.transformPending = true;

    nextFrame(() => {
      this.transformPending = false;
      this.publish("object:transforming");
    });
  }
}

/* -------------------------------------------------------------------------- */
/* 类型增强                                                                     */
/* -------------------------------------------------------------------------- */

declare module "../core/types" {
  interface CoreEvents {
    /** 选中对象的属性快照变了（选择变化、属性被写、拖拽中、导入之后都会发） */
    "properties:changed": {
      /** 触发原因：`init` / `selection:changed` / `update` / `object:transforming` … */
      reason: string;
      /** 只有一个对象被选中时是它的快照，否则 `null` */
      snapshot: ObjectPropertiesSnapshot | null;
    };
  }
}

declare module "../core/Editor" {
  interface Editor {
    /** 读当前选中对象的属性快照 */
    readSelectedProperties(): ObjectPropertiesSnapshot | null;
    /** 把属性补丁写回当前选中对象 */
    updateSelectedProperties(patch: Record<string, unknown>): ObjectPropertiesSnapshot | null;
  }
}
