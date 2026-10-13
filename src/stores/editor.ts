import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { FabricObject } from "fabric";
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

/**
 * 取对象的类型名。
 *
 * 注意**不能**用实例上的 `object.type`：fabric v7 里那个是遗留的小写标识
 * （`rect` / `circle`，官方已标 deprecated），拿它做 UI 展示和判断都会出错。
 * 与 `static type` 一致、真正用于序列化的是**构造函数**上的 `type`：
 * `object.constructor.type` → `Rect` / `MyCustomObject`。
 */
function typeNameOf(object: FabricObject): string {
  const ctor = object.constructor as { type?: string };
  return ctor.type || object.type || "Unknown";
}

/** 从 fabric 对象提取展示信息 */
function toSummary(object: FabricObject, index: number): SelectedObjectSummary {
  const type = typeNameOf(object);
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

  /* -------------------------------- getters ------------------------------- */

  const hasObjects = computed(() => objectCount.value > 0);
  const hasSelection = computed(() => selectionMode.value !== "empty");
  const isSingleSelection = computed(() => selectionMode.value === "one");
  const isMultiSelection = computed(() => selectionMode.value === "multi");

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
  }

  return {
    // state
    objectCount,
    selectionMode,
    selected,
    installedPlugins,
    lastEvent,
    syncCount,
    // getters
    hasObjects,
    hasSelection,
    isSingleSelection,
    isMultiSelection,
    selectionLabel,
    // actions
    setObjectCount,
    setSelection,
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
