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
  <canvas ref="canvasRef" :width="props.width" :height="props.height" class="editor-canvas" />
</template>

<style scoped>
.editor-canvas {
  display: block;
  max-width: 100%;
  border-radius: 8px;
  box-shadow:
    0 1px 2px rgb(15 23 42 / 8%),
    0 12px 32px -12px rgb(15 23 42 / 24%);
  touch-action: none;
}
</style>
