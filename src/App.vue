<script setup lang="ts">
import { ref, shallowRef } from "vue";
import EditorCanvas from "./components/EditorCanvas.vue";
import MyCustomObjectPlugin, { MyCustomObject } from "./plugins/MyCustomObjectPlugin";
import type { Editor, PluginConstructor } from "./core";

/**
 * 插件在应用层显式登记：想在编辑器里用哪些能力，一眼可见。
 * 后续新增插件（快捷键、历史记录、对齐吸附...）只需要往这个数组里加一项。
 */
const plugins: PluginConstructor[] = [MyCustomObjectPlugin];

const editor = shallowRef<Editor | null>(null);
const objectCount = ref(0);
const selectionText = ref("未选中");
const snapshot = ref("");

function syncStatus(): void {
  objectCount.value = editor.value?.canvas.getObjects().length ?? 0;
}

/** EditorCanvas 挂载完成：拿到 editor 后在这里做全局订阅 */
function handleReady(instance: Editor): void {
  editor.value = instance;
  syncStatus();

  instance.on("object:added", syncStatus);
  instance.on("object:removed", syncStatus);
  instance.on("selection:changed", ({ mode, targets }) => {
    if (mode === "empty") {
      selectionText.value = "未选中";
      return;
    }
    selectionText.value = `${mode === "one" ? "单选" : "多选"} ${targets.length} 个对象`;
  });
}

/** 演示「fabric 内置对象」：走统一的 registry 入口 */
function addRect(): void {
  const instance = editor.value;
  if (!instance) return;

  const rect = instance.registry.create("Rect", {
    left: 80 + objectCount.value * 16,
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
  syncStatus();
}

/** 演示「插件 API 代理」：类型由插件里的 declare module 补全 */
function addCustomObject(): void {
  const instance = editor.value;
  if (!instance) return;

  const object = instance.createMyObject({
    left: 320,
    top: 240,
    width: 160,
    height: 100,
    fill: "#ff9f43",
    customProp: `自定义对象 #${objectCount.value + 1}`,
  });

  instance.canvas.setActiveObject(object);
  instance.canvas.requestRenderAll();
  syncStatus();
}

/** 演示插件 API 的第二次调用：修改属性并广播 myPlugin:change */
function renameSelected(): void {
  const instance = editor.value;
  if (!instance) return;

  const [target] = instance.canvas.getActiveObjects();
  if (!(target instanceof MyCustomObject)) {
    selectionText.value = "请先选中一个自定义对象";
    return;
  }

  instance.updateMyObject(target, {
    customProp: `已更新 ${target.customProp || "（空）"} +`,
  });
}

function exportJSON(): void {
  if (!editor.value) return;
  snapshot.value = editor.value.exportJSON();
}

async function importJSON(): Promise<void> {
  const instance = editor.value;
  if (!instance || !snapshot.value) return;

  await instance.loadJSON(snapshot.value);
  syncStatus();
}

function clearCanvas(): void {
  const instance = editor.value;
  if (!instance) return;

  const objects = instance.canvas.getObjects();
  if (objects.length > 0) instance.canvas.remove(...objects);
  instance.canvas.requestRenderAll();
  syncStatus();
}
</script>

<template>
  <main class="app">
    <header class="app__header">
      <div>
        <h1 class="app__title">Fabric Editor Base</h1>
        <p class="app__subtitle">Editor + ObjectRegistry + Plugin 的最小可运行地基</p>
      </div>

      <dl class="app__stats">
        <div>
          <dt>对象</dt>
          <dd>{{ objectCount }}</dd>
        </div>
        <div>
          <dt>选择</dt>
          <dd>{{ selectionText }}</dd>
        </div>
      </dl>
    </header>

    <div class="app__toolbar">
      <button type="button" @click="addRect">添加矩形</button>
      <button type="button" @click="addCustomObject">添加自定义对象</button>
      <button type="button" @click="renameSelected">改选中对象</button>
      <span class="app__toolbar-divider" />
      <button type="button" @click="exportJSON">导出 JSON</button>
      <button type="button" :disabled="!snapshot" @click="importJSON">导入 JSON</button>
      <button type="button" class="is-danger" @click="clearCanvas">清空</button>
    </div>

    <section class="app__stage">
      <EditorCanvas :plugins="plugins" @ready="handleReady" />
    </section>

    <section v-if="snapshot" class="app__snapshot">
      <div class="app__snapshot-head">
        <span>导出的 JSON</span>
        <span class="app__snapshot-size">{{ snapshot.length }} chars</span>
      </div>
      <pre>{{ snapshot }}</pre>
    </section>
  </main>
</template>

<style scoped>
.app {
  width: min(1100px, 100%);
  margin: 0 auto;
  padding: 40px 24px 64px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.app__header {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
}

.app__title {
  margin: 0;
  font-size: 24px;
  letter-spacing: -0.02em;
  color: var(--text-strong);
}

.app__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

.app__stats {
  display: flex;
  gap: 24px;
  margin: 0;
}

.app__stats dt {
  font-size: 12px;
  color: var(--text-muted);
}

.app__stats dd {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
}

.app__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}

.app__toolbar-divider {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--border);
}

.app__toolbar button {
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

.app__toolbar button:hover:not(:disabled) {
  border-color: var(--accent);
}

.app__toolbar button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.app__toolbar .is-danger:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}

.app__stage {
  display: flex;
  justify-content: center;
  padding: 24px;
  border-radius: 12px;
  background: var(--stage);
}

.app__snapshot {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface);
}

.app__snapshot-head {
  display: flex;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 12px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

.app__snapshot pre {
  margin: 0;
  padding: 14px;
  max-height: 220px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-strong);
}
</style>
