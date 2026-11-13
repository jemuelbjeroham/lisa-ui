import { test } from "node:test";
import assert from "node:assert/strict";
import type { Approval } from "../src/lib/approvals";
import type { ApprovalLifecycleApi, ApprovalLifecycleState } from "../src/lib/approval-lifecycle";

const helperPath = "../src/lib/approval-lifecycle.ts";
const { approvalVisible, approvalPollDelay, approvalNotification, normalizeApprovalId,
  consumeApprovalStream, createApprovalLifecycle } = await import(helperPath) as typeof import("../src/lib/approval-lifecycle");

const conversation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherConversation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const fixture: Approval = {
  approval_id: "11111111-1111-4111-8111-111111111111",
  execution_id: "22222222-2222-4222-8222-222222222222", conversation_id: conversation,
  tool: "save_memory", operation: "memory.create", status: "pending", execution_status: "pending",
  revision: 1, arguments_hash: "hash", arguments: { content: "Remember" }, target: "user",
  created_at: "2026-10-27T10:00:00Z", expires_at: "2026-10-27T10:10:00Z", editable_fields: ["content"], result: null,
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(overrides: Partial<ApprovalLifecycleApi> = {}) {
  let active = true;
  let state: ApprovalLifecycleState = { records: [], loading: false, busy: false, error: null };
  let changes = 0;
  const content: string[] = [];
  const running: boolean[] = [];
  const api: ApprovalLifecycleApi = {
    listApprovals: async () => [fixture], getApproval: async () => fixture,
    editApproval: async () => fixture, decideApproval: async () => fixture,
    cancelExecution: async () => fixture, resumeExecution: async () => new Response(""), ...overrides,
  };
  const lifecycle = createApprovalLifecycle(conversation, {
    api, isActive: () => active, onChange: (next) => { state = next; changes += 1; },
    onResumeContent: (text) => content.push(text), onResumeState: (value) => running.push(value),
    errorMessage: () => "Sanitized request error", isConflict: (error) => error === "conflict",
    createKey: () => crypto.randomUUID(), notificationRetryMs: 0,
  });
  return { lifecycle, content, running, get state() { return state; }, get changes() { return changes; },
    deactivate() { active = false; }, dispose() { lifecycle.dispose(); } };
}

test("visibility follows execution authority, preserving negative continuations and manual review", () => {
  for (const execution_status of ["pending", "approved", "claimed", "executing", "resuming", "rejected", "expired", "cancelled", "manual_review"]) {
    assert.equal(approvalVisible({ ...fixture, execution_status }), true, execution_status);
  }
  assert.equal(approvalVisible({ ...fixture, status: "approved", execution_status: "completed" }), false);
  assert.equal(approvalPollDelay([fixture]), 5000);
  assert.equal(approvalPollDelay([{ ...fixture, execution_status: "executing" }]), 3000);
  for (const execution_status of ["completed", "manual_review", "rejected", "expired", "cancelled"]) {
    assert.equal(approvalPollDelay([{ ...fixture, execution_status }]), null);
  }
});

test("notification identities are normalized, scoped, stable, and include state transitions", () => {
  const event = { type: "approval_required", event_id: fixture.approval_id, approval_id: fixture.approval_id, revision: 1, status: "pending" };
  assert.equal(normalizeApprovalId(conversation.toUpperCase()), conversation);
  assert.equal(normalizeApprovalId("../../unsafe"), null);
  assert.equal(approvalNotification(event, conversation, otherConversation), null);
  assert.equal(approvalNotification({ ...event, conversation_id: otherConversation }, conversation, conversation), null);
  assert.equal(approvalNotification({ ...event, conversation_id: 3 }, conversation, conversation), null);
  assert.equal(approvalNotification({ ...event, conversation_id: null }, conversation, conversation), null);
  assert.equal(approvalNotification({ type: "content" }, conversation, conversation), null);
  assert.equal(approvalNotification({ type: "execution_completed" }, conversation, conversation)?.key, null);
  assert.notEqual(approvalNotification(event, conversation, conversation)?.key,
    approvalNotification({ ...event, revision: 2 }, conversation, conversation)?.key);
  assert.notEqual(approvalNotification(event, conversation, conversation)?.key,
    approvalNotification({ ...event, status: "approved" }, conversation, conversation)?.key);
});

test("mount-style refresh recovers pending and never resumes implicitly", async () => {
  let resumes = 0;
  let snapshot = fixture;
  const view = harness({
    listApprovals: async () => [snapshot],
    decideApproval: async () => {
      snapshot = { ...fixture, status: "approved", execution_status: "approved" };
      return snapshot;
    },
    resumeExecution: async () => { resumes += 1; return new Response(""); },
  });
  try {
    await view.lifecycle.refresh();
    assert.deepEqual(view.state.records, [fixture]);
    await view.lifecycle.decide(fixture, "approve");
    assert.deepEqual(view.state.records, [snapshot]);
    assert.equal(view.state.records[0].execution_status, "approved");
    assert.equal(view.state.busy, false);
    assert.equal(view.state.error, null);
    assert.deepEqual(view.running, []);
    assert.deepEqual(view.content, []);
    assert.equal(resumes, 0);
  } finally { view.dispose(); }
});

test("successful read recovery clears stale errors without hiding mutation failures", async () => {
  let failRead = true;
  const view = harness({
    listApprovals: async () => {
      if (failRead) throw new Error("read failed");
      return [fixture];
    },
    decideApproval: async () => { throw new Error("decision failed"); },
  });
  try {
    await view.lifecycle.refresh();
    assert.equal(view.state.error, "Sanitized request error");
    failRead = false;
    await view.lifecycle.refresh();
    assert.equal(view.state.error, null);
    await view.lifecycle.decide(fixture, "approve");
    assert.equal(view.state.error, "Sanitized request error");
    await view.lifecycle.refresh();
    assert.equal(view.state.error, null);
  } finally { view.dispose(); }
});

test("notifications retry visibility, deduplicate, and reject foreign authoritative details", async () => {
  let reads = 0;
  const visible = deferred<void>();
  const view = harness({ getApproval: async () => {
    reads += 1;
    if (reads === 1) throw new Error("not visible yet");
    if (reads === 2) return { ...fixture, conversation_id: otherConversation };
    visible.resolve();
    return fixture;
  } });
  try {
    const event = { type: "approval_required", approval_id: fixture.approval_id, revision: 1 };
    assert.equal(view.lifecycle.notify(event, otherConversation), false);
    assert.equal(view.lifecycle.notify(event, conversation), true);
    assert.equal(view.lifecycle.notify(event, conversation), true);
    await visible.promise;
    await Promise.resolve();
    assert.equal(reads, 3);
    assert.deepEqual(view.state.records, [fixture]);
  } finally { view.dispose(); }
});

test("late reads cannot cross switches or overwrite a newer authoritative response", async () => {
  const delayed = deferred<Approval[]>();
  const view = harness({ listApprovals: () => delayed.promise,
    editApproval: async () => ({ ...fixture, revision: 2 }) });
  const refresh = view.lifecycle.refresh();
  view.deactivate();
  const changes = view.changes;
  delayed.resolve([fixture]);
  await refresh;
  assert.equal(view.changes, changes);
  assert.equal(view.lifecycle.notify({ type: "approval_required" }, conversation), false);
  view.dispose();

  const old = deferred<Approval[]>();
  let lists = 0;
  const current = harness({ listApprovals: () => ++lists === 1 ? old.promise : Promise.resolve([{ ...fixture, revision: 2 }]) });
  try {
    const first = current.lifecycle.refresh();
    await current.lifecycle.refresh();
    old.resolve([fixture]);
    await first;
    assert.equal(current.state.records[0].revision, 2);
  } finally { current.dispose(); }
});

test("decision retries keep the key through network failure, clearing after success or conflict", async () => {
  const keys: string[] = [];
  let failure: unknown = new Error("SECRET");
  const view = harness({ decideApproval: async (_id, request) => {
    keys.push(request.decision_key);
    if (failure) throw failure;
    return fixture;
  } });
  try {
    await view.lifecycle.decide(fixture, "approve");
    assert.equal(view.state.error, "Sanitized request error");
    await view.lifecycle.decide(fixture, "approve");
    assert.equal(keys[0], keys[1]);
    failure = "conflict";
    await view.lifecycle.decide(fixture, "approve");
    failure = null;
    await view.lifecycle.decide(fixture, "approve");
    assert.notEqual(keys[2], keys[3]);
    await view.lifecycle.decide(fixture, "approve");
    assert.notEqual(keys[3], keys[4]);
  } finally { view.dispose(); }
});

test("stream handles chunked multibyte text, malformed lines, and trailing JSON", async () => {
  const bytes = new TextEncoder().encode('not-json\n{"type":"content","content":"caf\u00e9"}\n{"type":"execution_completed"}');
  const events: Record<string, unknown>[] = [];
  const response = new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }));
  await consumeApprovalStream(response, (event) => events.push(event), new AbortController().signal);
  assert.deepEqual(events.map((event) => event.type), ["content", "execution_completed"]);
  assert.equal(events[0].content, "caf\u00e9");
  await assert.rejects(consumeApprovalStream(new Response('{"type":"error","error":"SECRET"}'), () => {},
    new AbortController().signal), (error: Error) => !error.message.includes("SECRET"));
});

