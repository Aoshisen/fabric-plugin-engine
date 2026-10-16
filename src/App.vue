<script setup lang="ts">
import { NConfigProvider } from "naive-ui";
import { RouterLink, RouterView } from "vue-router";
import { naiveThemeOverrides } from "./naiveTheme";

/**
 * 应用外壳。
 *
 * 只负责「导航 + 出图」两件事：具体页面自己管自己的画布与状态。
 * 页面切换时 `EditorCanvas` 会随组件卸载而 `dispose()`，所以两个页面各有一份
 * 独立的 Editor 实例，互不干扰 —— 这也是插件清单要在页面里显式登记的原因。
 *
 * `NConfigProvider` 放在外壳而不是各个页面里：组件库的主题属于应用级配置，
 * 换页面不该换皮肤。
 */
</script>

<template>
  <NConfigProvider :theme-overrides="naiveThemeOverrides">
    <div class="shell">
      <header class="shell__bar">
        <RouterLink class="shell__brand" to="/">
          <span class="shell__mark" />
          <span>Fabric Editor Base</span>
        </RouterLink>

        <nav class="shell__nav">
          <RouterLink class="shell__link" to="/">地基演示</RouterLink>
          <RouterLink class="shell__link" to="/playground">Playground</RouterLink>
        </nav>
      </header>

      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </div>
  </NConfigProvider>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.shell__bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border);
  background: rgb(255 255 255 / 88%);
  backdrop-filter: blur(8px);
}

.shell__brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.shell__mark {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: linear-gradient(135deg, var(--accent), #8b5cf6);
}

.shell__nav {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 9px;
  background: var(--stage);
}

.shell__link {
  padding: 5px 14px;
  font-size: 13px;
  border-radius: 7px;
  color: var(--text-muted);
  text-decoration: none;
  transition:
    background 0.15s,
    color 0.15s;
}

.shell__link:hover {
  color: var(--text-strong);
}

.shell__link.router-link-exact-active {
  background: var(--surface);
  color: var(--text-strong);
  box-shadow: 0 1px 2px rgb(15 23 42 / 10%);
}
</style>
