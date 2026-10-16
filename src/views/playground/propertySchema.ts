import type {
  PropertyControlKind,
  PropertyDescriptor,
  PropertyGroup,
  PropertyOption,
} from "./types";

/**
 * 把 `object.toObject()` 的输出翻译成表单字段。
 *
 * 唯一的真相来源就是 `toObject()` 的 key —— 面板上出现的字段，
 * 等于「导出的 JSON 里有的字段」，不多不少。这样定死一条规则之后，
 * 加一个自定义对象、fabric 升一个小版本，都不用回来改这里：
 * 认识的就给个合适的控件，不认识的按值的类型兜底。
 *
 * 规则表 `PROPERTY_RULES` 只是**期望**，真实值说了算：
 * 期望是颜色但值是渐变对象，就降级成只读并说明原因。
 * 面板宁可少给一个控件，也不要给一个改了没反应（或者更糟，改坏 JSON）的控件。
 */

/* -------------------------------------------------------------------------- */
/* 候选项                                                                      */
/* -------------------------------------------------------------------------- */

const ORIGIN_X_OPTIONS: PropertyOption[] = [
  { label: "左", value: "left" },
  { label: "居中", value: "center" },
  { label: "右", value: "right" },
];

const ORIGIN_Y_OPTIONS: PropertyOption[] = [
  { label: "上", value: "top" },
  { label: "居中", value: "center" },
  { label: "下", value: "bottom" },
];

const STROKE_LINE_CAP_OPTIONS: PropertyOption[] = [
  { label: "平头", value: "butt" },
  { label: "圆头", value: "round" },
  { label: "方头", value: "square" },
];

const STROKE_LINE_JOIN_OPTIONS: PropertyOption[] = [
  { label: "尖角", value: "miter" },
  { label: "圆角", value: "round" },
  { label: "斜角", value: "bevel" },
];

const PAINT_FIRST_OPTIONS: PropertyOption[] = [
  { label: "先填充后描边", value: "fill" },
  { label: "先描边后填充", value: "stroke" },
];

const FILL_RULE_OPTIONS: PropertyOption[] = [
  { label: "非零环绕", value: "nonzero" },
  { label: "奇偶环绕", value: "evenodd" },
];

const TEXT_ALIGN_OPTIONS: PropertyOption[] = [
  { label: "左对齐", value: "left" },
  { label: "居中", value: "center" },
  { label: "右对齐", value: "right" },
  { label: "两端对齐", value: "justify" },
];

const TEXT_DIRECTION_OPTIONS: PropertyOption[] = [
  { label: "从左到右", value: "ltr" },
  { label: "从右到左", value: "rtl" },
];

