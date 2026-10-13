import { Rect } from "fabric";
import { classRegistry } from "fabric";
import { describe, expect, it } from "vite-plus/test";
import { ObjectRegistry } from "./ObjectRegistry";
import { MyCustomObject } from "../plugins/MyCustomObjectPlugin";

describe("ObjectRegistry", () => {
  it("能创建 fabric 内置对象（模块加载时已自动登记）", () => {
    const registry = new ObjectRegistry();

    const rect = registry.create("Rect", { left: 10, top: 20, width: 30, height: 40 });

    expect(rect).toBeInstanceOf(Rect);
    expect(rect.left).toBe(10);
    expect(rect.width).toBe(30);
  });

  it("内置类型无需 registerType 也能 has()", () => {
    const registry = new ObjectRegistry();

    expect(registry.has("Rect")).toBe(true);
    expect(registry.has("ThisTypeDoesNotExist")).toBe(false);
  });

  it("未登记的类型直接抛错", () => {
    const registry = new ObjectRegistry();

    expect(() => registry.create("ThisTypeDoesNotExist")).toThrow(/未知的对象类型/);
  });

  it("registerType 之后既能创建，也同步写进了 fabric 的 classRegistry", () => {
    const registry = new ObjectRegistry();

    registry.registerType("MyCustomObject", MyCustomObject);

    expect(registry.has("MyCustomObject")).toBe(true);
    expect(registry.registeredTypes).toContain("MyCustomObject");
    expect(registry.resolve("MyCustomObject")).toBe(MyCustomObject);
    // 反序列化的关键：fabric 也要认识这个类
    expect(classRegistry.has("MyCustomObject")).toBe(true);

    expect(registry.create("MyCustomObject")).toBeInstanceOf(MyCustomObject);
  });

  it("自定义类型优先于 fabric 内置表", () => {
    const registry = new ObjectRegistry();
    registry.registerType("MyCustomObject", MyCustomObject);

    expect(registry.resolve("MyCustomObject")).toBe(MyCustomObject);
    expect(registry.resolve("Rect")).toBe(Rect);
  });
});
