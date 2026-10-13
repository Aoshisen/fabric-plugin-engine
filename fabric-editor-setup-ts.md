# Fabric.js 编辑器核心：对象注册 + 插件系统 实施清单（TypeScript 版）

> 参考 vue-fabric-editor 的插件模式，用 mitt 替换原生 EventEmitter，
> 统一对象注册与插件注册入口，全 TypeScript 实现。

---

## 0. 前置依赖

```bash
pnpm install fabric mitt
```

目录结构建议：

```
src/
├── core/
│   ├── Editor.ts              # 核心类：组合 mitt，管理插件和对象注册
│   ├── ObjectRegistry.ts      # 对象注册表：优先查自定义，回退查 fabric 内置
│   └── types.ts               # 核心类型定义（事件、插件协议）
├── plugins/
│   ├── MyCustomObjectPlugin.ts
│   └── OtherPlugin.ts
└── types/
    └── fabric.d.ts            # Fabric 模块增强（自定义对象类型映射）
```

---

## 1. 核心类型定义

文件：`core/types.ts`

```typescript
import type { Canvas, FabricObject } from "fabric";
import type { Emitter } from "mitt";

// ---- 事件类型映射 ----
export type CoreEvents = {
  // 生命周期
  "plugin:installed": { name: string };
  // 画布对象
  "object:added": FabricObject;
  "object:removed": FabricObject;
  // 选择状态
  "selection:changed": {
    mode: "one" | "multi" | "empty";
    targets: FabricObject[];
  };
  // 插件自定义事件（插件通过声明扩展此类型）
  "myPlugin:change": { payload: unknown };
};

// ---- 自定义对象类型映射（手动维护，用于类型推导） ----
export interface ObjectTypeMap {
  // 示例：
  // MyCustomObject: MyCustomObject;
}

// ---- 插件协议 ----
export interface IPlugin {
  init(): void;
  destroy(): void;
  hookImportBefore?(jsonData: string): string;
  hookImportAfter?(): void;
  [key: string]: unknown;
}

export interface PluginConstructor {
  new (canvas: Canvas, editor: unknown, options: Record<string, unknown>): IPlugin;
  pluginName: string;
  apis?: string[];
  events?: string[];
  options?: Record<string, unknown>;
}

// ---- 导出 mitt 的 Emitter 类型，方便下游使用 ----
export type CoreEmitter = Emitter<CoreEvents>;
```

---

## 2. 实现 ObjectRegistry

文件：`core/ObjectRegistry.ts`

```typescript
import { classRegistry, FabricObject } from "fabric";
import type { ObjectTypeMap } from "./types";

type Ctor<T = FabricObject> = new (options?: Record<string, unknown>) => T;

export class ObjectRegistry {
  private _customTypes = new Map<string, Ctor>();

  // 注册自定义对象（同时同步到 fabric 的 classRegistry 以支持反序列化）
  registerType<K extends keyof ObjectTypeMap & string>(
    typeName: K,
    ClassConstructor: Ctor<ObjectTypeMap[K]>,
  ): void {
    this._customTypes.set(typeName, ClassConstructor as Ctor);
    classRegistry.setClass(ClassConstructor as unknown as typeof FabricObject, typeName);
  }

  // 统一创建入口：优先查自定义，回退查 fabric 内置
  create<K extends keyof ObjectTypeMap & string>(
    typeName: K,
    options?: Record<string, unknown>,
  ): ObjectTypeMap[K];
  create(typeName: string, options?: Record<string, unknown>): FabricObject;
  create(typeName: string, options: Record<string, unknown> = {}): FabricObject {
    const Ctor =
      this._customTypes.get(typeName) || (classRegistry.getClass(typeName) as Ctor | undefined);

    if (!Ctor) throw new Error(`Unknown object type: ${typeName}`);
    return new Ctor(options);
  }

  has(typeName: string): boolean {
    return this._customTypes.has(typeName) || classRegistry.has(typeName);
  }
}
```

**要点**

- 重载签名让 `create("MyCustomObject")` 在有 `ObjectTypeMap` 声明时返回精确类型。
- Fabric 的内置类在模块加载时已自动注册，`create("Rect")` 天然可用。
- 自定义类必须显式调用 `classRegistry.setClass(Ctor, typeName)`。

---

## 3. 实现 Editor 核心类（组合 mitt）

文件：`core/Editor.ts`

