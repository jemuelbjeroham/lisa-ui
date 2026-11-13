import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = fs.existsSync(path.resolve("lisa-ui/package.json")) ? path.resolve("lisa-ui") : process.cwd();

function client(fetcher: typeof fetch) {
  const filename = path.join(root, "src/lib/approvals.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, fetch: fetcher, URLSearchParams, Error,
    require: () => ({ getApiBaseUrl: async () => "https://api.example.test" }),
  }, { filename });
  return loaded.exports as typeof import("../src/lib/approvals");
}

const fixture = { approval_id: "a", execution_id: "e", conversation_id: "c", tool: "save_memory", operation: "memory.create",
  status: "pending", execution_status: "pending", revision: 1, arguments_hash: "hash",
  arguments: { content: "Remember", memory_type: "fact", scope: "user" }, target: "user-id",
  created_at: "2026-10-27T10:00:00Z", expires_at: "2026-10-27T10:10:00Z", editable_fields: ["content"], result: null };

test("normalizer validates unknown responses and strips unrecognized top-level data", () => {
  const api = client(async () => Response.json(fixture));
  assert.equal(api.normalizeApproval({ ...fixture, identity: "ignored" }).approval_id, "a");
  assert.ok(!("identity" in api.normalizeApproval({ ...fixture, identity: "ignored" })));
  for (const invalid of [null, [], {}, { ...fixture, revision: 0 }, { ...fixture, arguments: [] },
    { ...fixture, editable_fields: [1] }, { ...fixture, result: "bad" }, { ...fixture, expires_at: "bad" }]) {
    assert.throws(() => api.normalizeApproval(invalid), /response was invalid/);
  }
});

test("all routes include cookies, use the base URL, and resume preserves the stream", async () => {
  const requests: { url: string; options: RequestInit }[] = [];
  const stream = new Response('{"type":"execution_completed"}\n');
  const api = client(async (url, options) => {
    requests.push({ url: String(url), options: options ?? {} });
    return String(url).endsWith("/resume") ? stream : Response.json(String(url).includes("?conversation_id=") ? [fixture] : fixture);
  });
  await api.getApproval("a/b");
  await api.listApprovals("c & d");
  await api.editApproval("a", { expected_revision: 1, expected_hash: "hash", changes: { content: "Updated" } });
  await api.cancelExecution("e");
  await api.getExecutionStatus("e");
  assert.equal(await api.resumeExecution("e"), stream);
  assert.equal(stream.bodyUsed, false);
  assert.deepEqual(requests.map((request) => request.url), [
    "https://api.example.test/api/v1/approvals/a%2Fb",
    "https://api.example.test/api/v1/approvals?conversation_id=c+%26+d",
    "https://api.example.test/api/v1/approvals/a",
    "https://api.example.test/api/v1/executions/e/cancel",
    "https://api.example.test/api/v1/executions/e",
    "https://api.example.test/api/v1/executions/e/resume",
  ]);
  assert.ok(requests.every((request) => request.options.credentials === "include" && request.options.cache === "no-store"));
  assert.equal(requests[2].options.method, "PATCH");
  assert.deepEqual(JSON.parse(String(requests[2].options.body)), { expected_revision: 1, expected_hash: "hash", changes: { content: "Updated" } });
});

test("decisions preserve caller keys on retries and exclude identity inputs", async () => {
  const bodies: string[] = [];
  const api = client(async (_url, options) => { bodies.push(String(options?.body)); return Response.json(fixture); });
  const decision = { revision_number: 1, payload_hash: "hash", decision: "approve" as const, decision_key: "stable-key", user_id: "must-not-send" };
  await api.decideApproval("a", decision);
  await api.decideApproval("a", decision);
  assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(JSON.parse(bodies[0]), { revision_number: 1, payload_hash: "hash", decision: "approve", decision_key: "stable-key" });
  await assert.rejects(api.decideApproval("a", { ...decision, decision_key: "" }), /Check the approval changes/);
  assert.equal(bodies.length, 2);
});

test("errors are friendly and never expose backend or transport messages", async () => {
  for (const detail of ["stale_revision", "http://internal/SECRET", [{ msg: "SECRET" }], "__proto__"]) {
    const api = client(async () => Response.json({ detail }, { status: 409 }));
    await assert.rejects(api.getApproval("a"), (error: Error) => {
      assert.ok(!error.message.includes("SECRET") && !error.message.includes("internal"));
      if (detail === "stale_revision") assert.match(error.message, /has changed/);
      return true;
    });
  }
  const api = client(async () => { throw new Error("SECRET network http://internal"); });
  await assert.rejects(api.getApproval("a"), /Unable to reach approvals/);
});

test("malformed JSON and mixed invalid lists fail closed", async () => {
  const invalidJson = client(async () => new Response("not json"));
  await assert.rejects(invalidJson.getApproval("a"), /response was invalid/);
  const invalidList = client(async () => Response.json([fixture, {}]));
  await assert.rejects(invalidList.listApprovals("c"), /response was invalid/);
});