<script setup lang="ts">
import { computed, ref } from "vue";
import { NEmpty, NTag } from "naive-ui";
import { storeToRefs } from "pinia";
import { useEditorStore } from "../../../stores";
import { describeObjectProperties } from "../propertySchema";
import { groupProperties } from "../types";
import PropertyField from "./PropertyField.vue";

/**
 * 属性面板。
 *
 * 字段列表**完全由快照推导**：
 *
 * ```
 * object.toObject() ──▶ describeObjectProperties() ──▶ 分组的表单字段
 * ```
 *
 * 所以面板上一定有、且只有导出 JSON 里会出现的那些字段 —— 不多不少。
 * 想确认这一点，展开面板底部的「选中对象的 JSON」对着看就行了。
 *
 * 组件本身不写状态：改动往上抛 `change`，由页面转成属性补丁交给画布。
 */
const emit = defineEmits<{ change: [key: string, value: unknown] }>();

const store = useEditorStore();
const { selectedValues, selectedType, selectionMode, selected } = storeToRefs(store);

const sections = computed(() => {
  const values = selectedValues.value;
  return values ? groupProperties(describeObjectProperties(values)) : [];
});

const fieldCount = computed(() =>
  sections.value.reduce((total, section) => total + section.items.length, 0),
);

const editableCount = computed(() =>
  sections.value.reduce(
    (total, section) => total + section.items.filter((item) => item.editable).length,
    0,
  ),
);

/** 字段清单本身就是一份 JSON，顺手展示出来做对照 */
const showJson = ref(false);
const jsonText = computed(() =>
  selectedValues.value ? JSON.stringify(selectedValues.value, null, 2) : "",
);
</script>

<template>
  <aside class="inspector">
    <header class="inspector__head">
      <h2 class="inspector__title">属性</h2>
      <NTag v-if="selectedType" size="small" :bordered="false" type="info">{{ selectedType }}</NTag>
    </header>

    <template v-if="sections.length">
      <p class="inspector__meta">
        共 {{ fieldCount }} 个可序列化字段，其中 {{ editableCount }} 个可编辑
      </p>

      <section v-for="section in sections" :key="section.group" class="inspector__section">
        <h3 class="inspector__section-title">{{ section.label }}</h3>
        <PropertyField
          v-for="field in section.items"
          :key="field.key"
          :descriptor="field"
          @change="(key, value) => emit('change', key, value)"
        />
      </section>

      <section class="inspector__section">
        <button type="button" class="inspector__toggle" @click="showJson = !showJson">
          {{ showJson ? "收起" : "展开" }}选中对象的 JSON
        </button>
        <pre v-if="showJson" class="inspector__json">{{ jsonText }}</pre>
      </section>
    </template>

    <div v-else class="inspector__empty">
      <NEmpty
        size="small"
        :description="
          selectionMode === 'multi' ? `选中了 ${selected.length} 个对象` : '还没有选中对象'
        "
      />
      <p class="inspector__empty-text">
        {{
          selectionMode === "multi"
            ? "多选时不存在「一个对象的属性」，请只选一个再改。"
            : "从左侧形状库加一个图形，或在画布上点一下已有对象。"
        }}
      </p>
    </div>
  </aside>
</template>

<style scoped>
.inspector {
  position: sticky;
  top: 78px;
  max-height: calc(100vh - 98px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--surface);
}

.inspector__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.inspector__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
}

.inspector__meta {
  margin: -6px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

.inspector__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--divider, #e5e9f0);
}

.inspector__section:first-of-type {
  border-top: none;
  padding-top: 0;
}

.inspector__section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.inspector__toggle {
  align-self: flex-start;
  padding: 0;
  font: inherit;
  font-size: 11px;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
}

.inspector__json {
  margin: 0;
  padding: 10px;
  max-height: 320px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-strong);
  border-radius: 7px;
  background: var(--stage);
}

.inspector__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 26px 8px 18px;
}

.inspector__empty-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  text-align: center;
  color: var(--text-muted);
}
</style>
