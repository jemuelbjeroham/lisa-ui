import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import type { Approval } from "../src/lib/approvals";
import type { ApprovalPanelProps } from "../src/components/approvals/ApprovalPanel";

const root = fs.existsSync(path.resolve("lisa-ui/package.json")) ? path.resolve("lisa-ui") : process.cwd();
const localRequire = createRequire(path.join(root, "package.json"));
const React = localRequire("react") as typeof import("react");
const { renderToStaticMarkup } = localRequire("react-dom/server") as typeof import("react-dom/server");

function loadSource(filename: string, react = React, globals: Record<string, unknown> = {}): Record<string, unknown> {
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(source, {
    module: loaded, exports: loaded.exports, Date, setInterval, clearInterval, ...globals,
    require: (name: string) => {
      if (name === "react") return react;
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      if (!name.startsWith(".")) return localRequire(name);
      return loadSource(path.resolve(path.dirname(filename), `${name}.ts`), react, globals);
    },
  }, { filename });
  return loaded.exports;
}

const filename = path.join(root, "src/components/approvals/ApprovalPanel.tsx");
const { ApprovalPanel } = loadSource(filename) as typeof import("../src/components/approvals/ApprovalPanel");
const noop = () => {};

function fixture(overrides: Partial<Approval> = {}): Approval {
  return {
    approval_id: "approval", execution_id: "execution", conversation_id: "conversation", tool: "save_memory",
    operation: "memory.create", status: "pending", execution_status: "pending", revision: 1, arguments_hash: "hash",
    arguments: { content: "Remember this", memory_type: "fact", scope: "user" },
    target: "c6230844-b19f-4a07-84db-f64c4d610e50", created_at: "2026-10-27T10:00:00Z",
    expires_at: new Date(Date.now() + 600000).toISOString(), editable_fields: ["content", "memory_type", "scope"],
    result: null, ...overrides,
  };
}

function render(approval = fixture(), overrides: Partial<ApprovalPanelProps> = {}, component = ApprovalPanel) {
  return renderToStaticMarkup(React.createElement(component, {
    approval, busy: false, onDecide: noop, onEdit: noop, onCancel: noop, onResume: noop, onExpire: noop,
    onDismiss: noop, ...overrides,
  }));
}

test("compact memory summary moves target references to details and escapes malicious text", () => {
  const html = render(fixture({ arguments: { content: '<script>alert("x")</script>', memory_type: "fact", scope: "user", extra: "Other value" } }));
  const summary = html.slice(0, html.indexOf("<details"));
  assert.match(summary, /Save a memory/);
  assert.match(summary, /Your account memory/);
  assert.equal((summary.match(/<dt>/g) ?? []).length, 3);
  assert.ok(!summary.includes("c6230844") && !summary.includes("Other value"));
  assert.match(html, /Target reference/);
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /aria-live="off"/);
  for (const label of ["Approve", "Reject", "Edit", "Cancel"]) assert.match(html, new RegExp(`>${label}</button>`));
});

test("generic actions do not infer an editor or promote a target into the summary", () => {
  const html = render(fixture({ tool: "unknown_action", operation: "unknown.write", arguments: { safe: "Value" } }));
  assert.ok(!html.includes(">Edit</button>") && !html.includes("<form"));
  assert.ok(!html.slice(0, html.indexOf("<details")).includes("c6230844"));
  assert.match(html, /Review required/);
});

test("approved actions require explicit execution and busy disables every action", () => {
  const approval = fixture({ status: "approved", execution_status: "approved" });
  const html = render(approval);
  assert.match(html, />Approved<\/span>/);
  assert.match(html, />Run approved action<\/button>/);
  assert.ok(!html.includes(">Approve</button>") && !html.includes("panel pending"));
  const busy = render(fixture(), { busy: true });
  assert.equal((busy.match(/disabled=""/g) ?? []).length, 4);
  assert.ok(!busy.includes("panel pending"));
});

test("elapsed approvals have no actions until refreshed and final states stay authoritative", () => {
  const expires_at = "2000-01-01T00:00:00Z";
  for (const state of ["pending", "approved"]) {
    const html = render(fixture({ status: state, execution_status: state, expires_at }));
    assert.ok(!html.includes("<button") && !html.includes("panel pending"));
    assert.match(html, />Expired<\/span>/);
  }
  for (const state of ["claimed", "executing", "resuming"]) {
    const html = render(fixture({ execution_status: state, expires_at }));
    assert.ok(!html.includes("<button") && !html.includes("Expires in"));
    assert.ok(!html.includes(">Expired</span>"));
  }
  for (const state of ["rejected", "expired", "cancelled"]) {
    const html = render(fixture({ execution_status: state, expires_at }));
    assert.match(html, />Continue conversation<\/button>/);
    if (["rejected", "expired", "cancelled"].includes(state)) {
      assert.match(html, />Continue conversation<\/button>/);
      assert.doesNotMatch(html, />Dismiss<\/button>/);
    } else {
      assert.match(html, />Dismiss<\/button>/);
    }
    assert.ok(!html.includes(">Approve</button>") && !html.includes("Run approved action"));
  }
  for (const state of ["manual_review", "completed"]) {
    const html = render(fixture({ execution_status: state, expires_at }));
    assert.equal((html.match(/<button/g) ?? []).length, 1);
    assert.match(html, />Dismiss<\/button>/);
  }
});