test("resume forwards only fresh content and refetches after first-event completion", async () => {
  let completed = false;
  const view = harness({
    listApprovals: async () => [{ ...fixture, status: "rejected", execution_status: completed ? "completed" : "rejected" }],
    resumeExecution: async () => { completed = true; return new Response([
      '{"type":"reasoning","content":"private"}', '{"type":"message","content":"old context"}',
      '{"type":"content","content":"foreign","conversation_id":"' + otherConversation + '"}',
      '{"type":"content","content":"fresh"}', '{"type":"execution_completed"}',
    ].join("\n")); },
  });
  try {
    await view.lifecycle.refresh();
    assert.equal(view.state.records.length, 1);
    await view.lifecycle.resume(view.state.records[0]);
    assert.deepEqual(view.content, ["fresh"]);
    assert.deepEqual(view.running, [true, false]);
    assert.deepEqual(view.state.records, []);
  } finally { view.dispose(); }
});

test("unmount aborts a blocked reader and prevents later callbacks", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  const consume = consumeApprovalStream(response, () => assert.fail("late event"), controller.signal);
  controller.abort();
  await assert.rejects(consume, { name: "AbortError" });
  assert.equal(cancelled, true);
});

test("stopResume aborts an active stream, clears running and busy, and never replays content", async () => {
  const received = deferred<void>();
  let cancelled = false;
  let resumeSignal: AbortSignal | undefined;
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  let lists = 0;
  let resumes = 0;
  const view = harness({
    listApprovals: async () => { lists += 1; return [fixture]; },
    resumeExecution: async (_executionId, signal) => {
      resumes += 1;
      resumeSignal = signal;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
          controller.enqueue(new TextEncoder().encode('{"type":"content","content":"fresh once"}\n'));
        },
        pull() { received.resolve(); },
        cancel() { cancelled = true; },
      }, { highWaterMark: 0 }));
    },
  });
  try {
    await view.lifecycle.refresh();
    const resume = view.lifecycle.resume(fixture);
    await received.promise;
    assert.deepEqual(view.content, ["fresh once"]);
    assert.deepEqual(view.running, [true]);
    assert.equal(view.state.busy, true);
    await view.lifecycle.resume(fixture);
    assert.equal(resumes, 1);
    view.lifecycle.stopResume();
    await resume;
    assert.equal(resumeSignal?.aborted, true);
    assert.equal(cancelled, true);
    assert.equal(view.state.busy, false);
    assert.deepEqual(view.running, [true, false]);
    assert.equal(lists, 2);
    assert.throws(() => streamController.enqueue(new TextEncoder().encode('{"type":"content","content":"late"}\n')));
    view.lifecycle.stopResume();
    assert.deepEqual(view.content, ["fresh once"]);
    assert.deepEqual(view.running, [true, false]);
  } finally { view.dispose(); }
});

