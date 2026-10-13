import type { ObjectRegistry } from "../core";
import { MyCustomObject } from "./MyCustomObject";

export { MyCustomObject } from "./MyCustomObject";
export type { MyCustomObjectOptions, MyCustomObjectProps } from "./MyCustomObject";

/**
 * 自定义对象的**唯一登记入口**。
 *
 * 为什么不写成「模块加载时自动注册」：注册需要拿到 `ObjectRegistry` 实例，
 * 而项目里可能同时存在多个 Editor（主画布 + 预览画布），自动注册会把状态挂到全局。
 * 收成一个显式函数后，谁创建 Editor 谁负责登记，顺序和次数都可控。
 *
 * 新增自定义对象时，只要在这里补一行 `registry.registerType(...)`。
 */
export function registerCustomObjects(registry: ObjectRegistry): void {
  registry.registerType("MyCustomObject", MyCustomObject);
}
