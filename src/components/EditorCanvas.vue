<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { Editor } from "../core";
import type { PluginUse } from "../core";

/**
 * 画布宿主组件。
 *
 * 只负责「画布生命周期」这一件事：挂载时创建 Editor，卸载时销毁。
 * 具体装哪些插件、装完之后干什么，全部由父级通过 props / ready 事件决定，
 * 这样后续加工具栏、标尺、图层面板时这个组件都不用改。
 */
const props = withDefaults(
  defineProps<{
    width?: number;
    height?: number;
    backgroundColor?: string;
    /**
     * 需要装载的插件，按数组顺序装载。
     * 直接给类表示用默认配置；写成 `[类, 选项]` 可以往插件里注入依赖
     * （例如把 Pinia store 交给 `EditorStorePlugin`）。
     */
    plugins?: PluginUse[];
  }>(),
  {
    width: 960,
    height: 540,
    backgroundColor: "#ffffff",
    plugins: () => [],
  },
);

const emit = defineEmits<{
  /** 编辑器就绪，父级可以在这里做订阅和初始化 */
  ready: [editor: Editor];
  /** 编辑器已销毁 */
  disposed: [];
}>();

/**
 * 自己再包一层宿主 div 是必须的。
 *
 * fabric 的 `Canvas` 会把传进来的 `<canvas>` **包进它自己建的 `.canvas-container`**，
 * 变成「容器 div > lower canvas + upper canvas」。如果宿主组件的根节点就是这个 canvas，
 * 组件卸载时 Vue 只会摘掉 canvas 本身，那个容器 div 会留在页面上 ——
 * 路由来回切几次就攒下一堆空 div。套一层自己的 div 当根节点，卸载时整棵子树一起走，
 * 所以这里连 ref 都不需要。
 */
const canvasRef = ref<HTMLCanvasElement | null>(null);
const editor = shallowRef<Editor | null>(null);

onMounted(() => {
  const element = canvasRef.value;
  if (!element) return;

  const instance = new Editor(element, {
    backgroundColor: props.backgroundColor,
    preserveObjectStacking: true,
  });

  for (const entry of props.plugins) {
    if (Array.isArray(entry)) instance.use(entry[0], entry[1] ?? {});
    else instance.use(entry);
  }

  editor.value = instance;
  emit("ready", instance);
});

onBeforeUnmount(() => {
  editor.value?.dispose();
  editor.value = null;
  emit("disposed");
});

defineExpose({ editor });
</script>

<template>
  <div class="editor-host">
    <canvas ref="canvasRef" :width="props.width" :height="props.height" class="editor-canvas" />
  </div>
</template>

<style scoped>
.editor-host {
  display: flex;
  justify-content: center;
}

/*
 * 这里**故意不写** `max-width: 100%`。
 *
 * fabric 初始化时会把 `width` / `height` 写成 lower canvas、upper canvas
 * 以及它自建的 `.canvas-container` 三处的行内样式。容器宽度被写死之后，
 * 内层只加 `max-width` 只会把画面横向压扁（行内的高度还在），
 * 变成非等比缩放 —— 看起来是渲染坏了，其实只是 CSS 打架。
 * 所以画布保持 1:1，窄屏由外层舞台横向滚动，坐标也永远和面板上的数字对得上。
 */
.editor-canvas {
  display: block;
  border-radius: 8px;
  box-shadow:
    0 1px 2px rgb(15 23 42 / 8%),
    0 12px 32px -12px rgb(15 23 42 / 24%);
  touch-action: none;
}
</style>
