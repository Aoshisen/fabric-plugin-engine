<script setup lang="ts">
import { computed } from "vue";
import { NButton } from "naive-ui";
import { SHAPE_CATEGORIES } from "../shapeCatalog";
import type { ShapePreset } from "../shapeCatalog";

/**
 * 形状库面板。
 *
 * 这一层**不包含任何图形知识**：有哪些图形、怎么分组，全从 props 里来
 * （上游从 `shapeActions.availableShapes()` 取）。所以想加图形只改
 * `../shapeCatalog.ts`，登记了类型它自己就冒出来，没登记的不会显示。
 */
const props = defineProps<{ shapes: ShapePreset[] }>();

const emit = defineEmits<{ add: [type: string] }>();

const groups = computed(() =>
  SHAPE_CATEGORIES.map((category) => ({
    category,
    items: props.shapes.filter((shape) => shape.category === category),
  })).filter((group) => group.items.length > 0),
);
</script>

<template>
  <aside class="palette">
    <header class="palette__head">
      <h2 class="palette__title">形状库</h2>
      <p class="palette__tip">点一下加到画布，自动选中</p>
    </header>

    <div v-for="group in groups" :key="group.category" class="palette__group">
      <h3 class="palette__group-title">{{ group.category }}</h3>
      <NButton
        v-for="shape in group.items"
        :key="shape.type"
        class="palette__item"
        block
        secondary
        size="small"
        :title="`${shape.type} —— ${shape.hint}`"
        @click="emit('add', shape.type)"
      >
        {{ shape.label }}
      </NButton>
    </div>
  </aside>
</template>

<style scoped>
.palette {
  position: sticky;
  top: 78px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--surface);
}

.palette__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
}

.palette__tip {
  margin: 5px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
}

.palette__group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.palette__group-title {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.palette__item {
  justify-content: flex-start;
}
</style>
