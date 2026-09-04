# 模型 Token 统计（Model Token Totals）

SillyTavern UI 扩展 · v0.3.0 · 目标版本：1.18.0

## 功能

- **全局总额**：跨所有聊天累计每个模型的输入/输出 Token，重启不丢
- **当前聊天**：进入聊天即显示该聊天各自用掉的 Token（按模型拆分）
- **悬浮球 + 小抽屉**：页面右下角悬浮球实时显示数字，点开小抽屉看「当前聊天 + 全局」
- 命令 `/tokenstats`（别名 `/tstats`、`/tt`）直接弹抽屉
- **悬浮球可拖动**：按住任意拖动到你喜欢的位置，位置会记住（重启不丢）；抽屉会紧贴悬浮球弹出
- **手机适配**：触屏可拖动不误触滚页；悬浮球/抽屉适配窄屏，按钮加大触控目标
- 完整统计弹窗：全局按模型表 + 各聊天表 + 合计行

## 安装

把 `model-token-totals/` 整个文件夹放进：

    SillyTavern/public/scripts/extensions/

刷新页面。或解压 `model-token-totals.zip` 后同样放入。

## 使用

1. 右下角悬浮球点一下展开 / 收起抽屉（Esc 也可关闭）
2. 抽屉里：当前聊天此前用了多少 Token，全局总额与各模型用量
3. 点「查看完整统计」打开大窗口（含按聊天明细）
4. 设置 → 扩展 → 模型 Token 统计：总开关、输入/输出开关、打开抽屉、全局清零

## 原理

1. 监听 `MESSAGE_SENT` / `MESSAGE_RECEIVED`，消息落库后取 `context.chat[index]`
2. `context.getTokenCountAsync(消息文本)` 按当前 tokenizer 估算
3. 按模型名（`getChatCompletionModel()`）累计到 `totals`（全局）与 `chatTotals`（按聊天）
4. `saveSettingsDebounced()` 持久化，重启后保留
5. 同一消息会话内去重；swipe 换内容后自动重计

## 数据格式

    extensionSettings["model-token-totals"] = {
      enabled: true, countUser: true, countOutput: true,
      totals: { "gpt-4o": { input: 12345, output: 6789, count: 23 } },
      chatTotals: { "chat-xxx.json": { "gpt-4o": { input: 999, output: 500, count: 7 } } }
    }

## 已知边界

- Token 为**估算值**（同酒馆输入框显示），非服务端账单
- 只统计启用后新发的消息；历史聊天不重算
- 悬浮球可拖动到自己喜欢的位置（自动记住）；也可通过 style.css 里 `#mtt-fab`、`#mtt-drawer` 微调样式

## 校验

    validate-extension-manifest.mjs --root model-token-totals  →  pass: true
