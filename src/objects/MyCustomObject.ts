import { FabricObject } from "fabric";
import type { FabricObjectProps } from "fabric";

/**
 * 自定义对象统一放在 `src/objects/` 下，一个文件一个对象，并且**自带类型增强**。
 *
 * 新增对象的标准流程：
 * 1. 在 `src/objects/` 下新建文件，定义类并写 `declare module "../core/types"`；
 * 2. 在 `src/objects/index.ts` 的 `registerCustomObjects()` 里加一行登记；
 * 3. 想让它出现在形状库里，只要在 `playground/shapeCatalog.ts` 补一条预设 ——
 *    创建入口由 `playground/shapeActions.addShape()` 统一提供，**不要**再为它写一个
 *    `createXxx` 插件（那种插件最终只是在转发 `registry.create()`，多一层没有收益）。
 */

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
 * 3. 在 `objects/index.ts` 里调 `registry.registerType()` —— 把类登记进 `classRegistry`。
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

/**
 * 类型增强：让 `registry.create("MyCustomObject")` 返回精确类型。
 * 放在对象自己的文件里，就近维护，不需要再去 `types/fabric.d.ts` 里补。
 */
declare module "../core/types" {
  interface ObjectTypeMap {
    MyCustomObject: MyCustomObject;
  }
}
