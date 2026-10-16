<script setup lang="ts">
import { shallowRef } from "vue";
import { storeToRefs } from "pinia";
import EditorCanvas from "../components/EditorCanvas.vue";
import EditorStorePlugin from "../plugins/EditorStorePlugin";
import { MyCustomObject, registerCustomObjects } from "../objects";
import { useEditorStore } from "../stores";
import type { Editor, PluginUse } from "../core";

/**
 * 地基演示页。
 *
 * 这一页故意**不做**业务功能，只把地基暴露出来给人看：
 * 装了哪些插件、事件是怎麼同步进 store 的、导出的 JSON 长什么样。
 * 想真正用编辑器改图形属性，去 `/playground`。
 *
 * UI 状态的唯一来源是 store：`EditorStorePlugin` 负责把 Editor 的事件写进来，
 * 组件只读不写。
 */
const store = useEditorStore();
const { objectCount, selectionLabel, selected, installedPlugins, lastEvent, syncCount } =
  storeToRefs(store);

/**
 * 插件在应用层显式登记：想在编辑器里用哪些能力，一眼可见。
 * `EditorStorePlugin` 是 `[类, 选项]` 的写法 —— 它需要拿到 store 实例。
 *
 * 这一页**只装这一个**插件。造对象、改属性全都直接用代码调 registry 和 canvas，
 * 因为本页演示的就是地基本身，中间不该再垫一层。
 */
const plugins: PluginUse[] = [[EditorStorePlugin, { store }]];

const editor = shallowRef<Editor | null>(null);
const snapshot = shallowRef("");

function handleReady(instance: Editor): void {
  // 登记自定义对象类型，否则 registry.create("MyCustomObject") 会抛「未知类型」。
  // 核心层不认识项目里有哪些自定义对象，这一步只能由应用层显式做。
  registerCustomObjects(instance.registry);
  editor.value = instance;
}

/** 添加 fabric 内置对象：走统一的 registry 入口 */
function addRect(): void {
  const instance = editor.value;
  if (!instance) return;

  const rect = instance.registry.create("Rect", {
    left: 80 + (objectCount.value % 6) * 24,
    top: 80,
    width: 140,
    height: 90,
    fill: "#4f7cff",
    rx: 8,
    ry: 8,
  });

  instance.canvas.add(rect);
  instance.canvas.setActiveObject(rect);
  instance.canvas.requestRenderAll();
}

/** 添加自定义对象。和 addRect 一样直接走 registry + canvas，只是类型得先自己登记 */
function addCustomObject(): void {
  const instance = editor.value;
  if (!instance) return;

  const object = instance.registry.create("MyCustomObject", {
    left: 320,
    top: 240,
    width: 160,
    height: 100,
    fill: "#ff9f43",
    customProp: `自定义对象 #${objectCount.value + 1}`,
  });

  instance.canvas.add(object);
  instance.canvas.setActiveObject(object);
  instance.canvas.requestRenderAll();
}

/**
 * 改选中对象的自定义字段。
 *
 * 这里刻意直接 `set()` 而不走插件 —— 本页演示的就是「裸地基」：
 * registry 创建、canvas 直调、事件同步进 store，全都摊开给人看。
 * 想用表单化的属性编辑，去 `/playground`。
 */
function renameSelected(): void {
  const instance = editor.value;
  if (!instance) return;

  const [target] = instance.canvas.getActiveObjects();
  if (!(target instanceof MyCustomObject)) {
    store.markEvent("请先选中一个自定义对象");
    return;
  }

  target.set({ customProp: `已更新 ${target.customProp || "（空）"} +` });
  // 自定义字段参与了 `_render`，改完要让命中区域重算
  target.setCoords();
  instance.canvas.requestRenderAll();
}

function exportJSON(): void {
  if (!editor.value) return;
  snapshot.value = editor.value.exportJSON();
}

/** 导入后 UI 会自动刷新：靠插件的 hookImportAfter 重新同步 store */
async function importJSON(): Promise<void> {
  const instance = editor.value;
  if (!instance || !snapshot.value) return;

  await instance.loadJSON(snapshot.value);
}

function clearCanvas(): void {
  const instance = editor.value;
  if (!instance) return;

  const objects = instance.canvas.getObjects();
  if (objects.length > 0) instance.canvas.remove(...objects);
  instance.canvas.requestRenderAll();
}

/** 演示插件 API：手动强制同步（正常不用调，事件已经覆盖了） */
function forceSync(): void {
  editor.value?.syncEditorState();
}
</script>

