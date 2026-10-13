import { classRegistry } from "fabric";
import { describe, expect, it } from "vite-plus/test";
import { Editor } from "../core/Editor";
import { asCanvas, MockCanvas } from "../test/MockCanvas";
import { MyCustomObject, registerCustomObjects } from "../objects";
import MyCustomObjectPlugin from "./MyCustomObjectPlugin";

function createEditor(options?: { defaultCustomProp?: string }): {
  editor: Editor;
  canvas: MockCanvas;
} {
  const canvas = new MockCanvas();
  const editor = new Editor(asCanvas(canvas));
  editor.use(MyCustomObjectPlugin, options);
  return { editor, canvas };
}

describe("MyCustomObject", () => {
  it("构造时传入的 customProp 不会被字段初始化覆盖", () => {
    // 回归测试：fabric 在基类构造函数里就 setOptions()，
    // 如果子类写成 `customProp = ''` 的字段初始化，就会把传入值冲掉。
    const object = new MyCustomObject({ customProp: "hello" });

    expect(object.customProp).toBe("hello");
  });

  it("未传 customProp 时兜底为空串", () => {
    expect(new MyCustomObject().customProp).toBe("");
  });

  it("customProperties 里的字段会进入 toObject()", () => {
    const object = new MyCustomObject({ customProp: "要序列化的值" });

    expect(MyCustomObject.customProperties).toContain("customProp");
    expect(object.toObject()).toMatchObject({ customProp: "要序列化的值" });
  });
});

describe("MyCustomObjectPlugin", () => {
  it("init() 把自定义对象登记进注册表与 classRegistry", () => {
    const { editor } = createEditor();

    expect(editor.hasPlugin("MyCustomObjectPlugin")).toBe(true);
    expect(editor.registry.has("MyCustomObject")).toBe(true);
    expect(editor.registry.registeredTypes).toEqual(["MyCustomObject"]);
  });

  it("createMyObject() 经 API 代理可用，并会把对象加进画布", () => {
    const { editor, canvas } = createEditor();

    const object = editor.createMyObject({ customProp: "abc", left: 10 });

    expect(object).toBeInstanceOf(MyCustomObject);
    expect(object.customProp).toBe("abc");
    expect(canvas.getObjects()).toEqual([object]);
    expect(editor.apiNames).toContain("createMyObject");
  });

  it("没传 customProp 时用插件默认配置兜底", () => {
    const { editor } = createEditor();

    expect(editor.createMyObject().customProp).toBe("hello fabric");
  });

  it("插件默认配置可被 use() 的选项覆盖", () => {
    const { editor } = createEditor({ defaultCustomProp: "覆盖后的默认值" });

    expect(editor.createMyObject().customProp).toBe("覆盖后的默认值");
  });

  it("updateMyObject() 会更新属性并广播 myPlugin:change", () => {
    const { editor } = createEditor();
    const object = editor.createMyObject({ customProp: "before" });
    const payloads: MyCustomObject[] = [];
    editor.on("myPlugin:change", ({ payload }) => payloads.push(payload));

    editor.updateMyObject(object, { customProp: "after" });

    expect(object.customProp).toBe("after");
    expect(payloads).toEqual([object]);
  });

  it("hookImportBefore() 把旧字段 label 迁移成 customProp", () => {
    const { editor } = createEditor();
    const plugin = editor.getPlugin<MyCustomObjectPlugin>("MyCustomObjectPlugin")!;

    const migrated = plugin.hookImportBefore(
      JSON.stringify({
        objects: [
          { type: "MyCustomObject", label: "旧字段" },
          { type: "Rect", label: "不该被动" },
        ],
      }),
    );

    expect(JSON.parse(migrated)).toEqual({
      objects: [
        { type: "MyCustomObject", customProp: "旧字段" },
        { type: "Rect", label: "不该被动" },
      ],
    });
  });

  it("hookImportAfter() 给缺省的对象补上默认值", () => {
    const { editor } = createEditor();
    const plugin = editor.getPlugin<MyCustomObjectPlugin>("MyCustomObjectPlugin")!;
    const object = new MyCustomObject();

    editor.canvas.add(object);
    plugin.hookImportAfter();

    expect(object.customProp).toBe("hello fabric");
  });
});

describe("registerCustomObjects", () => {
  it("把 objects/ 里登记的对象同步进 registry 与 fabric classRegistry", () => {
    const canvas = new MockCanvas();
    const editor = new Editor(asCanvas(canvas));

    registerCustomObjects(editor.registry);

    expect(editor.registry.registeredTypes).toEqual(["MyCustomObject"]);
    expect(editor.registry.resolve("MyCustomObject")).toBe(MyCustomObject);
    // 反序列化要靠 classRegistry 按 type 找回类，这一步不能漏
    expect(classRegistry.has("MyCustomObject")).toBe(true);
  });
});
