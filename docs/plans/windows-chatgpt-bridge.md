# Implementation Plan: Windows 内置 ChatGPT 聊天桥接器

## Architecture Decisions

- 复用 `%LOCALAPPDATA%\CodexDreamSkin\state.json`，不另行扫描随机调试端口。
- 从 state 中的 Store 包身份、端口和 browser ID开始，连接前再次验证 `/json/version` 与 `app://` 页面。
- CDP transport 与 ChatGPT DOM driver 分离，单元测试可以使用 fake transport。
- 所有 DOM 脚本只返回桥接器所需的最小结构，不抓取侧栏历史或其他聊天正文。
- 使用客户端原生 quick-chat 窗口服务创建独立 renderer；按当前版本的双窗口容量分轮，轮内并行等待。
- 实机报告写入 `windows/outputs/chatgpt-bridge/`，不纳入发布资产。

## Tasks

状态：全部完成。实机已验证双文本会话和双生图会话；首次图片轮询暴露独立生成图节点后，使用只读恢复命令成功回收两张 PNG。

### Task 1: 合同和纯逻辑测试

- Acceptance：端口/state、输入 JSON、URL、状态机和结果结构均有先失败的测试。
- Verify：`node windows/tests/chatgpt-bridge-tests.mjs` 在实现前失败。
- Files：`windows/tests/chatgpt-bridge-tests.mjs`。

### Task 2: 只读 discover/probe

- Acceptance：当前 Codex 客户端能返回经过身份验证的 renderer 和“聊天”入口健康状态。
- Verify：专项测试通过；实机 `discover`、`probe` 返回 `pass: true`。
- Files：`windows/scripts/chatgpt-bridge.mjs`。

### Task 3: 单会话 create/send/wait/collect

- Acceptance：显式 `--allow-send` 后创建一条新聊天、发送唯一标记提示词、等待稳定完成并提取结果；提交不明不重试。
- Verify：fake transport 测试及一个实机文本聊天通过。
- Files：同上。

### Task 4: 双任务批处理和生图联调

- Acceptance：两个任务有独立 conversation ID/结果；至少一个返回图片元数据；生成脱敏 JSON 报告。
- Verify：检查报告、客户端聊天页面和图片元素；不读取认证数据。
- Files：同上及 `windows/outputs/chatgpt-bridge/` 运行报告。

### Task 5: 回归和文档入口

- Acceptance：专项测试加入 Windows 回归；README/CHANGELOG 简述实验性桥接命令和安全边界。
- Verify：Node 语法检查、专项测试、Windows 全量测试通过。
- Files：`windows/tests/run-tests.ps1`、`windows/CHANGELOG.md`、必要的 README 段落。

## Risks

- DOM 变更：selector profile 带客户端版本和多个语义回退；probe 失败时不发送。
- 重复生图：发送后任何歧义都记录为 unknown，不自动重试。
- 会话串线：每次发送后记录 URL/conversation ID，并在轮询时验证仍为目标会话。
- 并发争抢：创建和发送使用单 renderer 锁；已提交会话通过轮询切换读取，不并发点击。
- 额度误判：报告只陈述实际 surface 与结果，不把“同一客户端”推断为“同一或不同额度”。
