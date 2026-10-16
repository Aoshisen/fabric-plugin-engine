/**
 * 属性面板的「表单字段描述」。
 *
 * 设计上刻意让这一层**完全不认识 fabric 实例**：输入是 `object.toObject()` 出来的
 * 普通对象，输出是可以直接 `v-for` 渲染的纯数据。
 * 好处有三个：属性面板、导出、单测拿到的都是同一份东西；UI 无法反向操作画布；
 * 描述器可以在 Node 里脱离画布直接测。
 */

/** 字段用哪种控件渲染 */
export type PropertyControlKind =
  /** 数字输入框 */
  | "number"
  /** 0..1 之类的滑杆（目前只有 opacity 用） */
  | "slider"
  /** 颜色选择器 */
  | "color"
  /** 单行文本 */
  | "text"
  /** 多行文本（text 内容、SVG path 指令） */
  | "longText"
  /** 开关 */
  | "boolean"
  /** 枚举下拉 */
  | "select"
  /** 逗号分隔的数字列表，例如 strokeDashArray */
  | "numberList"
  /** 只读，展示原始值的 JSON */
  | "readonly";

/** 字段分组，决定属性面板里的分节顺序 */
export type PropertyGroup =
  | "layout"
  | "shape"
  | "appearance"
  | "stroke"
  | "text"
  | "custom"
  | "meta";

export interface PropertyOption {
  label: string;
  value: string;
}

export interface PropertyDescriptor {
  /** 字段名，同时也是 `object.set()` 的 key */
  key: string;
  /** 面板上显示的中文标签 */
  label: string;
  group: PropertyGroup;
  control: PropertyControlKind;
  /** 已经归一化过的当前值，可直接绑定到表单控件 */
  value: unknown;
  /** 是否可写。`false` 的字段依然展示，但要说明为什么不能改 */
  editable: boolean;
  /** number / slider 的范围与步长 */
  min?: number;
  max?: number;
  step?: number;
  /** 数值单位，显示在输入框后缀 */
  unit?: string;
  /** select 的候选项 */
  options?: PropertyOption[];
  /** 下拉框是否允许搜索 / 允许输入候选项之外的值 */
  filterable?: boolean;
  tag?: boolean;
  /** 一句话解释，尤其是「为什么这个字段不能改」 */
  hint?: string;
  /** 只读字段的展示文本（紧凑 JSON） */
  display?: string;
}

export const PROPERTY_GROUP_LABELS: Record<PropertyGroup, string> = {
  layout: "布局与变换",
  shape: "几何特征",
  appearance: "外观",
  stroke: "描边",
  text: "文字",
  custom: "自定义字段",
  meta: "序列化信息",
};

/** 面板里的分节顺序 */
export const PROPERTY_GROUP_ORDER: readonly PropertyGroup[] = [
  "layout",
  "shape",
  "appearance",
  "stroke",
  "text",
  "custom",
  "meta",
];

/** 把扁平字段列表按分组切开，空的组直接丢掉 */
export function groupProperties(
  properties: readonly PropertyDescriptor[],
): Array<{ group: PropertyGroup; label: string; items: PropertyDescriptor[] }> {
  return PROPERTY_GROUP_ORDER.map((group) => ({
    group,
    label: PROPERTY_GROUP_LABELS[group],
    items: properties.filter((property) => property.group === group),
  })).filter((section) => section.items.length > 0);
}