```typescript
import mitt from "mitt";
import { Canvas } from "fabric";
import type { FabricObject } from "fabric";
import { ObjectRegistry } from "./ObjectRegistry";
import type { CoreEvents, PluginConstructor, IPlugin } from "./types";

type EventHandler<K extends keyof CoreEvents> = (payload: CoreEvents[K]) => void;

export class Editor {
  public canvas: Canvas;
  public registry: ObjectRegistry;

  private emitter = mitt<CoreEvents>();
  private plugins = new Map<string, IPlugin>();
  private _apis: Record<string, (...args: unknown[]) => unknown> = {};

  constructor(canvasEl: HTMLCanvasElement | string, options: Record<string, unknown> = {}) {
    this.canvas = new Canvas(canvasEl, options);
    this.registry = new ObjectRegistry();

    // 把 canvas 的选择事件桥接到 mitt
    this.canvas.on("selection:created", (e) => this._emitSelection(e));
    this.canvas.on("selection:updated", (e) => this._emitSelection(e));
    this.canvas.on("selection:cleared", () => {
      this.emitter.emit("selection:changed", { mode: "empty", targets: [] });
    });
  }

  private _emitSelection(e: { selected?: FabricObject[] }): void {
    const targets = e.selected ?? [];
    const mode = targets.length === 1 ? "one" : "multi";
    this.emitter.emit("selection:changed", { mode, targets });
  }

  // ---- 事件代理 ----
  on<K extends keyof CoreEvents>(event: K, handler: EventHandler<K>): this {
    this.emitter.on(event, handler as never);
    return this;
  }

  off<K extends keyof CoreEvents>(event: K, handler: EventHandler<K>): this {
    this.emitter.off(event, handler as never);
    return this;
  }

  emit<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  // ---- 插件注册 ----
  use(PluginClass: PluginConstructor): this {
    const pluginName = PluginClass.pluginName;
    if (!pluginName) throw new Error("Plugin must have a static pluginName");

    if (this.plugins.has(pluginName)) {
      console.warn(`Plugin "${pluginName}" already installed`);
      return this;
    }

    const instance = new PluginClass(this.canvas, this, PluginClass.options ?? {});
    this.plugins.set(pluginName, instance);

    // API 代理：把插件上声明的 apis 方法挂到 Editor 上
    (PluginClass.apis ?? []).forEach((apiName) => {
      const fn = instance[apiName];
      if (typeof fn === "function") {
        const bound = (fn as (...args: unknown[]) => unknown).bind(instance);
        this._apis[apiName] = bound;
        (this as Record<string, unknown>)[apiName] = bound;
      }
    });

    this.emitter.emit("plugin:installed", { name: pluginName });
    return this;
  }

  getPlugin<T extends IPlugin = IPlugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined;
  }
}
```

**关键设计**

- 组合而非继承：mitt 返回函数对象，继承类型处理别扭；组合更干净。
- 事件代理用泛型约束，`editor.on("object:added", (obj) => ...)` 中 `obj` 自动推导为 `FabricObject`。
- API 代理与 vue-fabric-editor 的 `static apis` 机制一致。

---

## 4. 插件模板

文件：`plugins/MyCustomObjectPlugin.ts`

```typescript
import { FabricObject, classRegistry } from "fabric";
import type { Canvas } from "fabric";
import type { Editor } from "../core/Editor";
import type { IPlugin } from "../core/types";

// ---- 自定义对象类 ----
export class MyCustomObject extends FabricObject {
  static override type = "MyCustomObject";

  customProp: string = "";

  static override customProperties = ["customProp"];

  override toObject(propertiesToInclude: string[] = []): Record<string, unknown> {
    return super.toObject([...propertiesToInclude, ...MyCustomObject.customProperties]);
  }
}

// ---- 插件类 ----
export default class MyCustomObjectPlugin implements IPlugin {
  static pluginName = "MyCustomObjectPlugin";
  static events = ["myPlugin:change"];
  static apis = ["createMyObject", "updateMyObject"];

  private canvas: Canvas;
  private editor: Editor;
  private options: Record<string, unknown>;

  constructor(canvas: Canvas, editor: Editor, options: Record<string, unknown>) {
    this.canvas = canvas;
    this.editor = editor;
    this.options = options;
    this.init();
  }

  init(): void {
    classRegistry.setClass(MyCustomObject, "MyCustomObject");
    this.editor.registry.registerType("MyCustomObject", MyCustomObject);

    this.canvas.on("object:added", (e) => {
      if (e.target) this.editor.emit("object:added", e.target);
    });
  }

  // 对外 API：通过 editor.createMyObject(...) 调用
  createMyObject(options: Record<string, unknown> = {}): MyCustomObject {
    const obj = this.editor.registry.create("MyCustomObject", options);
    this.canvas.add(obj);
    this.canvas.requestRenderAll();
    return obj;
  }

  updateMyObject(obj: MyCustomObject, changes: Partial<MyCustomObject>): void {
    Object.assign(obj, changes);
    obj.setCoords();
    this.canvas.requestRenderAll();
    this.editor.emit("myPlugin:change", { payload: obj });
  }

  hookImportBefore(jsonData: string): string {
    return jsonData;
  }

  hookImportAfter(): void {
    // 加载后恢复状态
  }

  destroy(): void {
    this.canvas.off("object:added");
  }
}
```

**注意**

- `static override type` 和 `customProperties` 用 override 关键字，符合 TS 严格模式。
- `createMyObject` 返回精确类型 `MyCustomObject`，调用方有完整提示。