const FONT_FAMILY_OPTIONS: PropertyOption[] = [
  { label: "系统默认", value: "system-ui" },
  { label: "苹方 / PingFang SC", value: "PingFang SC" },
  { label: "微软雅黑", value: "Microsoft YaHei" },
  { label: "宋体", value: "SimSun" },
  { label: "楷体", value: "KaiTi" },
  { label: "等宽", value: "monospace" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Arial", value: "Arial" },
  { label: "Courier New", value: "Courier New" },
];

const FONT_WEIGHT_OPTIONS: PropertyOption[] = [
  { label: "常规", value: "normal" },
  { label: "加粗", value: "bold" },
  { label: "100", value: "100" },
  { label: "200", value: "200" },
  { label: "300", value: "300" },
  { label: "400", value: "400" },
  { label: "500", value: "500" },
  { label: "600", value: "600" },
  { label: "700", value: "700" },
  { label: "800", value: "800" },
  { label: "900", value: "900" },
];

const FONT_STYLE_OPTIONS: PropertyOption[] = [
  { label: "常规", value: "normal" },
  { label: "斜体", value: "italic" },
];

const COMPOSITE_OPTIONS: PropertyOption[] = [
  { label: "默认覆盖", value: "source-over" },
  { label: "正片叠底", value: "multiply" },
  { label: "滤色", value: "screen" },
  { label: "叠加", value: "overlay" },
  { label: "变暗", value: "darken" },
  { label: "变亮", value: "lighten" },
  { label: "颜色减淡", value: "color-dodge" },
  { label: "颜色加深", value: "color-burn" },
  { label: "差值", value: "difference" },
  { label: "排除", value: "exclusion" },
  { label: "色相", value: "hue" },
  { label: "饱和度", value: "saturation" },
  { label: "颜色", value: "color" },
  { label: "亮度", value: "luminosity" },
  { label: "擦除下层", value: "destination-out" },
];

/* -------------------------------------------------------------------------- */
/* 字段规则表                                                                  */
/* -------------------------------------------------------------------------- */

interface PropertyRule {
  label: string;
  group: PropertyGroup;
  control: PropertyControlKind;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: PropertyOption[];
  filterable?: boolean;
  tag?: boolean;
  hint?: string;
}

/**
 * 规则完全对齐 fabric `FabricObject.toObject()` 实际写出的字段，
 * 加上子类补上的那些（Rect 的 rx/ry、Circle 的 radius、Text 的字体族……）。
 */

/** Line 的 x1..y2 容易被误解成画布坐标，这里统一解释一下 */
const LINE_POINT_HINT = "注意：这是相对对象中心的偏移，不是画布坐标（fabric 就是这么序列化的）";

const PROPERTY_RULES: Record<string, PropertyRule> = {
  /* ------------------------------- 元信息 ------------------------------- */
  type: {
    label: "类型",
    group: "meta",
    control: "readonly",
    hint: "fabric 反序列化时按这个字段找类，改掉就没有对应实现了，所以固定为只读",
  },
  version: {
    label: "fabric 版本",
    group: "meta",
    control: "readonly",
    hint: "写入 JSON 时的 fabric 版本号，用于兼容判断",
  },
  shadow: {
    label: "阴影",
    group: "meta",
    control: "readonly",
    hint: "嵌套对象（颜色 / 模糊 / 偏移），面板暂不支持编辑",
  },
  clipPath: {
    label: "裁剪路径",
    group: "meta",
    control: "readonly",
    hint: "持有一个 fabric 对象，要改得走专门的裁剪工具",
  },
  pathOffset: {
    label: "路径偏移",
    group: "meta",
    control: "readonly",
    hint: "Path 内部算出来的点，不是给人改的",
  },
  styles: {
    label: "逐字符样式",
    group: "meta",
    control: "readonly",
    hint: "按行/字符存的富文本样式表，要改得走富文本编辑器",
  },

  /* ---------------------------- 布局与变换 ---------------------------- */
  left: { label: "X 坐标", group: "layout", control: "number", step: 1, unit: "px" },
  top: { label: "Y 坐标", group: "layout", control: "number", step: 1, unit: "px" },
  width: { label: "宽度", group: "layout", control: "number", min: 0, step: 1, unit: "px" },
  height: { label: "高度", group: "layout", control: "number", min: 0, step: 1, unit: "px" },
  scaleX: { label: "水平缩放", group: "layout", control: "number", step: 0.01 },
  scaleY: { label: "垂直缩放", group: "layout", control: "number", step: 0.01 },
  angle: { label: "旋转角度", group: "layout", control: "number", step: 1, unit: "°" },
  skewX: { label: "水平斜切", group: "layout", control: "number", step: 1, unit: "°" },
  skewY: { label: "垂直斜切", group: "layout", control: "number", step: 1, unit: "°" },
  flipX: { label: "水平翻转", group: "layout", control: "boolean" },
  flipY: { label: "垂直翻转", group: "layout", control: "boolean" },
  originX: {
    label: "水平原点",
    group: "layout",
    control: "select",
    options: ORIGIN_X_OPTIONS,
    hint: "left / top 是相对原点哪一侧算的，改它会同时改 left 的视觉效果",
  },
  originY: { label: "垂直原点", group: "layout", control: "select", options: ORIGIN_Y_OPTIONS },

  /* ----------------------------- 几何特征 ----------------------------- */
  radius: { label: "半径", group: "shape", control: "number", min: 0, step: 1, unit: "px" },
  startAngle: { label: "起始角", group: "shape", control: "number", step: 1, unit: "°" },
  endAngle: { label: "结束角", group: "shape", control: "number", step: 1, unit: "°" },
  counterClockwise: {
    label: "逆时针",
    group: "shape",
    control: "boolean",
    hint: "从起始角画到结束角时走哪一边",
  },
  rx: {
    label: "rx",
    group: "shape",
    control: "number",
    min: 0,
    step: 1,
    unit: "px",
    hint: "矩形里是圆角半径，椭圆里是水平半轴长度 —— 同名字段含义随类型变",
  },
  ry: {
    label: "ry",
    group: "shape",
    control: "number",
    min: 0,
    step: 1,
    unit: "px",
    hint: "矩形里是圆角半径，椭圆里是垂直半轴长度",
  },
  x1: {
    label: "起点 X",
    group: "shape",
    control: "number",
    step: 1,
    unit: "px",
    hint: LINE_POINT_HINT,
  },
  y1: {
    label: "起点 Y",
    group: "shape",
    control: "number",
    step: 1,
    unit: "px",
    hint: LINE_POINT_HINT,
  },
  x2: {
    label: "终点 X",
    group: "shape",
    control: "number",
    step: 1,
    unit: "px",
    hint: LINE_POINT_HINT,
  },
  y2: {
    label: "终点 Y",
    group: "shape",
    control: "number",
    step: 1,
    unit: "px",
    hint: LINE_POINT_HINT,
  },
  points: {
    label: "顶点数组",
    group: "shape",
    control: "readonly",
    hint: "折线/多边形的每个顶点，结构是数组，面板暂不支持编辑",
  },
  path: {
    label: "SVG 路径指令",
    group: "shape",
    control: "readonly",
    hint: "fabric 把 d 指令解析成了 [指令, x, y] 数组存起来，直接 set 字符串会破坏渲染，所以这里只读",
  },

  /* ------------------------------- 外观 ------------------------------- */
  fill: { label: "填充色", group: "appearance", control: "color" },
  opacity: {
    label: "不透明度",
    group: "appearance",
    control: "slider",
    min: 0,
    max: 1,
    step: 0.01,
  },
  visible: { label: "可见", group: "appearance", control: "boolean" },
  backgroundColor: { label: "对象背景色", group: "appearance", control: "color" },
  paintFirst: {
    label: "绘制顺序",
    group: "appearance",
    control: "select",
    options: PAINT_FIRST_OPTIONS,
  },
  fillRule: {
    label: "填充规则",
    group: "appearance",
    control: "select",
    options: FILL_RULE_OPTIONS,
    hint: "有自交路径时决定哪块算「内部」",
  },
  globalCompositeOperation: {
    label: "混合模式",
    group: "appearance",
    control: "select",
    options: COMPOSITE_OPTIONS,
  },

  /* ------------------------------- 描边 ------------------------------- */
  stroke: { label: "描边色", group: "stroke", control: "color" },
  strokeWidth: {
    label: "描边宽度",
    group: "stroke",
    control: "number",
    min: 0,
    step: 0.5,
    unit: "px",
  },
  strokeDashArray: {
    label: "虚线",
    group: "stroke",
    control: "numberList",
    hint: "逗号分隔的「实线长, 空白长」循环，留空就是实线",
  },
  strokeDashOffset: { label: "虚线偏移", group: "stroke", control: "number", step: 1 },
  strokeLineCap: {
    label: "线端",
    group: "stroke",
    control: "select",
    options: STROKE_LINE_CAP_OPTIONS,
  },
  strokeLineJoin: {
    label: "拐角",
    group: "stroke",
    control: "select",
    options: STROKE_LINE_JOIN_OPTIONS,
  },
  strokeMiterLimit: { label: "尖角上限", group: "stroke", control: "number", min: 0, step: 0.5 },
  strokeUniform: {
    label: "描边等宽",
    group: "stroke",
    control: "boolean",
    hint: "打开后缩放对象时描边宽度不跟着变",
  },

  /* ------------------------------- 文字 ------------------------------- */
  text: { label: "文本内容", group: "text", control: "longText" },
  fontFamily: {
    label: "字体",
    group: "text",
    control: "select",
    options: FONT_FAMILY_OPTIONS,
    filterable: true,
    tag: true,
    hint: "可以直接输入候选项以外的字体名",
  },
  fontSize: { label: "字号", group: "text", control: "number", min: 1, step: 1, unit: "px" },
  fontWeight: { label: "字重", group: "text", control: "select", options: FONT_WEIGHT_OPTIONS },
  fontStyle: { label: "字形", group: "text", control: "select", options: FONT_STYLE_OPTIONS },
  lineHeight: { label: "行高", group: "text", control: "number", min: 0, step: 0.05 },
  charSpacing: {
    label: "字间距",
    group: "text",
    control: "number",
    step: 10,
    hint: "单位是千分之一 em，0 就是默认间距",
  },
  textAlign: { label: "对齐", group: "text", control: "select", options: TEXT_ALIGN_OPTIONS },
  underline: { label: "下划线", group: "text", control: "boolean" },
  overline: { label: "上划线", group: "text", control: "boolean" },
  linethrough: { label: "删除线", group: "text", control: "boolean" },
  textBackgroundColor: { label: "文字背景色", group: "text", control: "color" },
  textDecorationColor: { label: "装饰线颜色", group: "text", control: "color" },
  textDecorationThickness: {
    label: "装饰线粗细",
    group: "text",
    control: "number",
    min: 0,
    step: 0.5,
    unit: "px",
  },
  direction: {
    label: "文字方向",
    group: "text",
    control: "select",
    options: TEXT_DIRECTION_OPTIONS,
  },
  pathAlign: {
    label: "路径文字对齐",
    group: "text",
    control: "select",
    options: [
      { label: "基线", value: "baseline" },
      { label: "顶部", value: "top" },
      { label: "居中", value: "middle" },
      { label: "底部", value: "bottom" },
    ],
    hint: "只有把文字绑到 path 上才有意义",
  },
  pathSide: {
    label: "路径文字侧",
    group: "text",
    control: "select",
    options: [
      { label: "左侧", value: "left" },
      { label: "右侧", value: "right" },
    ],
  },
  pathStartOffset: { label: "路径起点偏移", group: "text", control: "number", step: 1 },
};

/**
 * 这些类型的 width / height 是**算出来的**。
 *
 * fabric 内部每次重排/重算都会覆盖它们，面板上改了不起作用，
 * 所以降级成只读并说清楚原因 —— 与其让人改半天没反应，不如当场解释。
 */
const DERIVED_SIZE_REASONS: Record<string, Record<string, string>> = {
  Text: { width: "由文字内容排版算出", height: "由文字内容排版算出" },
  IText: { width: "由文字内容排版算出", height: "由文字内容排版算出" },
  Textbox: { height: "由文字内容和宽度排版算出（宽度本身可以改）" },
  Line: { width: "由 x1 / y1 / x2 / y2 决定", height: "由 x1 / y1 / x2 / y2 决定" },
  Polyline: { width: "由 points 顶点算出", height: "由 points 顶点算出" },
  Polygon: { width: "由 points 顶点算出", height: "由 points 顶点算出" },
  Path: { width: "由 path 的包围盒算出", height: "由 path 的包围盒算出" },
  Circle: { width: "由 radius 算出（改 radius）", height: "由 radius 算出（改 radius）" },
  Ellipse: { width: "由 rx 算出（改 rx）", height: "由 ry 算出（改 ry）" },
};

const UNSUPPORTED_COLOR_HINT = "当前值不是纯色（可能是渐变 / 图案对象），面板暂不支持编辑";

/* -------------------------------------------------------------------------- */
/* 值归一化                                                                    */
/* -------------------------------------------------------------------------- */

const COLOR_PATTERN = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(|hsla?\()/i;

/** CSS 颜色关键字 → 十六进制。颜色选择器认不了 `red` 这种写法，读的时候顺手转掉 */
const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  white: "#ffffff",
  maroon: "#800000",
  red: "#ff0000",
  purple: "#800080",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
  green: "#008000",
  lime: "#00ff00",
  olive: "#808000",
  yellow: "#ffff00",
  navy: "#000080",
  blue: "#0000ff",
  teal: "#008080",
  aqua: "#00ffff",
  cyan: "#00ffff",
  orange: "#ffa500",
  pink: "#ffc0cb",
  brown: "#a52a2a",
  gold: "#ffd700",
  indigo: "#4b0082",
};

/**
 * 归一化颜色值。
 *
 * - 能认出来 → 返回颜色字符串（`null` 表示「没有颜色」，交给空的选择器）
 * - 认不出来 → 返回 `undefined`，调用方降级成只读
 */
function normalizeColor(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;

  const named = NAMED_COLORS[value.trim().toLowerCase()];
  if (named) return named;

  return COLOR_PATTERN.test(value.trim()) ? value.trim() : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** `strokeDashArray` 这类「数字数组」：空 / null 统一成空数组，其它一律降级 */
function toNumberList(value: unknown): number[] | undefined {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? (value as number[])
    : undefined;
}

/** 只读字段的展示文本：紧凑 JSON，避免在面板里铺开几十行 */
function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    // 顶层是函数 / Symbol 时 stringify 会返回 undefined，统一给个占位符
    return JSON.stringify(value) ?? "(无法序列化)";
  } catch {
    // 循环引用等情况
    return "(无法序列化)";
  }
}

