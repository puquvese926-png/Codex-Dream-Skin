import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const skillRoot = path.join(projectRoot, "skills", "dispatch-chatgpt-bridge");

test("skill defines distinct native Codex and ChatGPT bridge routes", async () => {
  const skill = await fs.readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const native = await fs.readFile(
    path.join(skillRoot, "references", "native-codex-bridge.md"),
    "utf8",
  );

  for (const route of [
    "codex-subagent",
    "codex-conversation",
    "codex-to-gpt",
    "gpt-to-codex",
  ]) {
    assert.match(skill, new RegExp(route));
    assert.match(native, new RegExp(route));
  }
  assert.match(native, /子智能体/);
  assert.match(native, /Codex 对话转交/);
  assert.match(native, /quick-watch|quick.?watch/i);
});

test("native route contract prevents delegation metadata spoofing and route drift", async () => {
  const native = await fs.readFile(
    path.join(skillRoot, "references", "native-codex-bridge.md"),
    "utf8",
  );

  assert.match(native, /不要手写|never write|do not write/i);
  assert.match(native, /codex_delegation/);
  assert.match(native, /source_thread_id/);
  assert.match(native, /codex_app__create_thread/);
  assert.match(native, /codex_app__send_message_to_thread/);
  assert.match(native, /multi_agent_v1__spawn_agent/);
  assert.match(native, /exact|精确/);
  assert.match(native, /fail closed|fail-closed|失败即停止/i);
});

test("skill metadata exposes the three bridge families without ambiguous child-agent wording", async () => {
  const metadata = await fs.readFile(
    path.join(skillRoot, "agents", "openai.yaml"),
    "utf8",
  );
  assert.match(metadata, /子智能体/);
  assert.match(metadata, /Codex 对话转交/);
  assert.match(metadata, /Codex.*GPT|GPT.*Codex/s);
  assert.doesNotMatch(metadata, /子代理（对话之前传递）/);
});
