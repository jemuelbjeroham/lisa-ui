import type { Approval, ApprovalDecisionRequest, EditApprovalRequest } from "./approvals";

export type ApprovalDecision = "approve" | "reject";
export type ApprovalEvent = Record<string, unknown>;

export interface ApprovalLifecycleState {
  records: Approval[];
  loading: boolean;
  busy: boolean;
  error: string | null;
}

export interface ApprovalLifecycleApi {
  listApprovals(conversationId: string, signal: AbortSignal): Promise<Approval[]>;
  getApproval(id: string, signal: AbortSignal): Promise<Approval>;
  editApproval(id: string, request: EditApprovalRequest, signal: AbortSignal): Promise<Approval>;
  decideApproval(id: string, request: ApprovalDecisionRequest, signal: AbortSignal): Promise<Approval>;
  cancelExecution(id: string, signal: AbortSignal): Promise<Approval>;
  resumeExecution(id: string, signal: AbortSignal): Promise<Response>;
}

export interface ApprovalLifecycleOptions {
  api: ApprovalLifecycleApi;
  isActive(): boolean;
  onChange(state: ApprovalLifecycleState): void;
  onResumeContent(text: string): void;
  onResumeState?(running: boolean): void;
  errorMessage(error: unknown): string;
  isConflict(error: unknown): boolean;
  createKey(): string;
  notificationRetryMs?: number;
}

const notificationTypes = new Set([
  "approval_required", "approval_updated", "tool_execution_status",
  "execution_suspended", "execution_completed",
]);
const activeExecutionStates = new Set(["claimed", "executing", "resuming"]);
const negativeStates = new Set(["rejected", "expired", "cancelled"]);

export class ApprovalStreamError extends Error {
  constructor() {
    super("The approval continuation could not be completed. Please refresh its status before trying again.");
    this.name = "ApprovalStreamError";
  }
}

export function normalizeApprovalId(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
    ? value.trim().toLowerCase() : null;
}

export function approvalVisible(approval: Approval): boolean {
  return approval.execution_status !== "completed" && (
    ["pending", "approved", "manual_review"].includes(approval.execution_status) ||
    activeExecutionStates.has(approval.execution_status) || negativeStates.has(approval.execution_status)
  );
}

export function approvalPollDelay(records: Approval[]): number | null {
  if (records.some((approval) => activeExecutionStates.has(approval.execution_status))) return 3000;
  return records.some((approval) => ["pending", "approved"].includes(approval.execution_status)) ? 5000 : null;
}

export function approvalNotification(event: ApprovalEvent, conversationId: string, sourceConversationId: string) {
  const conversation = normalizeApprovalId(conversationId);
  if (!conversation || normalizeApprovalId(sourceConversationId) !== conversation ||
    ("conversation_id" in event &&
      normalizeApprovalId(event.conversation_id) !== conversation) ||
    typeof event.type !== "string" || !notificationTypes.has(event.type)) return null;
  const approvalId = normalizeApprovalId(event.approval_id);
  const executionId = normalizeApprovalId(event.execution_id);
  const eventId = typeof event.event_id === "string" && event.event_id.trim()
    ? normalizeApprovalId(event.event_id) ?? event.event_id.trim() : null;
  const revision = typeof event.revision === "number" && Number.isSafeInteger(event.revision) && event.revision > 0
    ? event.revision : null;
  const status = typeof event.status === "string" ? event.status : null;
  const stableId = eventId ?? approvalId ?? executionId;
  return { approvalId, executionId, revision, status, type: event.type, key: stableId
    ? JSON.stringify([stableId, event.type, revision, status]) : null };
}