/** 当前值不在候选里时补一个，否则下拉框会显示空白 */
function withCurrentValue(options: PropertyOption[], value: string): PropertyOption[] {
  return options.some((option) => option.value === value)
    ? options
    : [...options, { label: `${value}（当前值）`, value }];
}

/* -------------------------------------------------------------------------- */
/* 对外入口                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 把一份序列化结果翻译成表单字段列表。
 *
 * `undefined` 会被丢掉：fabric 的 `toObject()` 用的是 `key in object` 判断，
 * 所以它会把 `path: undefined` 这种「声明了但没值」的字段也带上，
 * 而 `JSON.stringify` 里它们本来就不存在。面板和导出的 JSON 保持一致，所以这里也滤掉。
 *
 * @param values `object.toObject()` 的输出（含 `type`，用它来判断派生字段）
 */
export function describeObjectProperties(values: Record<string, unknown>): PropertyDescriptor[] {
  const typeName = typeof values.type === "string" ? values.type : "";

  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => describeProperty(key, value, typeName));
}

function describeProperty(key: string, value: unknown, typeName: string): PropertyDescriptor {
  const rule = PROPERTY_RULES[key];
  const label = rule?.label ?? key;
  const group = rule?.group ?? "custom";

  // 派生的宽高优先于规则表：能改也不该改
  const derivedReason = DERIVED_SIZE_REASONS[typeName]?.[key];
  if (derivedReason) {
    return readonly({ key, label, group, value, hint: derivedReason });
  }

  if (!rule) return inferByValue({ key, label, group, value });

  switch (rule.control) {
    case "color": {
      const color = normalizeColor(value);
      if (color === undefined) {
        return readonly({ key, label, group, value, hint: UNSUPPORTED_COLOR_HINT });
      }
      return { key, label, group, control: "color", value: color, editable: true, hint: rule.hint };
    }
    case "number":
    case "slider": {
      const num = toFiniteNumber(value);
      if (num === undefined) {
        return readonly({ key, label, group, value, hint: "当前值不是有效数字" });
      }
      return {
        key,
        label,
        group,
        control: rule.control,
        value: num,
        editable: true,
        min: rule.min,
        max: rule.max,
        step: rule.step,
        unit: rule.unit,
        hint: rule.hint,
      };
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        return readonly({ key, label, group, value, hint: "当前值不是布尔值" });
      }
      return { key, label, group, control: "boolean", value, editable: true, hint: rule.hint };
    }
    case "select": {
      if (typeof value !== "string") {
        return readonly({ key, label, group, value, hint: "当前值不是可选项" });
      }
      return {
        key,
        label,
        group,
        control: "select",
        value,
        editable: true,
        options: withCurrentValue(rule.options ?? [], value),
        filterable: rule.filterable,
        tag: rule.tag,
        hint: rule.hint,
      };
    }
    case "numberList": {
      const list = toNumberList(value);
      if (!list) return readonly({ key, label, group, value, hint: "当前值不是数字数组" });
      return {
        key,
        label,
        group,
        control: "numberList",
        value: list,
        editable: true,
        hint: rule.hint,
      };
    }
    case "readonly":
      // 规则表里明确标了只读的字段（type / version / shadow / path / points …），照实展示即可
      return readonly({ key, label, group, value, hint: rule.hint });
    default: {
      // 剩下的只可能是 text / longText：只接受字符串，其它一律只读展示
      if (typeof value !== "string") {
        return readonly({ key, label, group, value, hint: rule.hint });
      }
      return { key, label, group, control: rule.control, value, editable: true, hint: rule.hint };
    }
  }
}

/** 规则表没覆盖的字段：按真实值的类型给个最保守的控件 */
function inferByValue(input: {
  key: string;
  label: string;
  group: PropertyGroup;
  value: unknown;
}): PropertyDescriptor {
  const { key, label, group, value } = input;

  if (typeof value === "number") {
    return { key, label, group, control: "number", value, editable: true, step: 1 };
  }
  if (typeof value === "boolean") {
    return { key, label, group, control: "boolean", value, editable: true };
  }
  if (typeof value === "string") {
    return { key, label, group, control: "text", value, editable: true };
  }

  return readonly({ key, label, group, value });
}

function readonly(input: {
  key: string;
  label: string;
  group: PropertyGroup;
  value: unknown;
  hint?: string;
}): PropertyDescriptor {
  const { key, label, group, value, hint } = input;
  return {
    key,
    label,
    group,
    control: "readonly",
    value,
    editable: false,
    display: formatValue(value),
    hint: hint ?? "复杂结构（数组 / 嵌套对象），面板暂不支持编辑",
  };
}
