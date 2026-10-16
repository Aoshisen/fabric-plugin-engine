import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";
import DemoView from "../views/DemoView.vue";
import PlaygroundView from "../views/PlaygroundView.vue";

/**
 * 两个页面各有明确分工：
 *
 * - `/` —— 地基演示。看 `Editor` / `ObjectRegistry` / 插件系统本身在干什么：
 *   装了哪些插件、事件怎么同步进 store、导出的 JSON 长什么样。
 * - `/playground` —— 真正用来「用」这个编辑器的地方：加图形、选中、改属性。
 *
 * 用 createWebHistory 而不是 hash：`vp dev` 和 `vp preview` 都带 SPA 回退，
 * 本地开发不会有问题。**但**如果之后把 `dist/` 丢到不带 rewrite 的静态服务器上，
 * `/playground` 会 404 —— 那时候要么加 rewrite 规则，要么换成 createWebHashHistory。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "demo",
    component: DemoView,
    meta: { title: "地基演示" },
  },
  {
    path: "/playground",
    name: "playground",
    component: PlaygroundView,
    meta: { title: "Playground" },
  },
  // 打错的路径直接回演示页，避免白屏
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
