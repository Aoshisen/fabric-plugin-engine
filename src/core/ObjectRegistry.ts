import { classRegistry } from "fabric";
import type { FabricObject } from "fabric";
import type { ObjectCtor, ObjectTypeMap, RegisteredTypeName } from "./types";

/**
 * 对象注册表 —— 全项目唯一的对象实例化入口。
 *
 * 查表顺序：自定义注册表 → fabric 的 `classRegistry`。
 * - fabric 内置对象（Rect / Circle / Group ...）在模块加载时已经自动登记，拿来即用；
 * - 自定义对象必须显式 `registerType()`，它会把类同步写进 `classRegistry`，
 *   这样 `canvas.loadFromJSON()` 反序列化时才能按 `type` 找到对应的类。
 */
export class ObjectRegistry {
  /** 自定义类型表。用 Map 而不是直接读 classRegistry，是为了能列出「本项目的」自定义类型 */
  private readonly customTypes = new Map<string, ObjectCtor>();

  /**
   * 登记自定义对象类型。
   *
   * 泛型 `K` 受 `ObjectTypeMap` 约束：只有先在类型增强里声明过的类型名才允许注册，
   * 类型名拼错会直接编译报错。
   *
   * @example
   * classRegistry / registerType('MyCustomObject', MyCustomObject)
   */
  registerType<K extends RegisteredTypeName>(
    typeName: K,
    ClassConstructor: ObjectCtor<ObjectTypeMap[K]>,
  ): void {
    this.customTypes.set(typeName, ClassConstructor as ObjectCtor);
    classRegistry.setClass(ClassConstructor, typeName);
  }

  /**
   * 查询类型对应的构造器：自定义优先，其次回退到 fabric 内置。
   *
   * 注意这里必须先 `has()` 再 `getClass()`：fabric 的 `getClass()` 在查不到时
   * 是**直接抛异常**（`fabric: No class registered for ...`）而不是返回 undefined，
   * 提前判一下才能把「未知类型」的处理权留在本层，报错信息也更清楚。
   */
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
   * 统一创建入口。
   *
   * - 类型名已在 `ObjectTypeMap` 里声明 → 返回精确类型（IDE 有完整提示）；
   * - 未声明 → 回退为 `FabricObject`。
   */
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
    return new Ctor(options);
  }
}
