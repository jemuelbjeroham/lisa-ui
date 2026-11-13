import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import type { Approval } from "../src/lib/approvals";

const root = fs.existsSync(path.resolve("lisa-ui/package.json")) ? path.resolve("lisa-ui") : process.cwd();

function loadSource(filename: string): Record<string, unknown> {
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, URL, URLSearchParams,
    require: (name: string) => loadSource(path.resolve(path.dirname(filename), `${name}.ts`)),
  }, { filename });
  return loaded.exports;
}

const { presentApproval, MEMORY_TYPES, MEMORY_SCOPES } = loadSource(
  path.join(root, "src/lib/approvalPresentation/registry.ts"),
) as typeof import("../src/lib/approvalPresentation/registry");

function fixture(argumentsValue: Record<string, unknown> = { content: "Remember this", memory_type: "fact", scope: "user" }): Approval {
  return { approval_id: "a", execution_id: "e", conversation_id: "c", tool: "save_memory", operation: "memory.create",
    status: "pending", execution_status: "pending", revision: 1, arguments_hash: "hash", arguments: argumentsValue,
    target: "user-id", created_at: "2026-10-27T10:00:00Z", expires_at: "2026-10-27T10:10:00Z",
    editable_fields: ["content", "memory_type", "scope"], result: null };
}

test("save_memory uses the backend names and explicit enum options", () => {
  const presented = presentApproval(fixture());
    assert.equal(presented.title, "Save a memory");
  assert.equal(presented.needsReview, false);
  assert.deepEqual(Array.from(MEMORY_TYPES), ["fact", "preference", "instruction", "episodic", "project"]);
  assert.deepEqual(Array.from(MEMORY_SCOPES), ["user", "project"]);
  assert.deepEqual(Array.from(presented.editableFields, (field) => field.name), ["content", "memory_type", "scope"]);
});

test("unknown tools flatten nested arguments and never infer editable fields", () => {
  const approval = { ...fixture({ ticket: { title: "Fix routing", labels: ["ops", "urgent"] }, count: 2, enabled: true, empty: null }), tool: "create_ticket" };
  const presented = presentApproval(approval);
    assert.equal(presented.title, "Review requested action");
  assert.ok(presented.fields.some((field) => field.label === "Ticket / Title" && field.value === "Fix routing"));
  assert.ok(presented.fields.some((field) => field.value === "2"));
  assert.equal(presented.editableFields.length, 0);
  assert.equal(presented.needsReview, true);
});

test("nested secrets, credentials and URLs never leak into presentation or edit values", () => {
  const approval = fixture({ content: "See https://private.internal/a?token=TOPSECRET", memory_type: "fact", scope: "user",
    nested: { password: "PASSWORDVALUE", auth: { token: "TOKENVALUE" }, capability: "CAPABILITYVALUE",
      internal_metadata: { endpoint: "http://worker:8000" }, safe: "Bearer CREDENTIALVALUE", host: "api.cluster.local/path" } });
  const presented = presentApproval(approval);
  const output = JSON.stringify(presented);
  for (const secret of ["TOPSECRET", "PASSWORDVALUE", "TOKENVALUE", "CAPABILITYVALUE", "CREDENTIALVALUE", "worker:8000", "api.cluster.local"]) {
    assert.ok(!output.includes(secret), secret);
  }
  assert.equal(presented.hasHiddenFields, true);
  assert.equal(presented.needsReview, true);
  assert.ok(!presented.editableFields.some((field) => field.name === "content"));
});

test("HTML remains plain text and scalar previews have bounded details", () => {
  const content = "<script>alert('x')</script>";
  const presented = presentApproval(fixture({ content, memory_type: "fact", scope: "user", extra: "long".repeat(1500) }));
  assert.equal(presented.fields[0].value, content);
  assert.ok(presented.details.some((field) => field.value.includes("Additional content hidden")));
  assert.equal(presented.hasHiddenFields, true);
  assert.ok(presented.fields.every((field) => field.value.length < 300));
});

test("depth, count, cycles and malformed known arguments require review", () => {
  const nested: Record<string, unknown> = {};
  nested.self = nested;
  const presented = presentApproval(fixture({ content: 42, memory_type: "bogus", scope: "global", nested,
    deep: { child: { child: { child: { child: { child: { hidden: "too deep" } } } } } },
    many: Array.from({ length: 120 }, (_, index) => index) }));
  assert.equal(presented.editableFields.length, 0);
  assert.equal(presented.needsReview, true);
  assert.equal(presented.hasHiddenFields, true);
  assert.ok(presented.fields.length <= 85);
  assert.ok(presented.fields.some((field) => field.value.includes("hidden; review required")));
});

test("target and result are accounted for even when arguments exhaust the budget", () => {
  const approval = { ...fixture({ many: Array.from({ length: 120 }, (_, index) => index) }), result: { accepted: true } };
  const presented = presentApproval(approval);
  assert.ok(presented.fields.some((field) => field.path === "target" && field.value === "user-id"));
  assert.ok(presented.fields.some((field) => field.path === "result" && field.redacted));
});

test("unknown headings, non-HTTP URLs and bare internal addresses are redacted and flagged", () => {
  const approval = { ...fixture({ address: "localhost:8000/private", url: "postgres://user:pass@db/data", other: "//worker/private" }),
    tool: "https://private.internal/SECRET", operation: "http://worker/SECRET" };
  const presented = presentApproval(approval);
  const output = JSON.stringify(presented);
  assert.ok(!output.includes("SECRET") && !output.includes("user:pass") && !output.includes("8000/private"));
  assert.equal(presented.hasHiddenFields, true);
});

test("Jira approvals display the resolved payload and only backend-editable fields", () => {
  const approval: Approval = { ...fixture({ ticket_key: "OPS-123", comment: "Recovered" }),
    tool: "update_jira_ticket", operation: "jira.comment", editable_fields: ["comment"],
    effective_operation: { tool_name: "update_jira_ticket", destination: "https://jira.example",
      ticket_key: "OPS-123", payload: { body: { text: "Recovered" } } } };
  const presented = presentApproval(approval);
  assert.equal(presented.title, "Add a Jira comment");
  assert.ok(presented.fields.some((field) => field.path === "jira_issue" && field.value === "OPS-123"));
  assert.ok(presented.fields.some((field) => field.value === "jira.example/"));
  assert.ok(presented.fields.some((field) => field.path.startsWith("jira_payload") && field.value === "Recovered"));
  assert.deepEqual(Array.from(presented.editableFields, (field) => field.name), ["comment"]);
});