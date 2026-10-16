import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import type { FabricObject } from "fabric";
import { objectTypeName } from "../core/objectType";
import type { SelectionMode } from "../core/types";

/**
 * 选中对象的摘要。
 *
 * 刻意只保留可展示的字符串，**不持有 fabric 实例**：
 * store 是 UI 的唯一数据源，UI 读快照就够了；把实例塞进来会让 UI 具备
 * 反向操作画布的能力，状态来源就又不唯一了。
 */
export interface SelectedObjectSummary {
  /** fabric 的类标识（Rect / Circle / MyCustomObject ...） */
  type: string;
  /**
   * 展示名。
   * fabric 没有统一的 `name` 字段，所以约定：对象上带字符串 `name` 就用它，
   * 否则退化成「类型 #序号」。
   */
  label: string;
}

/** 从 fabric 对象提取展示信息 */
function toSummary(object: FabricObject, index: number): SelectedObjectSummary {
  const type = objectTypeName(object);
  const named = (object as unknown as { name?: unknown }).name;
  const name = typeof named === "string" ? named : "";

  return { type, label: name || `${type} #${index + 1}` };
}

/**
 * 编辑器 UI 状态。
 *
 * 写入方只有 `EditorStorePlugin` 一个（它监听 Editor 事件后调用下面的 setter），
 * 组件一律只读。这样「画布状态」到「UI 状态」只有一条单向通路，好排查也好测。
 */
export const useEditorStore = defineStore("editor", () => {
  /* --------------------------------- state -------------------------------- */

  /** 画布上的对象总数 */
  const objectCount = ref(0);
  /** 选择模式：单选 / 多选 / 空选 */
  const selectionMode = ref<SelectionMode>("empty");
  /** 当前选中的对象摘要 */
  const selected = ref<SelectedObjectSummary[]>([]);
  /** 已装载的插件名（按装载顺序） */
  const installedPlugins = ref<string[]>([]);
  /** 最近一次触发同步的事件名（排查问题时很有用） */
  const lastEvent = ref<string | null>(null);
  /** 同步次数：组件想「每次同步都做点什么」时 watch 它一个就够了 */
  const syncCount = ref(0);
  /**
   * 选中对象的**序列化快照**（`toObject()` 的结果）。
   *
   * 用 `shallowRef` 是因为每次都是整体替换、从不原地改字段；
   * 深响应式会让 Vue 去递归代理几十个嵌套字段（`points`、`styles` 数组），
   * 拖动时每帧都白跑一遍，得不偿失。
   */
  const selectedValues = shallowRef<Record<string, unknown> | null>(null);
  /** 快照对应的类型名，面板上做标题用 */
  const selectedType = ref<string | null>(null);

  /* -------------------------------- getters ------------------------------- */

  const hasObjects = computed(() => objectCount.value > 0);
  const hasSelection = computed(() => selectionMode.value !== "empty");
  const isSingleSelection = computed(() => selectionMode.value === "one");
  const isMultiSelection = computed(() => selectionMode.value === "multi");
  /** 属性面板能不能编辑：必须恰好选中一个对象 */
  const canEditProperties = computed(() => selectedValues.value !== null);

  /** 直接给 UI 用的选择描述文案 */
  const selectionLabel = computed(() => {
    if (selectionMode.value === "empty") return "未选中";
    const prefix = selectionMode.value === "one" ? "单选" : "多选";
    return `${prefix} ${selected.value.length} 个`;
  });

  /* -------------------------------- actions ------------------------------- */

  function setObjectCount(count: number): void {
    objectCount.value = count;
  }

  function setSelection(mode: SelectionMode, targets: FabricObject[]): void {
    selectionMode.value = mode;
    // 注意：`Editor` 在 selection:cleared 时带的是「刚被取消选中的对象」，
    // 对 UI 来说那时就是没选中，所以这里统一归一化成空列表。
    selected.value = mode === "empty" ? [] : targets.map(toSummary);
  }

  /**
   * 写入选中对象的属性快照。
   *
   * 传 `null` 表示「当前没有可编辑的对象」（未选中或多选），面板据此显示空状态。
   */
  function setSelectedProperties(
    snapshot: { type: string; values: Record<string, unknown> } | null,
  ): void {
    selectedType.value = snapshot?.type ?? null;
    selectedValues.value = snapshot?.values ?? null;
  }

  function setPlugins(names: string[]): void {
    installedPlugins.value = [...names];
  }

  /** 记录一次同步（事件名 + 计数），所有 setter 走完都会调它 */
  function markEvent(event: string): void {
    lastEvent.value = event;
    syncCount.value += 1;
  }

  /** 回到初始状态：编辑器销毁 / 切换文档时调用 */
  function reset(): void {
    objectCount.value = 0;
    selectionMode.value = "empty";
    selected.value = [];
    installedPlugins.value = [];
    lastEvent.value = null;
    selectedValues.value = null;
    selectedType.value = null;
  }

  return {
    // state
    objectCount,
    selectionMode,
    selected,
    installedPlugins,
    lastEvent,
    syncCount,
    selectedValues,
    selectedType,
    // getters
    hasObjects,
    hasSelection,
    isSingleSelection,
    isMultiSelection,
    canEditProperties,
    selectionLabel,
    // actions
    setObjectCount,
    setSelection,
    setSelectedProperties,
    setPlugins,
    markEvent,
    reset,
  };
});

/**
 * store 实例类型。
 *
 * 这是给**非组件模块**（比如 `EditorStorePlugin`）用的：
 * 它们不能依赖组件里的 `storeToRefs`，但可以依赖这个类型。
 */
export type EditorUIStore = ReturnType<typeof useEditorStore>;
