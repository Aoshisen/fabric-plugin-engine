import { FabricObject } from "fabric";
import type { FabricObjectProps } from "fabric";
import { BasePlugin } from "./BasePlugin";
import type { PluginOptions } from "../core/types";

/* -------------------------------------------------------------------------- */
/* 1. 自定义对象                                                               */
/* -------------------------------------------------------------------------- */

/** `MyCustomObject` 的自定义数据字段（参与序列化） */
export interface MyCustomObjectProps {
  customProp?: string;
}

/** 构造 `MyCustomObject` 时允许传入的选项 */
export type MyCustomObjectOptions = Partial<FabricObjectProps> & MyCustomObjectProps;

/**
 * 示例自定义对象。
 *
 * 三件必须做的事：
 * 1. `static override type`  —— 反序列化时按这个 `type` 找类，务必全局唯一；
 * 2. `static override customProperties` —— 声明哪些字段要写进 JSON；
 * 3. 在插件 `init()` 里调 `registry.registerType()` —— 把类登记进 `classRegistry`。
 */
export class MyCustomObject extends FabricObject {
  static override type = "MyCustomObject";

  /** 参与序列化的自定义字段（fabric 的 toObject() 会自动合并这个列表） */
  static override customProperties = ["customProp"];

  /**
   * 用 `declare`（纯类型声明）而不是 `customProp = ""`。
   *
   * fabric 在**基类构造函数**里就会 `setOptions(options)`，而子类的字段初始化发生在
   * `super()` 返回之后 —— 写成字段初始化会把构造时传入的值覆盖掉。
   * 所以默认值放到构造函数体里用 `??=` 兜底。
   */
  declare customProp: string;

  constructor(options: MyCustomObjectOptions = {}) {
    super(options);
    this.customProp ??= "";
  }

  /**
   * 绘制：圆角矩形 + 居中文字。
   *
   * 基类的 `_render` 是空实现（`_render(_ctx) {}`），不覆写就什么都看不见。
   * 注意这里没写 `override`：fabric 的 `.d.ts` 里没有把 `_render` 导出到基类类型上。
   */
  _render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this;
    const radius = Math.min(8, height / 2);

    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-width / 2, -height / 2, width, height, radius);
    } else {
      ctx.rect(-width / 2, -height / 2, width, height);
    }
    ctx.fillStyle = typeof this.fill === "string" ? this.fill : "#ff9f43";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(15, 23, 42, 0.35)";
    ctx.stroke();

    ctx.fillStyle = "#1f2937";
    ctx.font = "13px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.customProp, 0, 0, Math.max(width - 12, 0));
    ctx.restore();
  }
}

/* -------------------------------------------------------------------------- */
/* 2. 插件                                                                     */
/* -------------------------------------------------------------------------- */

/** 插件配置 */
export interface MyCustomObjectPluginOptions extends PluginOptions {
  /** 创建对象时 `customProp` 的默认值 */
  defaultCustomProp?: string;
}

/**
 * 示例插件：演示「自定义对象注册 + 插件 API 代理 + 导入导出钩子」三件事。
 *
 * - `static apis` 里声明的方法会被代理到 Editor 上，业务侧直接 `editor.createMyObject()`
 * - `static events` 只是声明本插件会派发的事件，方便调试时排查
 * - 事件与 API 的类型，靠文件底部两个 `declare module` 补全
 */
export default class MyCustomObjectPlugin extends BasePlugin {
  static pluginName = "MyCustomObjectPlugin";
  static events = ["myPlugin:change"];
  static apis = ["createMyObject", "updateMyObject"];
  static options: MyCustomObjectPluginOptions = { defaultCustomProp: "hello fabric" };

  private get pluginOptions(): MyCustomObjectPluginOptions {
    return this.options as MyCustomObjectPluginOptions;
  }

  init(): void {
    // 注册自定义对象：内部会同步写进 fabric 的 classRegistry，
    // 这样 loadFromJSON 反序列化时才找得到类
    this.editor.registry.registerType("MyCustomObject", MyCustomObject);
  }

  /* ---------------------------- 对外的插件 API ---------------------------- */

  /** 创建一个 MyCustomObject 并加入画布（可通过 editor.createMyObject 调用） */
  createMyObject(options: MyCustomObjectOptions = {}): MyCustomObject {
    const object = this.editor.registry.create("MyCustomObject", {
      customProp: this.pluginOptions.defaultCustomProp ?? "",
      ...options,
    });

    this.canvas.add(object);
    this.canvas.requestRenderAll();
    return object;
  }

  /** 批量更新属性，并广播 `myPlugin:change` */
  updateMyObject(target: MyCustomObject, changes: MyCustomObjectProps): MyCustomObject {
    target.set(changes);
    target.setCoords();
    this.canvas.requestRenderAll();

    this.editor.emit("myPlugin:change", { payload: target });
    return target;
  }

  /* ----------------------------- 导入导出钩子 ----------------------------- */

  /** 导入前：把历史版本里的 `label` 字段迁移成 `customProp` */
  hookImportBefore(json: string): string {
    const data = JSON.parse(json) as { objects?: Record<string, unknown>[] };

    for (const object of data.objects ?? []) {
      if (object.type === MyCustomObject.type && typeof object.label === "string") {
        object.customProp = object.label;
        delete object.label;
      }
    }

    return JSON.stringify(data);
  }

  /** 导入后：按插件配置给缺省的对象补上默认值 */
  override hookImportAfter(): void {
    const fallback = this.pluginOptions.defaultCustomProp ?? "";

    for (const object of this.canvas.getObjects()) {
      if (object instanceof MyCustomObject && !object.customProp) {
        object.customProp = fallback;
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 3. 类型增强：让核心层认识这个插件                                          */
/* -------------------------------------------------------------------------- */

declare module "../core/types" {
  interface CoreEvents {
    /** MyCustomObjectPlugin 派发的自定义事件 */
    "myPlugin:change": { payload: MyCustomObject };
  }

  interface ObjectTypeMap {
    MyCustomObject: MyCustomObject;
  }
}

declare module "../core/Editor" {
  interface Editor {
    /** 创建一个 MyCustomObject 并加入画布 */
    createMyObject(options?: MyCustomObjectOptions): MyCustomObject;
    /** 批量更新 MyCustomObject 的属性 */
    updateMyObject(target: MyCustomObject, changes: MyCustomObjectProps): MyCustomObject;
  }
}
