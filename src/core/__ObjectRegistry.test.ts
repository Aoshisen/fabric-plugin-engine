import { Rect } from "fabric";
import { classRegistry } from "fabric";
import { describe, expect, it } from "vite-plus/test";
import { ObjectRegistry } from "./ObjectRegistry";
import { MyCustomObject } from "../objects";

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

/**
 * fabric 里 `Text` / `Path` / `Line` 这一族的构造函数第一个参数不是 options，
 * `create()` 要把它摘出来单独传 —— 不处理的话拿到的是个「画什么都不会出现」的对象。
 */
describe("ObjectRegistry 的主参数处理", () => {
  it("Path：把 path 当第一个构造参数传进去", () => {
    const registry = new ObjectRegistry();

    const path = registry.create("Path", { path: "M 0 0 L 40 40 Z", left: 12, top: 34 });

    // 关键证据：path 被解析成了指令数组，而不是被当成 options 整个塞进去
    expect(Array.isArray(path.path)).toBe(true);
    expect(path.path[0][0]).toBe("M");
    expect(path.left).toBe(12);
    expect(path.top).toBe(34);
  });

  it("Line：points 进构造函数，x1..y2 由它算出来", () => {
    const registry = new ObjectRegistry();

    const line = registry.create("Line", { points: [-50, 0, 50, 0], stroke: "#000" });

    expect(line.width).toBe(100);
    expect(line.stroke).toBe("#000");
  });

  it("Polyline：points 进构造函数", () => {
    const registry = new ObjectRegistry();

    const polyline = registry.create("Polyline", {
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 40 },
      ],
      stroke: "#000",
    });

    expect(polyline.points).toHaveLength(2);
  });

  it("primaryArgOf 只对这几个类型有值", () => {
    const registry = new ObjectRegistry();

    expect(registry.primaryArgOf("Text")).toBe("text");
    expect(registry.primaryArgOf("IText")).toBe("text");
    expect(registry.primaryArgOf("Textbox")).toBe("text");
    expect(registry.primaryArgOf("Path")).toBe("path");
    expect(registry.primaryArgOf("Polygon")).toBe("points");
    // Rect 是标准签名，不该被特殊对待
    expect(registry.primaryArgOf("Rect")).toBeUndefined();
  });

  it("主参数缺失时退化成空值，而不是把 options 塞进去", () => {
    const registry = new ObjectRegistry();

    const path = registry.create("Path", { left: 5, top: 5 });

    expect(path.path).toEqual([]);
    expect(path.left).toBe(5);
  });
});
