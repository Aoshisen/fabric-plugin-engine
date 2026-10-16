import { classRegistry } from "fabric";
import type { FabricObject } from "fabric";
import type { ObjectCtor, ObjectTypeMap, RegisteredTypeName } from "./types";

/**
 * fabric 里「第一个构造参数不是 options」的类型 → 那个参数在 options 里的字段名。
 *
 * 这些类的签名是 `new Text(text, options)` / `new Path(d, options)` / `new Polyline(points, options)`，
 * 直接 `new Ctor(options)` 会把整个 options 对象当成文本内容 / 路径指令 / 顶点数组写进实例，
 * 结果是内部一计算就崩、画布上什么都渲染不出来。
 * fabric 自己的 `_fromObject(obj, { extraParam })` 就是为了处理这件事。
 *
 * 统一在注册表这一层收口，调用方就能继续只记一条规则：
 * **创建对象一律 `registry.create(type, options)`**，把主参数放进 options 的同名字段即可。
 *
 * 两个容易踩的点：
 * - `Line` 主参数是 `points`，但它 `toObject()` 输出的是 `x1/y1/x2/y2`
 *   （具体是**相对对象中心**的偏移，fabric 内部算出来给人看的）；
 *   所以「造一条线」要传 `points`，而表单里看到的是 x1..y2，两者不是一套东西。
 * - `Image` 不在这里：它要经过 `FabricImage.fromURL()` 走异步图片加载，不属于「填 options 就能造」。
 */
const PRIMARY_ARG_BY_TYPE: Record<string, string> = {
  Text: "text",
  IText: "text",
  Textbox: "text",
  Path: "path",
  Line: "points",
  Polyline: "points",
  Polygon: "points",
};

export class ObjectRegistry {
  private readonly customTypes = new Map<string, ObjectCtor>();

  registerType<K extends RegisteredTypeName>(
    typeName: K,
    ClassConstructor: ObjectCtor<ObjectTypeMap[K]>,
  ): void {
    this.customTypes.set(typeName, ClassConstructor as ObjectCtor);
    classRegistry.setClass(ClassConstructor, typeName);
  }

  resolve(typeName: string): ObjectCtor | undefined {
    const custom = this.customTypes.get(typeName);
    if (custom) return custom;

    return classRegistry.has(typeName) ? classRegistry.getClass<ObjectCtor>(typeName) : undefined;
  }

  /** 类型是否已注册 */
  has(typeName: string): boolean {
    return this.customTypes.has(typeName) || classRegistry.has(typeName);
  }

  /** 本项目已登记的自定义类型名 */
  get registeredTypes(): string[] {
    return [...this.customTypes.keys()];
  }

  /**
   * 该类型的构造函数是否需要单独传「主参数」。
   * 返回参数名（如 `text`），不需要时返回 `undefined`。
   */
  primaryArgOf(typeName: string): string | undefined {
    return PRIMARY_ARG_BY_TYPE[typeName];
  }

  create<K extends RegisteredTypeName>(
    typeName: K,
    options?: Record<string, unknown>,
  ): ObjectTypeMap[K];
  create(typeName: string, options?: Record<string, unknown>): FabricObject;
  create(typeName: string, options: Record<string, unknown> = {}): FabricObject {
    const Ctor = this.resolve(typeName);
    if (!Ctor) {
      throw new Error(
        `[ObjectRegistry] 未知的对象类型 "${typeName}"，请先通过 ObjectRegistry.registerType() 登记。`,
      );
    }

    const primaryArg = this.primaryArgOf(typeName);
    if (!primaryArg) return new Ctor(options);

    // 摘出主参数，剩下的照常当 options 传进去（`type` 字段要留在 options 里给 fabric 用）
    const { [primaryArg]: primary, ...rest } = options;
    return new Ctor(primary ?? "", rest);
  }
}
