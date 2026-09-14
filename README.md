# 模型 Token 统计（Model Token Totals）

SillyTavern UI 扩展 · v0.4.0 · 目标版本：1.18.0

## 功能

- **真实用量优先**：拦截 `/api/backends/chat-completions/generate` 响应，读取 SSE 流里的 `usage`（`prompt_tokens` / `completion_tokens`），即 API 账单数字；拿不到自动回落本地 tokenizer 估算
- **全局总额**：跨所有聊天累计每个模型的输入/输出 Token，持久化重启不丢
- **当前聊天**：进入聊天即显示该聊天的输入/输出/合计（按模型拆分）
- **今日用量**：按天分桶统计，抽屉显示「今日」卡片
- **悬浮球 + 小抽屉**：可拖动到任意位置（位置记忆），点开抽屉；抽屉内可切换悬浮球显示「当前聊天 / 全局 / 今日」
- 命令 `/tokenstats`（别名 `/tstats`、`/tt`）
- 完整统计弹窗：今日 + 全局按模型表 + 各聊天表
- **自动更新**：manifest 开启 `auto_update`，可在酒馆扩展面板一键升级

## 安装

把 `model-token-totals/` 放进 `SillyTavern/public/scripts/extensions/`，刷新页面。
或解压 `model-token-totals.zip` 同样放入。

## 使用

1. 悬浮球可拖到喜欢的位置；点一下开/关抽屉，点外面或 Esc 也能关
2. 抽屉里三个卡片：当前聊天 / 今日 / 全局总额，外加悬浮球显示模式切换
3. 「查看完整统计」打开大窗口（含各聊天明细与今日汇总）
4. 设置 → 扩展 → 模型 Token 统计：总开关、输入/输出开关、真实用量开关、清零

## 原理

1. 拦截 fetch 的 generate 响应，克隆流单独读取 SSE，抓末尾 `usage`
2. `MESSAGE_RECEIVED` 时优先用抓到的真实 usage 累加；否则用 `getTokenCountAsync` 估算
3. 按模型名（`getChatCompletionModel()`）同时写入 `totals` / `chatTotals` / `dailyTotals` 三个仓库
4. `saveSettingsDebounced()` 持久化

## 数据格式

    extensionSettings["model-token-totals"] = {
      enabled: true, countUser: true, countOutput: true, useRealUsage: true,
      fabMode: "chat",  // chat | global | today
      totals:      { "gpt-4o": { input, output, count } },
      chatTotals:  { "chat-xxx.json": { "gpt-4o": { input, output, count } } },
      dailyTotals: { "2026-09-05": { "gpt-4o": { input, output, count } } }
    }

## 已知边界

- 真实 usage 仅在流式响应末尾带 `usage` 时可用（部分中转/网关不返回，此时回落估算）
- 非 Chat Completion 后端（如纯 textgen）只有估算值
- 只统计启用后新发生的消息，历史聊天不回溯

## 校验

    manifest 字段完整 · node --check 通过 · v0.4.0
