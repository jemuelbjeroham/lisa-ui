import { getApiBaseUrl } from "./api-url";

export interface Approval {
  approval_id: string;
  execution_id: string;
  conversation_id: string;
  tool: string;
  operation: string;
  status: string;
  execution_status: string;
  revision: number;
  arguments_hash: string;
  arguments: Record<string, unknown>;
  target: string;
  expires_at: string;
  created_at: string;
  editable_fields: string[];
  result: Record<string, unknown> | null;
  effective_operation?: Record<string, unknown> | null;
}

export interface EditApprovalRequest {
  expected_revision: number;
  expected_hash: string;
  changes: Record<string, unknown>;
}

export interface ApprovalDecisionRequest {
  revision_number: number;
  payload_hash: string;
  decision: "approve" | "reject";
  decision_key: string;
}

export class ApprovalApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number = 0,
  ) {
    super(Object.hasOwn(errorMessages, code) ? errorMessages[code] : "The approval request could not be completed. Please try again.");
    this.name = "ApprovalApiError";
  }
}

const errorMessages: Record<string, string> = {
  invalid_response: "The approval response was invalid. Please refresh and try again.",
  invalid_request: "Check the approval changes and try again.",
  stale_revision: "This approval has changed. Refresh it before deciding.",
  approval_expired: "This approval has expired. Request a new proposal.",
  approval_not_pending: "This approval is no longer awaiting a decision.",
  decision_conflict: "A decision has already been recorded. Refresh the approval.",
  execution_already_claimed: "Execution has already started and cannot be cancelled.",
  not_found: "This approval is no longer available.",
  unauthenticated: "Please sign in again to review approvals.",
  forbidden: "You do not have permission to perform this approval action.",
  unavailable: "Approvals are temporarily unavailable. Please try again.",
  network_error: "Unable to reach approvals. Check your connection and try again.",
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeApproval(value: unknown): Approval {
  const requiredStrings = [
    "approval_id", "execution_id", "conversation_id", "tool", "operation",
    "status", "execution_status", "arguments_hash", "target", "expires_at", "created_at",
  ] as const;
  if (
    !record(value) ||
    requiredStrings.some((key) => typeof value[key] !== "string" || !value[key].trim()) ||
    !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 ||
    !record(value.arguments) ||
    !Array.isArray(value.editable_fields) ||
    !value.editable_fields.every((field) => typeof field === "string" && field.length > 0) ||
    !(value.result === null || record(value.result)) ||
    !Number.isFinite(Date.parse(value.created_at as string)) ||
    !Number.isFinite(Date.parse(value.expires_at as string))
  ) {
    throw new ApprovalApiError("invalid_response");
  }
  return {
    approval_id: value.approval_id as string,
    execution_id: value.execution_id as string,
    conversation_id: value.conversation_id as string,
    tool: value.tool as string,
    operation: value.operation as string,
    status: value.status as string,
    execution_status: value.execution_status as string,
    revision: value.revision as number,
    arguments_hash: value.arguments_hash as string,
    arguments: { ...value.arguments },
    target: value.target as string,
    expires_at: value.expires_at as string,
    created_at: value.created_at as string,
    editable_fields: [...value.editable_fields] as string[],
    result: value.result === null ? null : { ...value.result },
    effective_operation: record(value.effective_operation) ? { ...value.effective_operation } : null,
  };
}

async function request(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<Response> {
  try {
    const baseUrl = await getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      signal,
      ...(body === undefined ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
    if (!response.ok) {
      let code = response.status === 401 ? "unauthenticated"
        : response.status === 403 ? "forbidden"
        : response.status === 404 ? "not_found"
        : response.status === 410 ? "approval_expired"
        : response.status === 422 ? "invalid_request"
        : response.status >= 500 ? "unavailable" : "request_failed";
      try {
        const error: unknown = await response.json();
        if (record(error) && typeof error.detail === "string" &&
          Object.hasOwn(errorMessages, error.detail) && response.status !== 401 && response.status !== 403) {
          code = error.detail;
        }
      } catch {}
      throw new ApprovalApiError(code, response.status);
    }
    return response;
  } catch (error: unknown) {
    if (error instanceof ApprovalApiError || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new ApprovalApiError("network_error");
  }
}

async function approvalRequest(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<Approval> {
  const response = await request(path, method, body, signal);
  try {
    const value: unknown = await response.json();
    return normalizeApproval(value);
  } catch {
    throw new ApprovalApiError("invalid_response", response.status);
  }
}

export function getApproval(approvalId: string, signal?: AbortSignal): Promise<Approval> {
  return approvalRequest(`/approvals/${encodeURIComponent(approvalId)}`, "GET", undefined, signal);
}

export async function listApprovals(conversationId: string, signal?: AbortSignal): Promise<Approval[]> {
  const response = await request(`/approvals?${new URLSearchParams({ conversation_id: conversationId })}`, "GET", undefined, signal);
  try {
    const value: unknown = await response.json();
    if (!Array.isArray(value)) throw new ApprovalApiError("invalid_response");
    return value.map(normalizeApproval);
  } catch {
    throw new ApprovalApiError("invalid_response", response.status);
  }
}

export function editApproval(approvalId: string, edit: EditApprovalRequest, signal?: AbortSignal): Promise<Approval> {
  return approvalRequest(`/approvals/${encodeURIComponent(approvalId)}`, "PATCH", {
    expected_revision: edit.expected_revision,
    expected_hash: edit.expected_hash,
    changes: edit.changes,
  }, signal);
}

export function decideApproval(approvalId: string, decision: ApprovalDecisionRequest, signal?: AbortSignal): Promise<Approval> {
  if (typeof decision.decision_key !== "string" || !decision.decision_key.length || decision.decision_key.length > 128) {
    return Promise.reject(new ApprovalApiError("invalid_request"));
  }
  return approvalRequest(`/approvals/${encodeURIComponent(approvalId)}/decision`, "POST", {
    revision_number: decision.revision_number,
    payload_hash: decision.payload_hash,
    decision: decision.decision,
    decision_key: decision.decision_key,
  }, signal);
}

export function cancelExecution(executionId: string, signal?: AbortSignal): Promise<Approval> {
  return approvalRequest(`/executions/${encodeURIComponent(executionId)}/cancel`, "POST", undefined, signal);
}

export function getExecutionStatus(executionId: string, signal?: AbortSignal): Promise<Approval> {
  return approvalRequest(`/executions/${encodeURIComponent(executionId)}`, "GET", undefined, signal);
}

export function resumeExecution(executionId: string, signal?: AbortSignal): Promise<Response> {
  return request(`/executions/${encodeURIComponent(executionId)}/resume`, "POST", undefined, signal);
}