test("completed list status removes pending approval and cancels its scheduled poll", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let lists = 0;
  let completed = false;
  const view = harness({
    listApprovals: async (conversationId) => {
      assert.equal(conversationId, conversation);
      lists += 1;
      return [{ ...fixture, execution_status: completed ? "completed" : "pending" }];
    },
    resumeExecution: async () => {
      completed = true;
      return new Response('{"type":"execution_completed"}');
    },
  });
  try {
    await view.lifecycle.refresh();
    assert.deepEqual(view.state.records, [fixture]);
    await view.lifecycle.resume(fixture);
    assert.equal(lists, 3);
    assert.deepEqual(view.state.records, []);
    assert.equal(view.state.busy, false);
    assert.equal(view.state.loading, false);
    assert.equal(view.state.error, null);
    assert.deepEqual(view.running, [true, false]);
    assert.deepEqual(view.content, []);
    context.mock.timers.tick(60000);
    await Promise.resolve();
    assert.equal(lists, 3);
    assert.deepEqual(view.state.records, []);
  } finally { view.dispose(); context.mock.timers.reset(); }
});

test("manual review is dismissible but unresolved negatives cannot be discarded", async () => {
  const negative = { ...fixture, status: "rejected", execution_status: "rejected" };
  const manual = { ...fixture, execution_status: "manual_review" };
  let snapshot = negative;
  const view = harness({ listApprovals: async () => [snapshot] });
  try {
    await view.lifecycle.refresh();
    view.lifecycle.dismiss(negative);
    assert.equal(view.state.records.length, 1);
    snapshot = manual;
    await view.lifecycle.refresh();
    view.lifecycle.dismiss(manual);
    assert.equal(view.state.records.length, 0);
    await view.lifecycle.refresh();
    assert.equal(view.state.records.length, 0);
  } finally { view.dispose(); }
});

