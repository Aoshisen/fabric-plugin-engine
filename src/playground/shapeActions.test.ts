import type { FabricObject, Path } from "fabric";
import { describe, expect, it, vi } from "vite-plus/test";
import { Editor } from "../core/Editor";
import { objectTypeName } from "../core/objectType";
import { registerCustomObjects } from "../objects";
import { asCanvas, MockCanvas } from "../test/MockCanvas";
import {
  addShape,
  arrangeSelected,
  availableShapes,
  clearCanvas,
  removeSelected,
} from "./shapeActions";

/**
 * 建一个编辑器。`registerCustomObjects()` 是页面在编辑器就绪时做的事，
 * 测试里显式重放一遍 —— 这样「登记」这件事的归属在测试里也是可见的。
 */
function createEditor(): { editor: Editor; canvas: MockCanvas } {
  const canvas = new MockCanvas();
  const editor = new Editor(asCanvas(canvas));
  registerCustomObjects(editor.registry);
  return { editor, canvas };
}

/** `addShape()` 在失败时返回 null，测试里当作「必须成功」来用 */
function mustAdd(editor: Editor, type: string, overrides?: Record<string, unknown>): FabricObject {
  const object = addShape(editor, type, overrides);
  if (!object) throw new Error(`addShape("${type}") 返回了 null`);
  return object;
}

describe("shapeActions", () => {
  it("availableShapes 只给出注册表里真正存在的类型", () => {
    const { editor } = createEditor();
    const shapes = availableShapes(editor);

    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes.map((shape) => shape.type)).toContain("Rect");
    // 契约：列出来的一定造得出来
    for (const shape of shapes) {
      expect(editor.registry.has(shape.type)).toBe(true);
    }
  });

  it("登记之后自定义类型就能造出来，不靠任何插件", () => {
    const { editor } = createEditor();

    expect(editor.registry.has("MyCustomObject")).toBe(true);

    const custom = mustAdd(editor, "MyCustomObject", { customProp: "hi" });
    expect(objectTypeName(custom)).toBe("MyCustomObject");
    // 登记过了，形状库清单里自然也就有了它
    expect(availableShapes(editor).map((shape) => shape.type)).toContain("MyCustomObject");
  });

  it("登记写进的是 fabric 的全局 classRegistry，每个进程一次就够", () => {
    const first = new Editor(asCanvas(new MockCanvas()));
    registerCustomObjects(first.registry);

    // 第二个 Editor 没登记，但 `ObjectRegistry.has()` 会回退到 fabric 的模块级
    // `classRegistry`，所以它照样看得到这个类型。结论：页面在 ready 时登记一次即可，
    // 不必每个 Editor 都调；反过来也意味着「类型未登记」这条分支在进程内很难复现。
    const second = new Editor(asCanvas(new MockCanvas()));
    expect(second.registry.has("MyCustomObject")).toBe(true);
    expect(addShape(second, "MyCustomObject")).not.toBeNull();
  });

  it("这组操作是纯函数，没有挂到 editor 上", () => {
    const { editor } = createEditor();

    // 插件层不再代理这些能力 —— 想用就 import 函数
    expect("addShape" in editor).toBe(false);
    expect("availableShapes" in editor).toBe(false);
    expect("arrangeSelected" in editor).toBe(false);
  });

  it("addShape 用预设建对象、加进画布并自动选中", () => {
    const { editor, canvas } = createEditor();

    const rect = mustAdd(editor, "Rect");

    expect(canvas.getObjects()).toEqual([rect]);
    expect(canvas.getActiveObjects()).toEqual([rect]);
    expect(rect.width).toBe(180);
    expect(rect.fill).toBe("#4f7cff");
  });

  it("addShape 接受覆盖参数", () => {
    const { editor } = createEditor();

    const rect = mustAdd(editor, "Rect", { fill: "#000000", width: 40 });

    expect(rect.fill).toBe("#000000");
    expect(rect.width).toBe(40);
  });

  it("连续添加会级联错开位置，不会完全叠在一起", () => {
    const { editor } = createEditor();

    const first = mustAdd(editor, "Rect");
    const second = mustAdd(editor, "Rect");
    const third = mustAdd(editor, "Rect");

    expect(first.top).toBe(130);
    expect(second.top).toBe(156);
    expect(third.top).toBe(182);
    expect(first.left).not.toBe(second.left);
  });

  it("目录里没有的类型直接返回 null，并留下警告", () => {
    const { editor, canvas } = createEditor();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(addShape(editor, "ThisTypeIsNotInCatalog")).toBeNull();
    expect(canvas.getObjects()).toHaveLength(0);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("Path 走「主参数」那条路，也能正常建出来", () => {
    const { editor } = createEditor();

    const path = mustAdd(editor, "Path") as Path;

    expect(Array.isArray(path.path)).toBe(true);
    expect(path.left).toBe(170);
    expect(path.top).toBe(130);
  });

  it("removeSelected 删掉选中项并取消选中", () => {
    const { editor, canvas } = createEditor();
    mustAdd(editor, "Rect");
    mustAdd(editor, "Circle");

    const removed = removeSelected(editor);

    expect(removed).toBe(1);
    expect(canvas.getObjects()).toHaveLength(1);
    expect(canvas.getActiveObjects()).toEqual([]);
  });

  it("没有选中项时 removeSelected 是空操作", () => {
    const { editor } = createEditor();

    expect(removeSelected(editor)).toBe(0);
  });

  it("clearCanvas 清空并返回清掉的个数", () => {
    const { editor, canvas } = createEditor();
    mustAdd(editor, "Rect");
    mustAdd(editor, "Circle");

    expect(clearCanvas(editor)).toBe(2);
    expect(canvas.getObjects()).toHaveLength(0);
    expect(clearCanvas(editor)).toBe(0);
  });

  it("arrangeSelected 置顶 / 置底，已经在端点上时返回 false", () => {
    const { editor, canvas } = createEditor();
    const bottom = mustAdd(editor, "Rect", { left: 0, top: 0 });
    const top = mustAdd(editor, "Circle");

    canvas.setActiveObject(bottom);
    expect(arrangeSelected(editor, "toFront")).toBe(true);
    expect(canvas.getObjects()).toEqual([top, bottom]);
    // 已经在最上面，再置顶没有变化
    expect(arrangeSelected(editor, "toFront")).toBe(false);

    expect(arrangeSelected(editor, "toBack")).toBe(true);
    expect(canvas.getObjects()).toEqual([bottom, top]);
  });

  it("arrangeSelected 的上移 / 下移按一位步进", () => {
    const { editor, canvas } = createEditor();
    const a = mustAdd(editor, "Rect", { left: 0, top: 0 });
    const b = mustAdd(editor, "Circle");
    const c = mustAdd(editor, "Triangle");

    canvas.setActiveObject(a);
    expect(arrangeSelected(editor, "forward")).toBe(true);
    expect(canvas.getObjects()).toEqual([b, a, c]);
    expect(arrangeSelected(editor, "forward")).toBe(true);
    expect(canvas.getObjects()).toEqual([b, c, a]);
    expect(arrangeSelected(editor, "forward")).toBe(false);

    expect(arrangeSelected(editor, "backward")).toBe(true);
    expect(canvas.getObjects()).toEqual([b, a, c]);
  });

  it("没有选中项时 arrangeSelected 返回 false", () => {
    const { editor } = createEditor();
    mustAdd(editor, "Rect");
    clearCanvas(editor);

    expect(arrangeSelected(editor, "toFront")).toBe(false);
  });
});
