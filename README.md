# 模型 Token 统计（Model Token Totals）

自用，图一乐。

## 说明

只统计**模型的输入和回复**所消耗的 Token。

数据库、向量检索、正则脚本、世界书等第三方插件各自单独产生的额外 Token 消耗，**不在统计范围内**。

## 安装

1. 下载 `model-token-totals.zip` 并解压
2. 把 `model-token-totals` 文件夹整个放进 `SillyTavern/public/scripts/extensions/`
3. 刷新页面

（也可以用仓库地址安装：`https://github.com/aklnaaw/sillytavern-model-token-totals`，之后支持检查更新）

## 用法

- 右下角悬浮球：点一下开/关抽屉，可拖动位置，点外面或按 Esc 关闭
- 抽屉里可切换悬浮球显示「当前聊天 / 今日 / 全局」
- 命令：`/tokenstats`，或点抽屉里的「查看完整统计」
- 设置 → 扩展 → 模型 Token 统计：开关、真实用量、清零
