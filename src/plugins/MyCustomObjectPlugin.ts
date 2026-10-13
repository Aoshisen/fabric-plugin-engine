import { BasePlugin } from "./BasePlugin";
import { registerCustomObjects } from "../objects";
import { MyCustomObject } from "../objects";
import type { MyCustomObjectOptions, MyCustomObjectProps } from "../objects";
import type { PluginOptions } from "../core/types";

/* -------------------------------------------------------------------------- */
/* 插件                                                                        */
/* -------------------------------------------------------------------------- */

/** 插件配置 */
export interface MyCustomObjectPluginOptions extends PluginOptions {
  /** 创建对象时 `customProp` 的默认值 */
  defaultCustomProp?: string;
}

/**
 * 示例插件：演示「自定义对象登记 + 插件 API 代理 + 导入导出钩子」三件事。
 *
 * 注意自定义对象本身**不在这个文件里**了，统一放在 `src/objects/` 下。
 * 插件只负责「把它登记进当前 Editor」以及暴露业务 API。
 *
 * - `static apis` 里声明的方法会被代理到 Editor 上，业务侧直接 `editor.createMyObject()`
 * - `static events` 只是声明本插件会派发的事件，方便调试时排查
 * - 事件与 API 的类型，靠文件底部两个 `declare module` 补全
 */
export default class MyCustomObjectPlugin extends BasePlugin {
  static pluginName = "MyCustomObjectPlugin";
  static events = ["myPlugin:change"];
  static apis = ["createMyObject", "updateMyObject"];
  static options: MyCustomObjectPluginOptions = { defaultCustomProp: "hello fabric" };

  private get pluginOptions(): MyCustomObjectPluginOptions {
    return this.options as MyCustomObjectPluginOptions;
  }

  init(): void {
    // 登记本项目所有自定义对象：内部会同步写进 fabric 的 classRegistry，
    // 这样 loadFromJSON 反序列化时才找得到类
    registerCustomObjects(this.editor.registry);
  }

  /* ---------------------------- 对外的插件 API ---------------------------- */

  /** 创建一个 MyCustomObject 并加入画布（可通过 editor.createMyObject 调用） */
  createMyObject(options: MyCustomObjectOptions = {}): MyCustomObject {
    const object = this.editor.registry.create("MyCustomObject", {
      customProp: this.pluginOptions.defaultCustomProp ?? "",
      ...options,
    });

    this.canvas.add(object);
    this.canvas.requestRenderAll();
    return object;
  }

  /** 批量更新属性，并广播 `myPlugin:change` */
  updateMyObject(target: MyCustomObject, changes: MyCustomObjectProps): MyCustomObject {
    target.set(changes);
    target.setCoords();
    this.canvas.requestRenderAll();

    this.editor.emit("myPlugin:change", { payload: target });
    return target;
  }

  /* ----------------------------- 导入导出钩子 ----------------------------- */

  /** 导入前：把历史版本里的 `label` 字段迁移成 `customProp` */
  override hookImportBefore(json: string): string {
    const data = JSON.parse(json) as { objects?: Record<string, unknown>[] };

    for (const object of data.objects ?? []) {
      if (object.type === MyCustomObject.type && typeof object.label === "string") {
        object.customProp = object.label;
        delete object.label;
      }
    }

    return JSON.stringify(data);
  }

  /** 导入后：按插件配置给缺省的对象补上默认值 */
  override hookImportAfter(): void {
    const fallback = this.pluginOptions.defaultCustomProp ?? "";

    for (const object of this.canvas.getObjects()) {
      if (object instanceof MyCustomObject && !object.customProp) {
        object.customProp = fallback;
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 类型增强：让核心层认识这个插件                                              */
/* -------------------------------------------------------------------------- */

declare module "../core/types" {
  interface CoreEvents {
    /** MyCustomObjectPlugin 派发的自定义事件 */
    "myPlugin:change": { payload: MyCustomObject };
  }
}

declare module "../core/Editor" {
  interface Editor {
    /** 创建一个 MyCustomObject 并加入画布 */
    createMyObject(options?: MyCustomObjectOptions): MyCustomObject;
    /** 批量更新 MyCustomObject 的属性 */
    updateMyObject(target: MyCustomObject, changes: MyCustomObjectProps): MyCustomObject;
  }
}