export async function consumeApprovalStream(
  response: Response,
  onEvent: (event: ApprovalEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!response.ok || !response.body) throw new ApprovalStreamError();
  signal.throwIfAborted();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const emit = (line: string) => {
    signal.throwIfAborted();
    let event: unknown;
    try { event = JSON.parse(line); } catch { return; }
    if (!event || typeof event !== "object" || Array.isArray(event)) return;
    const value = event as ApprovalEvent;
    if (value.type === "error") {
      throw new ApprovalStreamError();
    }
    onEvent(value);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        emit(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (done) break;
    }
    if (buffer.trim()) emit(buffer);
  } catch (caught) {
    signal.throwIfAborted();
    if (caught instanceof ApprovalStreamError) throw caught;
    throw new ApprovalStreamError();
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createApprovalLifecycle(conversationId: string, options: ApprovalLifecycleOptions) {
  const conversation = normalizeApprovalId(conversationId);
  const controller = new AbortController();
  const { signal } = controller;
  const snapshots = new Map<string, Approval>();
  const versions = new Map<string, number>();
  const seen = new Set<string>();
  const dismissed = new Set<string>();
  const decisionKeys = new Map<string, string>();
  const notificationJobs = new Map<string, Promise<void>>();
  let clock = 0;
  let reads = 0;
  let busy = false;
  let resumeController: AbortController | null = null;
  let error: string | null = null;
  let poll: ReturnType<typeof setTimeout> | undefined;
  const active = () => !signal.aborted && options.isActive();
  const signature = (approval: Approval) => JSON.stringify([
    approval.approval_id, approval.revision, approval.status, approval.execution_status,
  ]);
  const records = () => [...snapshots.values()].filter((approval) =>
    approvalVisible(approval) && !dismissed.has(signature(approval)));
  const publish = () => {
    if (active()) options.onChange({ records: records(), loading: reads > 0, busy, error });
  };
  const accept = (approval: Approval, version: number, expectedId?: string, expectedExecution?: string) => {
    const id = normalizeApprovalId(approval.approval_id);
    const executionId = normalizeApprovalId(approval.execution_id);
    if (!active() || !id || !executionId || normalizeApprovalId(approval.conversation_id) !== conversation ||
      (expectedId && id !== expectedId) ||
      (expectedExecution && executionId !== expectedExecution)) return false;
    const previous = snapshots.get(id);
    if ((versions.get(id) ?? 0) > version || (previous && previous.revision > approval.revision)) return false;
    versions.set(id, version);
    snapshots.set(id, { ...approval, approval_id: id, execution_id: executionId, conversation_id: conversation! });
    return true;
  };
  const schedule = () => {
    clearTimeout(poll);
    if (!active()) return;
    const delay = approvalPollDelay([...snapshots.values()]);
    if (delay !== null) poll = setTimeout(() => { void refresh(); }, delay);
  };
  const refresh = async () => {
    if (!active() || !conversation) return;
    const version = ++clock;
    reads += 1;
    publish();
    try {
      const approvals = await options.api.listApprovals(conversation, signal);
      if (!active()) return;
      if (!busy) error = null;
      const listedIds = new Set(approvals.filter((approval) => normalizeApprovalId(approval.conversation_id) === conversation)
        .map((approval) => normalizeApprovalId(approval.approval_id)));
      for (const id of snapshots.keys()) {
        if (!listedIds.has(id) && (versions.get(id) ?? 0) <= version) {
          snapshots.delete(id);
          versions.set(id, version);
        }
      }
      for (const approval of approvals) accept(approval, version);
    } catch (caught) {
      if (active()) error = options.errorMessage(caught);
    } finally {
      reads -= 1;
      publish();
      schedule();
    }
  };
  const wait = (milliseconds: number) => new Promise<void>((resolve) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
  const fetchNotification = async (id: string, notification: NonNullable<ReturnType<typeof approvalNotification>>) => {
    for (let attempt = 0; attempt < 3 && active(); attempt += 1) {
      const version = ++clock;
      try {
        const approval = await options.api.getApproval(id, signal);
        if (!active()) return;
        const visible = (notification.revision === null || approval.revision >= notification.revision) &&
          (!(notification.type === "approval_required" || notification.type === "approval_updated") ||
            !notification.status || approval.status === notification.status ||
            (notification.revision !== null && approval.revision > notification.revision) ||
            approval.execution_status === "completed") &&
          (notification.type !== "execution_completed" || notification.status !== "completed" ||
            approval.execution_status === "completed");
        if (accept(approval, version, id)) {
          publish();
          schedule();
          if (visible) return;
        }
      } catch (caught) {
        if (!active()) return;
        if (attempt === 2) error = options.errorMessage(caught);
      }
      if (attempt < 2) await wait(options.notificationRetryMs ?? 250 * (attempt + 1));
    }
    if (active()) await refresh();
  };
  const notify = (event: ApprovalEvent, sourceConversationId: string): boolean => {
    if (!active()) return false;
    const notification = approvalNotification(event, conversationId, sourceConversationId);
    if (!notification) return false;
    if (notification.key && seen.has(notification.key)) return true;
    if (notification.key) seen.add(notification.key);
    const id = notification.approvalId ?? [...snapshots.values()].find((approval) =>
      normalizeApprovalId(approval.execution_id) === notification.executionId)?.approval_id;
    const jobKey = notification.key ?? id ?? "list";
    if (!notificationJobs.has(jobKey)) {
      const job = id ? fetchNotification(id, notification) : refresh();
      notificationJobs.set(jobKey, job);
      void job.finally(() => notificationJobs.delete(jobKey));
    }
    return true;
  };
  const mutate = async (approval: Approval, action: () => Promise<Approval | void>) => {
    if (!active() || busy || normalizeApprovalId(approval.conversation_id) !== conversation ||
      !normalizeApprovalId(approval.approval_id) || !normalizeApprovalId(approval.execution_id)) return;
    busy = true;
    error = null;
    publish();
    const version = ++clock;
    try {
      const updated = await action();
      if (updated) accept(updated, version, normalizeApprovalId(approval.approval_id)!, normalizeApprovalId(approval.execution_id)!);
    } catch (caught) {
      if (active()) error = options.errorMessage(caught);
    } finally {
      if (active()) {
        await refresh();
        busy = false;
        publish();
        schedule();
      }
    }
  };
  return {
    refresh,
    notify,
    decide: (approval: Approval, decision: ApprovalDecision) => mutate(approval, async () => {
      const identity = JSON.stringify([approval.approval_id, approval.revision, approval.arguments_hash, decision]);
      let key = decisionKeys.get(identity);
      if (!key) { key = options.createKey(); decisionKeys.set(identity, key); }
      try {
        const updated = await options.api.decideApproval(approval.approval_id, {
          revision_number: approval.revision, payload_hash: approval.arguments_hash,
          decision, decision_key: key,
        }, signal);
        decisionKeys.delete(identity);
        return updated;
      } catch (caught) {
        if (options.isConflict(caught)) decisionKeys.delete(identity);
        throw caught;
      }
    }),
    edit: (approval: Approval, changes: Record<string, unknown>) => mutate(approval, () => options.api.editApproval(
      approval.approval_id, { expected_revision: approval.revision, expected_hash: approval.arguments_hash, changes }, signal,
    )),
    cancel: (approval: Approval) => mutate(approval, () => options.api.cancelExecution(approval.execution_id, signal)),
    expire: (approval: Approval) => mutate(approval, () => options.api.getApproval(approval.approval_id, signal)),
    resume: (approval: Approval) => mutate(approval, async () => {
      resumeController = new AbortController();
      const resumeSignal = AbortSignal.any([signal, resumeController.signal]);
      if (active()) options.onResumeState?.(true);
      try {
        const response = await options.api.resumeExecution(approval.execution_id, resumeSignal);
        if (!active()) { await response.body?.cancel(); return; }
        await consumeApprovalStream(response, (event) => {
          if (!active() || ("conversation_id" in event &&
            normalizeApprovalId(event.conversation_id) !== conversation)) return;
          if (event.type === "content" && typeof event.content === "string") options.onResumeContent(event.content);
          else notify(event, conversationId);
        }, resumeSignal);
      } catch (caught) {
        if (caught instanceof ApprovalStreamError) {
          if (active()) error = caught.message;
        } else throw caught;
      } finally {
        resumeController = null;
        if (active()) options.onResumeState?.(false);
      }
    }),
    dismiss: (approval: Approval) => {
      if (!active() || normalizeApprovalId(approval.conversation_id) !== conversation ||
        (approval.execution_status !== "manual_review" && approvalVisible(approval))) return;
      dismissed.add(signature(approval));
      publish();
    },
    dispose: () => { controller.abort(); clearTimeout(poll); },
    stopResume: () => { resumeController?.abort(); },
  };
}

export type ApprovalLifecycle = ReturnType<typeof createApprovalLifecycle>;