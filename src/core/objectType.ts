import type { FabricObject } from "fabric";

/**
 * 取对象的类型名。
 *
 * 注意**不能**用实例上的 `object.type`：fabric v7 里那个是遗留的小写标识
 * （`rect` / `circle`，官方已标 deprecated），拿它做 UI 展示和判断都会出错。
 * 与 `static type` 一致、真正用于序列化的是**构造函数**上的 `type`：
 * `object.constructor.type` → `Rect` / `MyCustomObject`。
 */
export function objectTypeName(object: FabricObject): string {
  const ctor = object.constructor as { type?: string };
  return ctor.type || object.type || "Unknown";
}