test("native editor uses only sanitized presentation values, bounded content and enum options", () => {
  let stateIndex = 0;
  const editingReact = { ...React, useState: (initial: unknown) => {
    stateIndex += 1;
    const value = stateIndex === 2 ? true : typeof initial === "function" ? initial() : initial;
    return [value, noop];
  } } as unknown as typeof React;
  const { ApprovalPanel: EditingPanel } = loadSource(filename, editingReact) as typeof import("../src/components/approvals/ApprovalPanel");
  const html = render(fixture(), {}, EditingPanel);
  assert.match(html, /<form/);
  assert.match(html, /<textarea[^>]*name="content"[^>]*maxLength="32000"/);
  assert.equal((html.match(/<select/g) ?? []).length, 2);
  assert.equal((html.match(/<option/g) ?? []).length, 7);
  assert.match(html, /value="preference">Preference/);
  assert.ok(!html.includes("<input"));
  stateIndex = 0;
  const protectedHtml = render(fixture({ arguments: {
    content: "Bearer TOPSECRET", memory_type: "fact", scope: "user", password: "PASSWORDVALUE",
  } }), {}, EditingPanel);
  assert.ok(!protectedHtml.includes("TOPSECRET") && !protectedHtml.includes("PASSWORDVALUE"));
  assert.ok(!protectedHtml.includes("<textarea"));
});

test("CSS matches composer dimensions, thinking colors and reduced motion", () => {
  const css = fs.readFileSync(path.join(root, "src/components/approvals/ApprovalPanel.module.css"), "utf8");
  for (const declaration of ["width: 100%", "gap: 6px", "margin-bottom: 6px", "border-radius: 18px", "border-radius: 15px",
    "--approval-accent: #8d4ae7", "rgba(141,74,231,.11)", "rgba(181,111,255,.3)", "#d3a6ff", "border-pulse 2.6s"])
    assert.ok(css.includes(declaration), declaration);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.pending\s*\{\s*animation: none;/);
});

test("clock expires once, stops its interval and cleans up on authoritative state changes", () => {
  let timestamp = Date.now();
  const deadline = timestamp + 1500;
  const slots: unknown[] = [];
  let cursor = 0;
  let previousDeps: unknown[] | undefined;
  let cleanup: (() => void) | undefined;
  let effect: (() => void | (() => void)) | undefined;
  let interval: (() => void) | undefined;
  let expires = 0;
  let starts = 0;
  let stops = 0;
  const disposeEffect = () => { cleanup?.(); };
  class ClockDate extends Date {
    static now() { return timestamp; }
  }
  const hooks = {
    ...React,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value: unknown) => { slots[index] = value; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffectEvent(callback: unknown) { return callback; },
    useEffect(callback: () => void | (() => void), dependencies: unknown[]) {
      if (!previousDeps || dependencies.some((value, index) => value !== previousDeps![index])) {
        cleanup?.();
        effect = callback;
        previousDeps = dependencies;
      }
    },
  } as typeof React;
  const { ApprovalPanel: ClockPanel } = loadSource(filename, hooks, {
    Date: ClockDate,
    setInterval(callback: () => void, delay: number) {
      assert.equal(delay, 1000);
      starts += 1;
      interval = callback;
      return starts;
    },
    clearInterval() { stops += 1; interval = undefined; },
  }) as typeof import("../src/components/approvals/ApprovalPanel");
  const approval = fixture({ expires_at: new Date(deadline).toISOString() });
  function paint(current = approval) {
    cursor = 0;
    const html = render(current, { onExpire: () => { expires += 1; } }, ClockPanel);
    if (effect) {
      const pendingEffect = effect;
      effect = undefined;
      cleanup = pendingEffect() || undefined;
    }
    return html;
  }
  assert.match(paint(), />Approve<\/button>/);
  assert.equal(starts, 1);
  timestamp = deadline;
  interval?.();
  assert.equal(expires, 1);
  assert.equal(interval, undefined);
  assert.ok(!paint().includes("<button"));
  paint();
  assert.equal(expires, 1);
  const executing = paint({ ...approval, execution_status: "executing" });
  assert.match(executing, />Executing<\/span>/);
  assert.ok(!executing.includes("Awaiting confirmed expiry"));
  assert.ok(stops >= 1);
  slots.length = 0;
  previousDeps = undefined;
  cleanup = undefined;
  timestamp = deadline - 1000;
  paint();
  assert.equal(starts, 2);
  disposeEffect();
  assert.equal(interval, undefined);
});