import { Rect } from "fabric";
import { describe, expect, it } from "vite-plus/test";
import { describeObjectProperties } from "./propertySchema";
import { groupProperties } from "./types";
import type { PropertyDescriptor } from "./types";

/** 按 key 取字段，找不到就抛错 —— 比 `?.` 断言更容易看懂失败原因 */
function fieldOf(fields: PropertyDescriptor[], key: string): PropertyDescriptor {
  const found = fields.find((field) => field.key === key);
  if (!found) throw new Error(`字段列表里没有 "${key}"：${fields.map((f) => f.key).join(", ")}`);
  return found;
}

/** 一个接近真实的 Rect 序列化结果 */
function rectValues(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rx: 10,
    ry: 10,
    type: "Rect",
    version: "7.4.0",
    originX: "center",
    originY: "center",
    left: 100,
    top: 80,
    width: 180,
    height: 110,
    fill: "#4f7cff",
    stroke: null,
    strokeWidth: 1,
    strokeDashArray: null,
    strokeLineCap: "butt",
    strokeLineJoin: "miter",
    strokeUniform: false,
    opacity: 1,
    shadow: null,
    visible: true,
    backgroundColor: "",
    fillRule: "nonzero",
    paintFirst: "fill",
    globalCompositeOperation: "source-over",
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    flipX: false,
    flipY: false,
    skewX: 0,
    skewY: 0,
    ...overrides,
  };
}