---

## 5. 模块增强：让 registry.create 有类型提示

文件：`types/fabric.d.ts`

```typescript
import type { MyCustomObject } from "../plugins/MyCustomObjectPlugin";

declare module "../core/types" {
  interface ObjectTypeMap {
    MyCustomObject: MyCustomObject;
  }
}

// 如果内置对象也想有类型提示，可以继续补充：
// import type { Rect, Circle } from "fabric";
// declare module "../core/types" {
//   interface ObjectTypeMap {
//     Rect: Rect;
//     Circle: Circle;
//   }
// }
```

**作用**：有了这份声明，`editor.registry.create("MyCustomObject")` 会返回 `MyCustomObject` 类型，IDE 有完整提示。

---

## 6. 项目入口启动

文件：`main.ts`

```typescript
import { Editor } from "./core/Editor";
import MyCustomObjectPlugin from "./plugins/MyCustomObjectPlugin";
import type { Rect } from "fabric";

const canvasEl = document.getElementById("canvas") as HTMLCanvasElement;
const editor = new Editor(canvasEl);

// 按需注册插件（链式风格）
editor.use(MyCustomObjectPlugin);

// 统一通过 registry.create 实例化对象
// 内置 Rect：类型为 FabricObject（除非在 ObjectTypeMap 里声明了 Rect）
const rect = editor.registry.create("Rect", {
  left: 10,
  top: 10,
  width: 50,
  height: 50,
  fill: "red",
});

// 自定义对象：有精确类型提示
const myObj = editor.registry.create("MyCustomObject", {
  left: 100,
  top: 100,
});

editor.canvas.add(rect, myObj);
editor.canvas.requestRenderAll();

// 事件监听：payload 自动推导
editor.on("object:added", (obj) => {
  console.log("added:", obj);
});

// 插件 API：挂载后可调用
// const custom = editor.createMyObject({ left: 200, top: 200 });
```

---

## 7. 可执行步骤清单

- [ ] 第一步：`npm install fabric mitt`
- [ ] 第二步：创建 `core/types.ts`，声明 `CoreEvents`、`ObjectTypeMap`、`IPlugin`、`PluginConstructor`
- [ ] 第三步：实现 `core/ObjectRegistry.ts`，带重载签名
- [ ] 第四步：实现 `core/Editor.ts`，组合 mitt，泛型事件代理
- [ ] 第五步：实现第一个插件 `plugins/MyCustomObjectPlugin.ts`
- [ ] 第六步：创建 `types/fabric.d.ts` 做模块增强
- [ ] 第七步：入口 `main.ts` 中 `new Editor(...)`，链式 `.use(Plugin)`
- [ ] 第八步：验证内置对象 `registry.create("Rect", ...)`
- [ ] 第九步：验证自定义对象 `registry.create("MyCustomObject", ...)` 有类型提示
- [ ] 第十步：验证插件 API `editor.createMyObject(...)` 有类型提示

---

## 8. TypeScript 专属注意事项

1. **strict 模式下的 override**：Fabric.js v6 的类属性声明需要用 `static override type`，否则 TS 报错。
2. **重载签名**：`ObjectRegistry.create` 用两个重载签名，先声明泛型版，再声明宽泛版，最后写实现签名。
3. **mitt 的类型推导**：`Emitter<CoreEvents>` 的 `on/off/emit` 会自动约束事件名与 payload 类型。
4. **插件 API 代理的类型**：`editor.createMyObject` 在 TS 里默认不可见。要获得提示，可以写一个接口扩展或使用类型断言。更优雅的方式是为 Editor 声明一个泛型参数，但会增加复杂度，按需选择。
5. **模块增强的路径**：`declare module "../core/types"` 的路径必须与实际相对路径一致，否则增强不生效。
6. **Fabric 内置对象的类型**：`classRegistry.getClass()` 返回 `typeof FabricObject`，内置类（Rect、Circle）不会被自动推导。如需精确类型，在 `ObjectTypeMap` 里手动声明。

---

## 9. 加载策略结论

- **自定义对象**：全量注册，换取反序列化的绝对可靠。
- **内置对象**：天然已注册，`registry.create("Rect")` 直接可用。
- **动态加载**：仅在自定义对象依赖重量级库时才考虑按需加载。
- **反序列化**：`loadFromJSON` 前必须确保 JSON 中所有 `type` 已注册。

---

## 10. 与 vue-fabric-editor 的差异

| 维度           | vue-fabric-editor             | 本项目                |
| -------------- | ----------------------------- | --------------------- |
| 事件总线       | 继承 Node EventEmitter        | 组合 mitt             |
| 体积           | ~2KB                          | ~200B                 |
| 浏览器兼容     | 需 polyfill                   | 原生兼容              |
| 类型推导       | 弱                            | 强（泛型 + 模块增强） |
| 插件协议       | static pluginName/apis/events | 完全沿用              |
| 生命周期 hooks | hookImportBefore/After        | 完全沿用              |
