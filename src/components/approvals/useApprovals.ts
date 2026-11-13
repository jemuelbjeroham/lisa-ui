"use client";

import { useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import * as api from "../../lib/approvals";
import {
  createApprovalLifecycle,
  normalizeApprovalId,
  type ApprovalLifecycle,
  type ApprovalLifecycleState,
} from "../../lib/approval-lifecycle";

export interface UseApprovalsOptions {
  onResumeContent: (text: string) => void;
  onResumeState?: (running: boolean) => void;
}

export interface UseApprovalsResult extends ApprovalLifecycleState {
  notify(event: Record<string, unknown>, sourceConversationId: string): boolean;
  refresh(): Promise<void>;
  decide(approval: api.Approval, decision: "approve" | "reject"): Promise<void>;
  edit(approval: api.Approval, changes: Record<string, unknown>): Promise<void>;
  cancel(approval: api.Approval): Promise<void>;
  resume(approval: api.Approval): Promise<void>;
  expire(approval: api.Approval): Promise<void>;
  dismiss(approval: api.Approval): void;
  stopResume(): void;
}

const empty: ApprovalLifecycleState = { records: [], loading: false, busy: false, error: null };

export function useApprovals(conversationId: string, options: UseApprovalsOptions): UseApprovalsResult {
  const conversation = normalizeApprovalId(conversationId);
  const lifecycle = useRef<{ conversation: string; value: ApprovalLifecycle } | null>(null);
  const [state, setState] = useState<{ conversation: string; value: ApprovalLifecycleState } | null>(null);
  const onContent = useEffectEvent((text: string) => options.onResumeContent(text));
  const onRunning = useEffectEvent((running: boolean) => options.onResumeState?.(running));

  useLayoutEffect(() => {
    if (!conversation) return;
    const value = createApprovalLifecycle(conversation, {
      api,
      isActive: () => lifecycle.current?.value === value,
      onChange: (next) => setState({ conversation, value: next }),
      onResumeContent: onContent,
      onResumeState: onRunning,
      errorMessage: (error) => error instanceof api.ApprovalApiError
        ? error.message : new api.ApprovalApiError("unavailable").message,
      isConflict: (error) => error instanceof api.ApprovalApiError && (error.status === 409 || error.status === 410),
      createKey: () => crypto.randomUUID(),
    });
    lifecycle.current = { conversation, value };
    void value.refresh();
    return () => {
      value.dispose();
      if (lifecycle.current?.value === value) lifecycle.current = null;
    };
  }, [conversation]);

  const active = () => lifecycle.current?.conversation === conversation ? lifecycle.current.value : null;
  return {
    ...(state?.conversation === conversation ? state.value : { ...empty, loading: !!conversation }),
    notify: (event, sourceConversationId) => active()?.notify(event, sourceConversationId) ?? false,
    refresh: async () => { await active()?.refresh(); },
    decide: async (approval, decision) => { await active()?.decide(approval, decision); },
    edit: async (approval, changes) => { await active()?.edit(approval, changes); },
    cancel: async (approval) => { await active()?.cancel(approval); },
    resume: async (approval) => { await active()?.resume(approval); },
    expire: async (approval) => { await active()?.expire(approval); },
    dismiss: (approval) => { active()?.dismiss(approval); },
    stopResume: () => { active()?.stopResume(); },
  };
}