describe("describeObjectProperties", () => {
  it("字段就是 toObject() 的字段，不多不少", () => {
    const values = rectValues();
    const fields = describeObjectProperties(values);

    expect(fields.map((field) => field.key)).toEqual(Object.keys(values));
  });

  it("按值给出合适的控件", () => {
    const fields = describeObjectProperties(rectValues());

    expect(fieldOf(fields, "left")).toMatchObject({ control: "number", value: 100, unit: "px" });
    expect(fieldOf(fields, "rx")).toMatchObject({ control: "number", value: 10 });
    expect(fieldOf(fields, "fill")).toMatchObject({ control: "color", value: "#4f7cff" });
    expect(fieldOf(fields, "opacity")).toMatchObject({ control: "slider", min: 0, max: 1 });
    expect(fieldOf(fields, "visible")).toMatchObject({ control: "boolean", value: true });
    expect(fieldOf(fields, "originX")).toMatchObject({ control: "select", value: "center" });
    expect(fieldOf(fields, "strokeDashArray")).toMatchObject({ control: "numberList", value: [] });
  });

  it("结构字段只读，并且给出原因", () => {
    const fields = describeObjectProperties(rectValues());

    for (const key of ["type", "version", "shadow"]) {
      const field = fieldOf(fields, key);
      expect(field.editable).toBe(false);
      expect(field.control).toBe("readonly");
      expect(field.hint).toBeTruthy();
    }
  });

  it("嵌套结构降级成只读，而不是给一个改不动的控件", () => {
    const fields = describeObjectProperties(
      rectValues({
        shadow: { color: "#000", blur: 8, offsetX: 2, offsetY: 2 },
        clipPath: { type: "Rect", width: 10, height: 10 },
      }),
    );

    expect(fieldOf(fields, "shadow").control).toBe("readonly");
    expect(fieldOf(fields, "shadow").display).toContain("#000");
    expect(fieldOf(fields, "clipPath").control).toBe("readonly");
  });

  it("渐变 / 图案填色不给颜色控件（颜色选择器处理不了）", () => {
    const fields = describeObjectProperties(
      rectValues({ fill: { type: "linear", colorStops: [{ offset: 0, color: "#fff" }] } }),
    );

    const fill = fieldOf(fields, "fill");
    expect(fill.control).toBe("readonly");
    expect(fill.hint).toContain("不是纯色");
  });

  it("CSS 颜色关键字被转成十六进制", () => {
    const fields = describeObjectProperties(rectValues({ fill: "red", stroke: "white" }));

    expect(fieldOf(fields, "fill")).toMatchObject({ control: "color", value: "#ff0000" });
    expect(fieldOf(fields, "stroke")).toMatchObject({ control: "color", value: "#ffffff" });
  });

  it("fill 为 null 是「不填充」，颜色控件留空而不是只读", () => {
    const fields = describeObjectProperties(rectValues({ fill: null }));

    expect(fieldOf(fields, "fill")).toMatchObject({ control: "color", value: null });
  });

  it("undefined 字段不进面板（JSON 里本来也没有）", () => {
    const fields = describeObjectProperties(rectValues({ path: undefined }));

    expect(fields.some((field) => field.key === "path")).toBe(false);
  });

  it("Text 的宽高是排版算出来的，降级成只读并说明", () => {
    const fields = describeObjectProperties({
      type: "Text",
      version: "7.4.0",
      text: "静态文本",
      width: 120,
      height: 36,
      fontSize: 30,
      fontFamily: "system-ui",
    });

    expect(fieldOf(fields, "text")).toMatchObject({ control: "longText", value: "静态文本" });
    expect(fieldOf(fields, "fontSize")).toMatchObject({ control: "number", value: 30 });

    const width = fieldOf(fields, "width");
    expect(width.editable).toBe(false);
    expect(width.hint).toContain("排版");
  });

  it("Textbox 只把高度算作派生，宽度仍然可改", () => {
    const fields = describeObjectProperties({ type: "Textbox", width: 260, height: 90, text: "x" });

    expect(fieldOf(fields, "width").editable).toBe(true);
    expect(fieldOf(fields, "height").editable).toBe(false);
  });

  it("Circle 的宽高由 radius 算出来", () => {
    const fields = describeObjectProperties({
      type: "Circle",
      radius: 62,
      width: 124,
      height: 124,
      counterClockwise: false,
    });

    expect(fieldOf(fields, "radius")).toMatchObject({ control: "number", value: 62 });
    expect(fieldOf(fields, "width").hint).toContain("radius");
    expect(fieldOf(fields, "counterClockwise")).toMatchObject({ control: "boolean" });
  });

  it("Path 的 path 是指令数组，只读展示", () => {
    const fields = describeObjectProperties({
      type: "Path",
      path: [
        ["M", 0, 0],
        ["L", 40, 40],
      ],
      pathOffset: { x: 20, y: 20 },
    });

    expect(fieldOf(fields, "path").control).toBe("readonly");
    expect(fieldOf(fields, "path").display).toContain('["M",0,0]');
    expect(fieldOf(fields, "pathOffset").control).toBe("readonly");
  });

  it("规则表没覆盖的自定义字段按值类型兜底，归到「自定义字段」组", () => {
    const fields = describeObjectProperties({
      type: "MyCustomObject",
      customProp: "你好",
      customCount: 3,
      customFlag: true,
      customList: [1, 2],
    });

    expect(fieldOf(fields, "customProp")).toMatchObject({
      control: "text",
      group: "custom",
      value: "你好",
      editable: true,
    });
    expect(fieldOf(fields, "customCount")).toMatchObject({ control: "number", value: 3 });
    expect(fieldOf(fields, "customFlag")).toMatchObject({ control: "boolean", value: true });
    expect(fieldOf(fields, "customList").control).toBe("readonly");
  });

  it("候选列表里没有的当前值会被补进去，避免下拉框显示空白", () => {
    const fields = describeObjectProperties({
      type: "Textbox",
      fontWeight: "600",
      fontFamily: "HarmonyOS Sans",
    });

    expect(fieldOf(fields, "fontWeight").options?.some((item) => item.value === "600")).toBe(true);
    expect(
      fieldOf(fields, "fontFamily").options?.some((item) => item.value === "HarmonyOS Sans"),
    ).toBe(true);
  });

  it("值类型和规则不匹配时降级成只读，不硬塞控件", () => {
    const fields = describeObjectProperties(rectValues({ opacity: "1", visible: "true" }));

    expect(fieldOf(fields, "opacity").control).toBe("readonly");
    expect(fieldOf(fields, "visible").control).toBe("readonly");
  });

  it("真的拿一个 fabric Rect 的序列化结果也成立", () => {
    const rect = new Rect({ left: 30, top: 40, width: 120, height: 60, fill: "#4f7cff", rx: 6 });
    // `toObject()` 的返回类型是 fabric 自己那套 Pick（没有索引签名），展开一层变成普通对象
    const values: Record<string, unknown> = { ...rect.toObject() };
    const fields = describeObjectProperties(values);

    expect(fieldOf(fields, "width")).toMatchObject({ control: "number", value: 120 });
    expect(fieldOf(fields, "top")).toMatchObject({ control: "number", value: 40 });
    expect(fieldOf(fields, "fill")).toMatchObject({ control: "color", value: "#4f7cff" });
    expect(fieldOf(fields, "type")).toMatchObject({ control: "readonly", value: "Rect" });
  });
});

describe("groupProperties", () => {
  it("按固定顺序分组，空组直接丢掉", () => {
    const fields = describeObjectProperties({
      type: "Rect",
      left: 1,
      width: 2,
      fill: "#fff",
      customProp: "x",
    });

    const sections = groupProperties(fields);

    expect(sections.map((section) => section.group)).toEqual([
      "layout",
      "appearance",
      "custom",
      "meta",
    ]);
    expect(sections[0].items.map((item) => item.key)).toEqual(["left", "width"]);
    expect(sections[2].label).toBe("自定义字段");
    expect(sections[3].items.map((item) => item.key)).toEqual(["type"]);
  });

  it("组内顺序跟着 toObject() 的字段顺序走", () => {
    const fields = describeObjectProperties(rectValues());
    const layout = groupProperties(fields).find((section) => section.group === "layout");

    expect(layout?.items.map((item) => item.key)).toEqual([
      "originX",
      "originY",
      "left",
      "top",
      "width",
      "height",
      "scaleX",
      "scaleY",
      "angle",
      "flipX",
      "flipY",
      "skewX",
      "skewY",
    ]);
  });
});
