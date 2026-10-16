<script setup lang="ts">
import { computed } from "vue";
import { NColorPicker, NInput, NInputNumber, NSelect, NSlider, NSwitch } from "naive-ui";
import type { SelectOption } from "naive-ui";
import type { PropertyDescriptor } from "../../playground/types";

/**
 * 单个属性字段。
 *
 * 一个 `v-if` 链就够，不为每种控件拆一个文件：控件之间的差异只有「绑哪个 prop、
 * 出什么类型的事件」，拆开之后每个文件都要把同样的 props / emit 声明重写一遍，
 * 反而更难看清全貌。
 *
 * 所有控件的值都是**受控**的：改一下就往上抛 `change`，由页面转成属性补丁写回画布，
 * 画布再广播新的快照流回来。单向数据流，面板不会和对象状态打架。
 */
const props = defineProps<{ descriptor: PropertyDescriptor }>();

const emit = defineEmits<{ change: [key: string, value: unknown] }>();

/** 颜色选择器里的常用色，省得每次都手输色值 */
const SWATCHES = [
  "#1f2937",
  "#64748b",
  "#ffffff",
  "#4f7cff",
  "#12b886",
  "#0ca678",
  "#f08c00",
  "#e8590c",
  "#fcc419",
  "#e64980",
  "#5f3dc4",
  "#ff9f43",
];

const numberValue = computed(() => props.descriptor.value as number);
const textValue = computed(() => props.descriptor.value as string);
const boolValue = computed(() => props.descriptor.value as boolean);
const colorValue = computed(() => (props.descriptor.value as string | null) ?? null);

/** `strokeDashArray` 在 UI 上是一段逗号分隔的文本，进出各转一次 */
const numberListText = computed(() =>
  (props.descriptor.value as number[]).map((item) => String(item)).join(", "),
);

/**
 * 候选项就是朴素的 `{ label, value }`，断言一下是因为 Naive UI 的
 * `SelectMixedOption` 是个联合类型，还包含分组 / 分隔线那些带 `type` 的形态。
 */
const selectOptions = computed(() => (props.descriptor.options ?? []) as SelectOption[]);

function emitChange(value: unknown): void {
  emit("change", props.descriptor.key, value);
}

/** 数字框被清空时会给出 null —— 别把 null 写到画布上，那会让对象直接算不出来 */
function handleNumber(value: number | null): void {
  if (typeof value === "number" && Number.isFinite(value)) emitChange(value);
}

/** 颜色留空是有意义的（`fill: null` 就是「不填充」），所以 null 照实传下去 */
function handleColor(value: string | null): void {
  emitChange(value ?? null);
}

function handleNumberList(text: string): void {
  const parsed = text
    .split(",")
    .map((chunk) => Number.parseFloat(chunk.trim()))
    .filter((item) => Number.isFinite(item));
  emitChange(parsed);
}
</script>

<template>
  <div class="pfield" :class="{ 'is-readonly': !descriptor.editable }">
    <div class="pfield__head">
      <span class="pfield__label">{{ descriptor.label }}</span>
      <code class="pfield__key">{{ descriptor.key }}</code>
    </div>

    <div
      v-if="descriptor.control === 'readonly'"
      class="pfield__readonly"
      :title="descriptor.display"
    >
      {{ descriptor.display === "" ? "（空）" : descriptor.display }}
    </div>

    <NInputNumber
      v-else-if="descriptor.control === 'number'"
      class="pfield__control"
      size="small"
      :value="numberValue"
      :min="descriptor.min"
      :max="descriptor.max"
      :step="descriptor.step ?? 1"
      :show-button="false"
      @update:value="handleNumber"
    >
      <template v-if="descriptor.unit" #suffix>{{ descriptor.unit }}</template>
    </NInputNumber>

    <NSlider
      v-else-if="descriptor.control === 'slider'"
      :value="numberValue"
      :min="descriptor.min ?? 0"
      :max="descriptor.max ?? 1"
      :step="descriptor.step ?? 0.01"
      @update:value="emitChange"
    />

    <NColorPicker
      v-else-if="descriptor.control === 'color'"
      class="pfield__control"
      size="small"
      :value="colorValue"
      :show-alpha="false"
      :modes="['hex', 'rgb']"
      :swatches="SWATCHES"
      @update:value="handleColor"
    />

    <NSwitch
      v-else-if="descriptor.control === 'boolean'"
      size="small"
      :value="boolValue"
      @update:value="emitChange"
    />

    <NSelect
      v-else-if="descriptor.control === 'select'"
      class="pfield__control"
      size="small"
      :value="textValue"
      :options="selectOptions"
      :filterable="descriptor.filterable"
      :tag="descriptor.tag"
      @update:value="emitChange"
    />

    <NInput
      v-else-if="descriptor.control === 'longText'"
      class="pfield__control"
      size="small"
      type="textarea"
      :value="textValue"
      :autosize="{ minRows: 2, maxRows: 5 }"
      @update:value="emitChange"
    />

    <NInput
      v-else-if="descriptor.control === 'numberList'"
      class="pfield__control"
      size="small"
      :value="numberListText"
      placeholder="留空表示实线"
      @update:value="handleNumberList"
    />

    <NInput
      v-else
      class="pfield__control"
      size="small"
      :value="textValue"
      @update:value="emitChange"
    />

    <p v-if="descriptor.hint" class="pfield__hint">{{ descriptor.hint }}</p>
  </div>
</template>

<style scoped>
.pfield {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pfield__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.pfield__label {
  font-size: 12px;
  color: var(--text-strong);
}

.pfield__key {
  font-size: 10px;
  color: #94a3b8;
}

.pfield.is-readonly .pfield__label {
  color: var(--text-muted);
}

.pfield__readonly {
  padding: 4px 8px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-muted);
  word-break: break-all;
  border: 1px dashed var(--border);
  border-radius: 6px;
  background: var(--surface-strong);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pfield__control {
  width: 100%;
}

.pfield__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
}
</style>
