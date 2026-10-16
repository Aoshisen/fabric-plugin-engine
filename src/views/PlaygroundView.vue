<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { storeToRefs } from "pinia";
import { NButton, NButtonGroup } from "naive-ui";
import EditorCanvas from "../components/EditorCanvas.vue";
import PropertyPanel from "../components/PropertyPanel.vue";
import ShapePalette from "../components/ShapePalette.vue";
import { registerCustomObjects } from "../objects";
import EditorStorePlugin from "../plugins/EditorStorePlugin";
import PropertyPlugin from "../plugins/PropertyPlugin";
import {
  addShape,
  arrangeSelected,
  availableShapes,
  clearCanvas,
  removeSelected,
} from "../playground/shapeActions";
import type { ArrangeAction } from "../playground/shapeActions";
import { useEditorStore } from "../stores";
import type { Editor, PluginUse } from "../core";

/**
 * Playground：加图形 → 选中 → 在右侧改属性。
 *
 * 这一页只做两件事：
 * 1. 登记插件（能力清单一眼可见）；
 * 2. 把 UI 上的动作翻译成编辑器调用。
 *
 * 画布上的图形操作来自 `playground/shapeActions` —— **一组普通函数，不是插件**。
 * 它们无状态、不订阅事件，做成插件只是给函数套了层壳。真正需要留在插件层的是
 * `PropertyPlugin`：它持有状态、订阅事件、对外广播。
 *
 * 所有状态都读自 store，而 store 只由 `EditorStorePlugin` 写 ——
 * 面板上看到的每个数字，都是从画布上的对象序列化出来的。
 */

const store = useEditorStore();
const { objectCount, selectionLabel, hasSelection } = storeToRefs(store);

/**
 * `EditorStorePlugin` 必须排在最前面 —— 它是「编辑器事件 → store」的唯一通道，
 * 而 `PropertyPlugin` 在 `init()` 里就会广播当前状态（属性快照），
 * 通道还没建好就发出去的广播没人接。
 */
const plugins: PluginUse[] = [[EditorStorePlugin, { store }], PropertyPlugin];

const editor = shallowRef<Editor | null>(null);

function handleReady(instance: Editor): void {
  /**
   * 登记自定义对象类型 —— `registry.create()` 找得到类的前提。
   *
   * 这一步必须由应用层做：核心层不该知道项目里有哪些自定义对象。函数是幂等的，
   * 路由来回切、组件重挂载时重复调用没有副作用。
   */
  registerCustomObjects(instance.registry);
  editor.value = instance;
}

/**
 * 形状库的清单。`availableShapes()` 会滤掉注册表里没有的类型，
 * 所以这里拿到的就是「真的能造出来」的清单，不会点了才发现是空炮。
 */
const shapes = computed(() => (editor.value ? availableShapes(editor.value) : []));

/* --------------------------- UI 动作 → 编辑器调用 --------------------------- */

function handleAddShape(type: string): void {
  if (editor.value) addShape(editor.value, type);
}

/** 属性面板只报「哪个字段变成了什么」，补丁和重绘都由 PropertyPlugin 负责 */
function applyProperty(key: string, value: unknown): void {
  editor.value?.updateSelectedProperties({ [key]: value });
}

function arrange(action: ArrangeAction): void {
  if (editor.value) arrangeSelected(editor.value, action);
}

function handleRemoveSelected(): void {
  if (editor.value) removeSelected(editor.value);
}

function handleClearCanvas(): void {
  if (editor.value) clearCanvas(editor.value);
}
</script>

<template>
  <main class="playground">
    <header class="playground__intro">
      <div>
        <h1 class="playground__title">Playground</h1>
        <p class="playground__subtitle">
          左侧加图形，画布上点选，右侧改属性 —— 面板里的字段就是对象
          <code>toObject()</code> 出来的字段
        </p>
      </div>

      <dl class="playground__stats">
        <div>
          <dt>对象</dt>
          <dd>{{ objectCount }}</dd>
        </div>
        <div>
          <dt>选择</dt>
          <dd>{{ selectionLabel }}</dd>
        </div>
      </dl>
    </header>

    <div class="playground__grid">
      <ShapePalette :shapes="shapes" @add="handleAddShape" />

      <div class="playground__main">
        <div class="playground__toolbar">
          <span class="playground__toolbar-label">层级</span>
          <NButtonGroup size="small">
            <NButton :disabled="!hasSelection" @click="arrange('toFront')">置顶</NButton>
            <NButton :disabled="!hasSelection" @click="arrange('forward')">上移</NButton>
            <NButton :disabled="!hasSelection" @click="arrange('backward')">下移</NButton>
            <NButton :disabled="!hasSelection" @click="arrange('toBack')">置底</NButton>
          </NButtonGroup>

          <span class="playground__toolbar-divider" />

          <NButton size="small" :disabled="!hasSelection" @click="handleRemoveSelected"
            >删除选中</NButton
          >
          <NButton size="small" :disabled="objectCount === 0" @click="handleClearCanvas"
            >清空画布</NButton
          >
        </div>

        <section class="playground__stage">
          <EditorCanvas :width="840" :height="540" :plugins="plugins" @ready="handleReady" />
        </section>
      </div>

      <PropertyPanel @change="applyProperty" />
    </div>
  </main>
</template>

<style scoped>
.playground {
  max-width: 1560px;
  margin: 0 auto;
  padding: 20px 22px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.playground__intro {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
}

.playground__title {
  margin: 0;
  font-size: 21px;
  letter-spacing: -0.02em;
  color: var(--text-strong);
}

.playground__subtitle {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.playground__subtitle code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--stage);
  color: var(--text-strong);
}

.playground__stats {
  display: flex;
  gap: 22px;
  margin: 0;
}

.playground__stats dt {
  font-size: 11px;
  color: var(--text-muted);
}

.playground__stats dd {
  margin: 3px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
}

.playground__grid {
  display: grid;
  grid-template-columns: 172px minmax(0, 1fr) 336px;
  gap: 14px;
  align-items: start;
}

.playground__main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.playground__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}

.playground__toolbar-label {
  font-size: 11px;
  color: var(--text-muted);
}

.playground__toolbar-divider {
  width: 1px;
  height: 18px;
  margin: 0 2px;
  background: var(--border);
}

/*
 * 画布固定 840×540 且不做缩放，窄屏时这里横向滚动。
 * 理由见 EditorCanvas 里的注释：fabric 会把尺寸写成行内样式，
 * 强行缩放会让画面非等比变形，坐标也会和面板上的数字对不上。
 */
.playground__stage {
  padding: 20px;
  border-radius: 12px;
  background: var(--stage);
  overflow: auto;
}

@media (max-width: 1180px) {
  .playground__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .playground__stage {
    order: -1;
  }
}
</style>
