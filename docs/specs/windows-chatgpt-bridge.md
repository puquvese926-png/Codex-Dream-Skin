# Spec: Windows 内置 ChatGPT 聊天桥接器

## Assumptions

1. 新版 Codex 桌面端左侧“聊天”是 ChatGPT 云端会话入口，与本地 Codex 任务线程是不同会话系统。
2. 桥接器只连接 Dream Skin 已启动并登记的 loopback CDP 会话；不自行重启 Codex，也不扫描或连接任意浏览器调试端口。
3. 第一版通过可见 DOM 和无障碍语义操作内置聊天，不读取 Cookie、localStorage、认证 Token 或私有后端请求。
4. 批量发送是显式变更操作，CLI 必须要求 `--allow-send`；只读 `discover` 和 `probe` 不需要该开关。
5. 一旦点击发送后状态不明确，任务标记为 `unknown-after-submit` 并停止，绝不自动重试，以免重复生图。
6. “额度是否与 Codex 分开”不能由 DOM 推断；第一版只记录客户端版本、聊天 surface、任务时间线和结果，额度结论必须结合用户可见用量变化判断。

## Objective

提供一个可被生图智能体调用的本地 CLI，把新版 Codex 桌面端内置 ChatGPT 聊天封装成稳定的批处理接口。主智能体可以一次写好多个提示词，桥接器为每个任务创建独立 ChatGPT 会话、发送提示词、等待完成，并返回会话标识、文本结果和图片资源元数据。

## Commands

```powershell
node .\windows\scripts\chatgpt-bridge.mjs discover
node .\windows\scripts\chatgpt-bridge.mjs probe
node .\windows\scripts\chatgpt-bridge.mjs batch --input <absolute-jobs.json> --output <absolute-report.json> --allow-send
node .\windows\scripts\chatgpt-bridge.mjs resume --input <absolute-resume.json> --output <absolute-report.json>
node .\windows\tests\chatgpt-bridge-tests.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\tests\run-tests.ps1
```

## Input and Output Contract

批处理输入使用严格 JSON：

```json
{
  "schemaVersion": 1,
  "jobs": [
    { "id": "concept-a", "prompt": "完整提示词 A" },
    { "id": "concept-b", "prompt": "完整提示词 B" }
  ]
}
```

输出报告包含：

- 客户端版本、CDP 端口和已验证 browser identity；
- 每个任务的状态、开始/完成时间、ChatGPT conversation ID（可见时）；
- 最终文本摘要、图片尺寸/来源类型和本地 artifact 路径；报告不嵌入图片字节；
- 所有失败或提交状态不明的明确原因；
- 不包含认证信息、Cookie、完整网络请求头或用户其他聊天内容。

## Project Structure

```text
windows/scripts/chatgpt-bridge.mjs       # CLI、CDP 会话、DOM 操作与批处理
windows/tests/chatgpt-bridge-tests.mjs   # 纯逻辑和模拟 CDP/DOM 测试
docs/specs/windows-chatgpt-bridge.md     # 行为契约
docs/plans/windows-chatgpt-bridge.md     # 增量实施计划
```

当前 `26.707.9564.0` 客户端通过版本固定的 `quickChatWindow.open` 创建独立窗口；每轮使用最多两个客户端窗口并行，更多任务自动分轮。生成图可能位于 assistant 文本节点之外，桥接器只接受尺寸合格且带生成图语义的已渲染 `img`，app-local blob 通过同页 canvas 转成 PNG。`resume` 使用新恢复窗口、显式历史标题和原追踪标记核对既有会话，不发送内容。

## Code Style

继续使用 Node ESM、两空格缩进、严格输入校验和失败关闭：

```js
export function validateBridgeJob(job) {
  if (!job || typeof job.id !== "string" || typeof job.prompt !== "string") {
    throw new Error("bridge job must contain string id and prompt");
  }
  return Object.freeze({ id: job.id, prompt: job.prompt });
}
```

## Testing Strategy

- 小型单元测试：参数、批处理 JSON、loopback WebSocket、客户端状态、DOM probe 和结果规范化。
- 中型模拟测试：假的 CDP transport 验证 create/send/wait 状态机及“提交不明不重试”。
- 大型实机测试：在当前已登录 Codex 客户端中创建两个标记清晰的普通聊天并并行完成；随后执行最小生图联调并回收图片元数据。
- 实机测试不进入 Windows 全量回归，避免 CI 或普通安装测试产生外部聊天。

## Boundaries

- Always：验证 Store 包身份、state.json、browser ID、loopback CDP 和 app:// renderer；输出脱敏报告；提交不明即停止。
- Ask first：重启 Codex、关闭现有聊天、删除或归档 ChatGPT 会话、修改活动皮肤、提交或推送 GitHub。
- Never：读取或输出 Token/Cookie；调用非 loopback CDP；修改 WindowsApps/app.asar；根据私有 API 猜测长期稳定契约；自动重试可能已发送的生图请求。

## Success Criteria

- `discover` 能从 Dream Skin state 自动找到当前 `9345` 一类的动态端口，并验证 browser ID、Store 包和 renderer。
- `probe` 能只读识别内置“聊天”入口、当前 surface 和 composer 可用性。
- 两个独立任务可以在同一运行中创建两个 ChatGPT 会话并完成，结果不会串线。
- 至少一个实机生图任务能返回图片元素元数据；不能下载时必须明确报告限制，不能伪造本地文件。
- 只读恢复能从已提交会话回收图片，不重新发送提示词。
- 任一任务在点击发送后失去可确认状态时不会重试。
- 专项测试和既有 Windows 全量回归通过。

## Open Questions

- ChatGPT 普通聊天和 Codex 的实际用量归属需要通过账号用量界面前后对照确认，桥接器本身不作未经验证的扣费声明。
- 客户端 DOM 会随版本更新；第一版以版本化 selector profile 和健康检查降低漂移风险，后续可评估官方接口替代。