test("notification retries an older revision and falls back to one bounded list refresh", async () => {
  let reads = 0;
  let lists = 0;
  const refreshed = deferred<void>();
  const view = harness({
    getApproval: async () => { reads += 1; return fixture; },
    listApprovals: async () => {
      lists += 1;
      refreshed.resolve();
      return [{ ...fixture, revision: 2, status: "approved", execution_status: "approved" }];
    },
  });
  try {
    view.lifecycle.notify({ type: "approval_updated", approval_id: fixture.approval_id, revision: 2, status: "approved" }, conversation);
    await refreshed.promise;
    await Promise.resolve();
    assert.equal(reads, 3);
    assert.equal(lists, 1);
    assert.equal(view.state.records[0].revision, 2);
  } finally { view.dispose(); }
});

test("completion as the first resume event still fetches fresh authoritative status", async () => {
  let resumed = false;
  const view = harness({
    resumeExecution: async () => { resumed = true; return new Response('{"type":"execution_completed","status":"completed"}'); },
    listApprovals: async () => [{ ...fixture, execution_status: resumed ? "completed" : "approved" }],
  });
  try {
    await view.lifecycle.refresh();
    await view.lifecycle.resume(view.state.records[0]);
    assert.deepEqual(view.state.records, []);
    assert.deepEqual(view.content, []);
  } finally { view.dispose(); }
});

test("raw stream transport errors are sanitized", async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error("SECRET internal URL")); } }));
  await assert.rejects(consumeApprovalStream(response, () => {}, new AbortController().signal), (error: Error) => {
    assert.match(error.message, /approval continuation/);
    assert.ok(!error.message.includes("SECRET"));
    return true;
  });
});

test("polls only live states and stops all timers on disposal", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let lists = 0;
  let snapshot = fixture;
  let requestSignal: AbortSignal | undefined;
  const view = harness({ listApprovals: async (_conversationId, signal) => {
    lists += 1;
    requestSignal = signal;
    return [snapshot];
  } });
  try {
    await view.lifecycle.refresh();
    context.mock.timers.tick(4999);
    assert.equal(lists, 1);
    context.mock.timers.tick(1);
    await Promise.resolve();
    assert.equal(lists, 2);
    snapshot = { ...fixture, execution_status: "executing" };
    await view.lifecycle.refresh();
    context.mock.timers.tick(3000);
    await Promise.resolve();
    assert.equal(lists, 4);
    snapshot = { ...fixture, status: "rejected", execution_status: "rejected" };
    await view.lifecycle.refresh();
    context.mock.timers.tick(30000);
    assert.equal(lists, 5);
    snapshot = fixture;
    await view.lifecycle.refresh();
    view.dispose();
    assert.equal(requestSignal?.aborted, true);
    context.mock.timers.tick(30000);
    assert.equal(lists, 6);
  } finally { view.dispose(); context.mock.timers.reset(); }
});

test("list recovery removes missing records without overwriting newer notification details", async () => {
  let snapshots = [fixture];
  const view = harness({ listApprovals: async () => snapshots });
  try {
    await view.lifecycle.refresh();
    snapshots = [];
    await view.lifecycle.refresh();
    assert.deepEqual(view.state.records, []);
  } finally { view.dispose(); }

  const oldList = deferred<Approval[]>();
  const detailRead = deferred<void>();
  const newer = harness({ listApprovals: () => oldList.promise,
    getApproval: async () => { detailRead.resolve(); return { ...fixture, revision: 2 }; } });
  try {
    const refresh = newer.lifecycle.refresh();
    newer.lifecycle.notify({ type: "approval_updated", approval_id: fixture.approval_id, revision: 2 }, conversation);
    await detailRead.promise;
    await Promise.resolve();
    oldList.resolve([]);
    await refresh;
    assert.equal(newer.state.records[0].revision, 2);
  } finally { newer.dispose(); }
});

test("expiration only asks the backend to recover state, and edits use optimistic concurrency", async () => {
  let gets = 0;
  const edits: unknown[] = [];
  const expired = { ...fixture, status: "expired", execution_status: "expired" };
  let snapshot = fixture;
  const view = harness({
    getApproval: async () => { gets += 1; snapshot = expired; return expired; },
    listApprovals: async () => [snapshot],
    editApproval: async (_id, request) => { edits.push(request); return fixture; },
  });
  try {
    await view.lifecycle.edit(fixture, { content: "Updated" });
    assert.deepEqual(edits, [{ expected_revision: 1, expected_hash: "hash", changes: { content: "Updated" } }]);
    await view.lifecycle.expire(fixture);
    assert.equal(gets, 1);
    assert.equal(view.state.records[0].execution_status, "expired");
  } finally { view.dispose(); }
});