import type { FabricObject } from "fabric";
import type { Editor } from "../core";
import { SHAPE_PRESETS, findShapePreset } from "./shapeCatalog";
import type { ShapePreset } from "./shapeCatalog";

/**
 * 画布上的图形操作。
 *
 * ## 为什么是函数，不是插件
 *
 * 这几件事原来住在 `ShapePlugin` 里。但那个插件**没有任何一个字段**：
 * 不持有状态、不订阅事件、`init()` 里只调了一次类型登记。五个方法全都是
 * fabric 已有能力的转发（`canvas.add` / `canvas.remove` / `canvas.bringObjectToFront`）。
 *
 * 那就不该穿插件的衣服 —— 判据是：**插件只在它拥有状态或事件接线时才值得存在，
 * 无状态的命令包装本质上就是一个函数。** 对照 `PropertyPlugin`：它持有
 * `disposers` / `transformPending`、订阅 5 个事件并对外广播 `properties:changed`，
 * 那些是基础设施，所以它继续留在插件层。
 *
 * 这里同时少了一层间接：调用方 `import { addShape } from "./shapeActions"`，
 * 拿到的就是函数本身，不用先记住「哪个能力被代理到了 editor 的哪个方法上」。
 *
 * ## 用法
 *
 * ```ts
 * import { registerCustomObjects } from "../objects";
 * import { addShape, removeSelected, arrangeSelected } from "../playground/shapeActions";
 *
 * // 编辑器就绪时登记一次，否则 registry.create() 找不到自定义类型
 * registerCustomObjects(editor.registry);
 *
 * addShape(editor, "Rect", { fill: "#f00" });
 * arrangeSelected(editor, "toFront");
 * ```
 */

/** 层级调整的四个动作 */
export type ArrangeAction = "toFront" | "forward" | "backward" | "toBack";

/**
 * 连续添加时的级联落点。
 *
 * 落点错开是 playground 的展示需要（连点几下别完全叠在一起），不是编辑器领域概念，
 * 所以不对外暴露配置项，需要微调直接改这三个常量；单次落点要特殊处理，
 * 给 `addShape()` 传 `left` / `top` 覆盖即可。
 */
const CASCADE_STEP = 26;
const CASCADE_LIMIT = 6;
const CASCADE_ORIGIN = { left: 170, top: 130 };

/** 按当前对象数算一个级联落点，避免连续添加时完全叠在一起 */
function nextPosition(editor: Editor): { left: number; top: number } {
  const step = editor.canvas.getObjects().length % CASCADE_LIMIT;
  return {
    left: CASCADE_ORIGIN.left + step * CASCADE_STEP,
    top: CASCADE_ORIGIN.top + step * CASCADE_STEP,
  };
}

/**
 * 当前**真正可用**的图形清单，UI 直接渲染它。
 *
 * 过滤掉注册表里没有的类型：目录里可能写着某个类型，但对应的类没被登记
 * （比如 `registerCustomObjects()` 的登记表里漏了），这时候点了也造不出来 ——
 * 与其报一个「未知类型」的错，不如一开始就不显示。
 */
export function availableShapes(editor: Editor): ShapePreset[] {
  return SHAPE_PRESETS.filter((preset) => editor.registry.has(preset.type));
}

/**
 * 按类型创建一个图形：落在级联位置、自动选中、立刻重绘。
 *
 * 自动选中是故意的 —— playground 的用法就是「加一个 → 马上调它的属性」，少一次点击。
 *
 * @returns 创建好的对象；目录里没有该类型、或类型未登记时返回 `null`
 *          （只在控制台留警告，不打断 UI）
 */
export function addShape(
  editor: Editor,
  type: string,
  overrides: Record<string, unknown> = {},
): FabricObject | null {
  const preset = findShapePreset(type);
  if (!preset) {
    console.warn(`[shapeActions] 形状目录里没有 "${type}"`);
    return null;
  }
  if (!editor.registry.has(type)) {
    console.warn(
      `[shapeActions] 类型 "${type}" 还没登记，先调 registerCustomObjects(editor.registry)`,
    );
    return null;
  }

  const object = editor.registry.create(type, {
    ...preset.defaults,
    ...nextPosition(editor),
    ...overrides,
  });

  editor.canvas.add(object);
  editor.canvas.setActiveObject(object);
  editor.canvas.requestRenderAll();
  return object;
}

/** 删除当前选中的对象，返回删掉了几个 */
export function removeSelected(editor: Editor): number {
  const targets = editor.canvas.getActiveObjects();
  if (targets.length === 0) return 0;

  // 先取消选中再删：否则 fabric 手里还攥着一批已经不存在的对象的引用
  editor.canvas.discardActiveObject();
  editor.canvas.remove(...targets);
  editor.canvas.requestRenderAll();
  return targets.length;
}

/** 清空画布上的所有对象，返回清掉了几个 */
export function clearCanvas(editor: Editor): number {
  const objects = editor.canvas.getObjects();
  if (objects.length === 0) return 0;

  editor.canvas.discardActiveObject();
  editor.canvas.remove(...objects);
  editor.canvas.requestRenderAll();
  return objects.length;
}

/**
 * 调整选中对象的图层顺序。
 *
 * 只处理**第一个**选中项：多选状态下层级关系本身就说不清（fabric 的
 * activeSelection 是一个临时容器），与其猜，不如明确不支持。
 */
export function arrangeSelected(editor: Editor, action: ArrangeAction): boolean {
  const [target] = editor.canvas.getActiveObjects();
  if (!target) return false;

  const moved = {
    toFront: () => editor.canvas.bringObjectToFront(target),
    forward: () => editor.canvas.bringObjectForward(target),
    backward: () => editor.canvas.sendObjectBackwards(target),
    toBack: () => editor.canvas.sendObjectToBack(target),
  }[action]();

  if (moved) editor.canvas.requestRenderAll();
  return moved;
}
