/**
 * 默认图形目录。
 *
 * 这是**纯数据**：只描述「有哪些图形、名字叫什么、创建时给什么参数」，
 * 不碰 canvas、不碰 Editor。同目录的 `shapeActions` 读它来造对象，
 * 形状库面板读它来渲染按钮 —— 两边拿到的是同一份清单，加一个图形只要在这里补一条。
 *
 * `defaults` 里的字段直接交给 `registry.create()`。注意三个「主参数」：
 * `Text/IText/Textbox` 的 `text`、`Path` 的 `path`、`Line/Polyline/Polygon` 的 `points`，
 * 它们会被 `ObjectRegistry` 摘出来当构造函数的第一个参数（见那边的说明）。
 */

export type ShapeCategory = "基础" | "线条与路径" | "文本" | "自定义";

export interface ShapePreset {
  /** fabric 类型名，必须在 `classRegistry` 或本项目的自定义注册表里存在 */
  type: string;
  /** 形状库里显示的名字 */
  label: string;
  category: ShapeCategory;
  /** 一句话说明这个图形的特点，或者要被记住的坑 */
  hint: string;
  /** 创建参数，见文件头的说明 */
  defaults: Record<string, unknown>;
}

export const SHAPE_PRESETS: readonly ShapePreset[] = [
  {
    type: "Rect",
    label: "矩形",
    category: "基础",
    hint: "圆角由 rx / ry 控制，改 0 就是直角",
    defaults: { width: 180, height: 110, fill: "#4f7cff", rx: 10, ry: 10 },
  },
  {
    type: "Circle",
    label: "圆形",
    category: "基础",
    hint: "只有一个 radius，缩放靠 scaleX / scaleY",
    defaults: { radius: 62, fill: "#12b886" },
  },
  {
    type: "Ellipse",
    label: "椭圆",
    category: "基础",
    hint: "rx / ry 是两个半轴长度",
    defaults: { rx: 90, ry: 54, fill: "#f08c00" },
  },
  {
    type: "Triangle",
    label: "三角形",
    category: "基础",
    hint: "本质是 width / height 决定的等腰三角形",
    defaults: { width: 140, height: 116, fill: "#e64980" },
  },
  {
    type: "Line",
    label: "直线",
    category: "线条与路径",
    hint: "没有 fill，只有 stroke；表单里的 x1..y2 是相对对象中心的偏移",
    defaults: {
      points: [-90, 0, 90, 0],
      stroke: "#1f2937",
      strokeWidth: 6,
      strokeLineCap: "round",
    },
  },
  {
    type: "Polyline",
    label: "折线",
    category: "线条与路径",
    hint: "顶点数组存在 points 里，表单中按只读展示",
    defaults: {
      points: [
        { x: -90, y: 40 },
        { x: -30, y: -40 },
        { x: 30, y: 40 },
        { x: 90, y: -40 },
      ],
      stroke: "#5f3dc4",
      strokeWidth: 5,
      fill: null,
      strokeLineJoin: "round",
      strokeLineCap: "round",
    },
  },
  {
    type: "Polygon",
    label: "多边形",
    category: "线条与路径",
    hint: "闭合的折线，会填充 fill",
    defaults: {
      points: [
        { x: 0, y: -60 },
        { x: 52, y: -20 },
        { x: 32, y: 50 },
        { x: -32, y: 50 },
        { x: -52, y: -20 },
      ],
      fill: "#0ca678",
      stroke: "#0b7285",
      strokeWidth: 2,
    },
  },
  {
    type: "Path",
    label: "路径",
    category: "线条与路径",
    hint: "path 就是一段 SVG d 指令，表单里可以整段替换",
    defaults: {
      path: "M 0 -60 L 14.1 -19.4 L 57.1 -18.5 L 22.8 7.4 L 35.3 48.5 L 0 24 L -35.3 48.5 L -22.8 7.4 L -57.1 -18.5 L -14.1 -19.4 Z",
      fill: "#fcc419",
      stroke: "#e8590c",
      strokeWidth: 2,
    },
  },
  {
    type: "Text",
    label: "文本",
    category: "文本",
    hint: "尺寸由内容和 fontSize 决定，width / height 是只读结果",
    defaults: {
      text: "静态文本",
      fontSize: 30,
      fontFamily: "system-ui",
      fill: "#1f2937",
      originX: "left",
      originY: "top",
    },
  },
  {
    type: "Textbox",
    label: "文本框",
    category: "文本",
    hint: "宽度固定，超出自动换行 —— 可以直接在表单里改 width 看效果",
    defaults: {
      text: "文本框的宽度是固定的，内容超出后会自己换行。试着在右边把 width 调小。",
      width: 260,
      fontSize: 20,
      fontFamily: "system-ui",
      lineHeight: 1.4,
      fill: "#343a40",
      originX: "left",
      originY: "top",
    },
  },
  {
    type: "IText",
    label: "可编辑文本",
    category: "文本",
    hint: "双击画布上的文字可以直接打字，属于交互对象",
    defaults: {
      text: "双击我",
      fontSize: 26,
      fontFamily: "system-ui",
      fill: "#5f3dc4",
      originX: "left",
      originY: "top",
    },
  },
  {
    type: "MyCustomObject",
    label: "自定义对象",
    category: "自定义",
    hint: "示例自定义类型，多带一个 customProp 字段，会出现在「自定义」分组里",
    defaults: {
      width: 190,
      height: 116,
      fill: "#ff9f43",
      customProp: "自定义对象",
    },
  },
];

/** 按类型名找预设 */
export function findShapePreset(type: string): ShapePreset | undefined {
  return SHAPE_PRESETS.find((preset) => preset.type === type);
}

/** 形状库面板的渲染顺序 */
export const SHAPE_CATEGORIES: readonly ShapeCategory[] = ["基础", "线条与路径", "文本", "自定义"];
