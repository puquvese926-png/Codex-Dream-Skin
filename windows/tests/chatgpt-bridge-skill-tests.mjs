import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const wrapper = path.join(
  projectRoot,
  "skills",
  "dispatch-chatgpt-bridge",
  "scripts",
  "run-bridge.ps1",
);
const skillRoot = path.dirname(path.dirname(wrapper));

async function createFakeBridgeRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "chatgpt-bridge-skill-"));
  const scripts = path.join(root, "windows", "scripts");
  await fs.mkdir(scripts, { recursive: true });
  await fs.writeFile(path.join(scripts, "chatgpt-bridge.mjs"),
    "console.log(JSON.stringify(process.argv.slice(2)));\n", "utf8");
  return root;
}

async function runWrapper(argumentsList, options = {}) {
  return execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", wrapper,
    ...argumentsList,
  ], {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
}

test("dispatch wrapper forwards read-only probe to the selected bridge root", async (context) => {
  const root = await createFakeBridgeRoot();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const { stdout } = await runWrapper(["-Action", "probe", "-Root", root]);
  assert.deepEqual(JSON.parse(stdout.trim()), ["probe"]);
});

test("dispatch wrapper requires explicit authorization and absolute batch paths", async (context) => {
  const root = await createFakeBridgeRoot();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, "jobs.json");
  const output = path.join(root, "report.json");

  await assert.rejects(
    runWrapper(["-Action", "batch", "-Root", root, "-InputPath", input, "-OutputPath", output]),
    /AllowSend|authorization/i,
  );
  const { stdout } = await runWrapper([
    "-Action", "batch",
    "-Root", root,
    "-InputPath", input,
    "-OutputPath", output,
    "-TimeoutMs", "240000",
    "-AllowSend",
  ]);
  assert.deepEqual(JSON.parse(stdout.trim()), [
    "batch", "--input", input, "--output", output,
    "--timeout-ms", "240000", "--allow-send",
  ]);
});

test("dispatch wrapper keeps resume read-only and resolves the environment root", async (context) => {
  const root = await createFakeBridgeRoot();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, "resume.json");
  const output = path.join(root, "recovered.json");
  const env = { ...process.env, CODEX_DREAM_SKIN_ROOT: root };

  await assert.rejects(
    runWrapper([
      "-Action", "resume", "-InputPath", input, "-OutputPath", output, "-AllowSend",
    ], { env }),
    /read-only|AllowSend/i,
  );
  const { stdout } = await runWrapper([
    "-Action", "resume", "-InputPath", input, "-OutputPath", output,
  ], { env });
  assert.deepEqual(JSON.parse(stdout.trim()), [
    "resume", "--input", input, "--output", output, "--timeout-ms", "180000",
  ]);
});

test("dispatch wrapper forwards bounded handoff watch without send authorization", async (context) => {
  const root = await createFakeBridgeRoot();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, "watch.json");
  const output = path.join(root, "handoff-report.json");

  await assert.rejects(
    runWrapper([
      "-Action", "watch", "-Root", root,
      "-InputPath", input, "-OutputPath", output, "-AllowSend",
    ]),
    /read-only|AllowSend/i,
  );
  const { stdout } = await runWrapper([
    "-Action", "watch", "-Root", root,
    "-InputPath", input, "-OutputPath", output,
    "-TimeoutMs", "60000", "-PollMs", "750",
  ]);
  assert.deepEqual(JSON.parse(stdout.trim()), [
    "watch", "--input", input, "--output", output,
    "--timeout-ms", "60000", "--poll-ms", "750",
  ]);
});

test("dispatch wrapper requires send authorization for exact handoff approval", async (context) => {
  const root = await createFakeBridgeRoot();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, "approve.json");
  const output = path.join(root, "approve-report.json");

  await assert.rejects(
    runWrapper([
      "-Action", "approve", "-Root", root,
      "-InputPath", input, "-OutputPath", output,
    ]),
    /AllowSend|authorization/i,
  );
  const { stdout } = await runWrapper([
    "-Action", "approve", "-Root", root,
    "-InputPath", input, "-OutputPath", output,
    "-TimeoutMs", "30000", "-AllowSend",
  ]);
  assert.deepEqual(JSON.parse(stdout.trim()), [
    "approve", "--input", input, "--output", output,
    "--timeout-ms", "30000", "--allow-send",
  ]);
});

test("skill metadata triggers bridge scheduling and preserves safety rules", async () => {
  const skill = await fs.readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const metadata = await fs.readFile(path.join(skillRoot, "agents", "openai.yaml"), "utf8");
  const contract = await fs.readFile(path.join(skillRoot, "references", "bridge-contract.md"), "utf8");
  const handoff = await fs.readFile(path.join(skillRoot, "references", "handoff-contract.md"), "utf8");

  assert.match(skill, /^---\r?\nname: dispatch-chatgpt-bridge\r?\n/);
  assert.match(skill, /多聊天并行|GPT 聊天调度/);
  assert.match(skill, /writing/i);
  assert.match(skill, /translation/i);
  assert.match(skill, /summari[sz]ation/i);
  assert.match(skill, /brainstorming/i);
  assert.match(skill, /self-contained/i);
  assert.match(skill, /local workspace/i);
  assert.match(skill, /unknown-after-submit[\s\S]*never resend/i);
  assert.match(skill, /cookies, tokens|Cookie/);
  assert.doesNotMatch(skill, /\[TODO|TODO:/);
  assert.match(metadata, /\$dispatch-chatgpt-bridge/);
  assert.doesNotMatch(metadata, /�/);
  assert.match(contract, /"schemaVersion": 1/);
  assert.match(contract, /Resume performs no send/);
  assert.match(skill, /CODEX_HANDOFF/);
  assert.match(skill, /conversation-not-readable/);
  assert.match(contract, /\| `watch` \| No \| No \|/);
  assert.match(handoff, /CODEX_APPROVE login-page-001/);
  assert.match(handoff, /GPT cannot approve its own task/);
  assert.match(handoff, /checkpoint is committed before the report/i);
});
