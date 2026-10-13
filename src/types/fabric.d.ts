/**
 * fabric 内置对象的类型增强。
 *
 * `ObjectRegistry.create()` 的重载靠 `ObjectTypeMap` 决定返回类型：
 * 声明过的类型名返回精确类型（`registry.create("Rect") as Rect`），
 * 没声明的回退成 `FabricObject`。
 *
 * 自定义对象请在**对象自己的文件里**做增强（`src/objects/*.ts`），就近维护，例如：
 * `src/objects/MyCustomObject.ts`
 *
 * ```ts
 * declare module "../core/types" {
 *   interface ObjectTypeMap {
 *     MyCustomObject: MyCustomObject;
 *   }
 * }
 * ```
 *
 * 这里只负责 fabric 内置对象；自定义对象一律不写在这个文件里。
 */
import type {
  Circle,
  Ellipse,
  Group,
  IText,
  Image,
  Line,
  Path,
  Polygon,
  Polyline,
  Rect,
  Text,
  Textbox,
  Triangle,
} from "fabric";

declare module "../core/types" {
  interface ObjectTypeMap {
    Rect: Rect;
    Circle: Circle;
    Ellipse: Ellipse;
    Triangle: Triangle;
    Line: Line;
    Group: Group;
    Text: Text;
    IText: IText;
    Textbox: Textbox;
    Image: Image;
    Path: Path;
    Polygon: Polygon;
    Polyline: Polyline;
  }
}
