import type { GlobalThemeOverrides } from "naive-ui";

/**
 * Naive UI 的主题覆盖。
 *
 * 默认主题的主色是绿色 (#18a058)，和这个项目已有的蓝色 `--accent: #4f7cff`
 * 放在一起会像两个应用拼起来的。这里只改需要对齐的那几项：
 * 主色、圆角、字号、字体栈，剩下的交给 Naive UI 自己的默认值 ——
 * 覆盖得越多，将来升级组件库要改的地方就越多。
 */
export const naiveThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: "#4f7cff",
    primaryColorHover: "#6b91ff",
    primaryColorPressed: "#3f6ae8",
    primaryColorSuppl: "#6b91ff",
    infoColor: "#4f7cff",
    borderRadius: "7px",
    borderRadiusSmall: "6px",
    fontSize: "13px",
    fontSizeSmall: "12px",
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
    // 让输入框的底/边和页面上的 --surface / --border 对上
    textColorBase: "#0f172a",
    borderColor: "#d9dfe8",
    dividerColor: "#e5e9f0",
  },
};