<template>
  <main class="demo">
    <header class="demo__header">
      <div>
        <h1 class="demo__title">地基演示</h1>
        <p class="demo__subtitle">Editor + ObjectRegistry + Plugin + Pinia 的最小可运行地基</p>
      </div>

      <dl class="demo__stats">
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

    <div class="demo__toolbar">
      <button type="button" @click="addRect">添加矩形</button>
      <button type="button" @click="addCustomObject">添加自定义对象</button>
      <button type="button" @click="renameSelected">改选中对象</button>
      <span class="demo__toolbar-divider" />
      <button type="button" @click="exportJSON">导出 JSON</button>
      <button type="button" :disabled="!snapshot" @click="importJSON">导入 JSON</button>
      <button type="button" class="is-danger" @click="clearCanvas">清空</button>
    </div>

    <section class="demo__stage">
      <EditorCanvas :plugins="plugins" @ready="handleReady" />
    </section>

    <section class="demo__panels">
      <article class="demo__panel">
        <h2 class="demo__panel-title">
          选中对象
          <span class="demo__badge">{{ selected.length }}</span>
        </h2>
        <ul v-if="selected.length" class="demo__list">
          <li v-for="(item, index) in selected" :key="`${item.label}-${index}`">
            <span class="demo__tag">{{ item.type }}</span>
            <span class="demo__list-text">{{ item.label }}</span>
          </li>
        </ul>
        <p v-else class="demo__empty">未选中任何对象</p>
      </article>

      <article class="demo__panel">
        <h2 class="demo__panel-title">
          已装载插件
          <span class="demo__badge">{{ installedPlugins.length }}</span>
        </h2>
        <ul class="demo__list">
          <li v-for="name in installedPlugins" :key="name">
            <span class="demo__list-text">{{ name }}</span>
          </li>
        </ul>
      </article>

      <article class="demo__panel">
        <h2 class="demo__panel-title">Store 同步</h2>
        <p class="demo__empty">
          最近事件：<code>{{ lastEvent ?? "—" }}</code>
        </p>
        <p class="demo__empty">
          同步次数：<code>{{ syncCount }}</code>
        </p>
        <button type="button" class="demo__mini-btn" @click="forceSync">手动强制同步</button>
      </article>
    </section>

    <section v-if="snapshot" class="demo__snapshot">
      <div class="demo__snapshot-head">
        <span>导出的 JSON</span>
        <span class="demo__snapshot-size">{{ snapshot.length }} chars</span>
      </div>
      <pre>{{ snapshot }}</pre>
    </section>
  </main>
</template>

<style scoped>
.demo {
  width: min(1100px, 100%);
  margin: 0 auto;
  padding: 36px 24px 64px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.demo__header {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
}

.demo__title {
  margin: 0;
  font-size: 24px;
  letter-spacing: -0.02em;
  color: var(--text-strong);
}

.demo__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

.demo__stats {
  display: flex;
  gap: 24px;
  margin: 0;
}

.demo__stats dt {
  font-size: 12px;
  color: var(--text-muted);
}

.demo__stats dd {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
}

.demo__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}

.demo__toolbar-divider {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--border);
}

.demo__toolbar button {
  font: inherit;
  font-size: 13px;
  padding: 7px 14px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--surface-strong);
  color: var(--text-strong);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.demo__toolbar button:hover:not(:disabled) {
  border-color: var(--accent);
}

.demo__toolbar button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.demo__toolbar .is-danger:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}

.demo__stage {
  display: flex;
  justify-content: center;
  padding: 24px;
  border-radius: 12px;
  background: var(--stage);
}

.demo__panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.demo__panel {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}

.demo__panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
}

.demo__badge {
  padding: 1px 7px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 999px;
  background: var(--stage);
  color: var(--text-muted);
}

.demo__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.demo__list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.demo__tag {
  flex: none;
  padding: 1px 6px;
  font-size: 11px;
  border-radius: 4px;
  background: rgb(79 124 255 / 12%);
  color: var(--accent);
}

.demo__list-text {
  font-size: 12px;
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo__empty {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.demo__empty code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--stage);
  color: var(--text-strong);
}

.demo__mini-btn {
  margin-top: 4px;
  font: inherit;
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface-strong);
  color: var(--text-strong);
  cursor: pointer;
}

.demo__mini-btn:hover {
  border-color: var(--accent);
}

.demo__snapshot {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface);
}

.demo__snapshot-head {
  display: flex;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 12px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

.demo__snapshot pre {
  margin: 0;
  padding: 14px;
  max-height: 220px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-strong);
}
</style>
