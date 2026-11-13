"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import type { Approval } from "../../lib/approvals";
import { presentApproval } from "../../lib/approvalPresentation/registry";
import type { ApprovalEditField, PresentationEntry } from "../../lib/approvalPresentation/types";
import styles from "./ApprovalPanel.module.css";

export interface ApprovalPanelProps {
  approval: Approval;
  busy: boolean;
  onDecide: (approval: Approval, decision: "approve" | "reject") => void;
  onEdit: (approval: Approval, changes: Record<string, unknown>) => Promise<unknown> | void;
  onCancel: (approval: Approval) => void;
  onResume: (approval: Approval) => void;
  onExpire: (approval: Approval) => void;
  onDismiss: (approval: Approval) => void;
}

const statusLabels: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  claimed: "Claimed",
  executing: "Executing",
  resuming: "Resuming",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
  completed: "Completed",
  manual_review: "Manual review",
};

function Fields({ entries }: { entries: PresentationEntry[] }) {
  return <dl className={styles.fields}>
    {entries.map((entry, index) => <div className={styles.field} key={`${entry.path}-${index}`}>
      <dt>{entry.label}</dt>
      <dd>{entry.value}</dd>
    </div>)}
  </dl>;
}

function EditForm({ fields, disabled, onSave, onClose }: {
  fields: ApprovalEditField[];
  disabled: boolean;
  onSave: (changes: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.value])));
  return <form className={styles.form} onSubmit={(event) => {
    event.preventDefault();
    if (disabled) return;
    const changes: Record<string, unknown> = {};
    for (const field of fields) {
      const value = values[field.name];
      if (typeof value !== "string" || !value.trim() ||
        (field.kind === "select" && !field.options?.includes(value)) ||
        (field.maxLength !== undefined && value.length > field.maxLength)) return;
      if (value !== field.value) changes[field.name] = value;
    }
    if (Object.keys(changes).length) void onSave(changes);
    else onClose();
  }}>
    <fieldset disabled={disabled} className={styles.editFields}>
      <legend>Edit proposed action</legend>
      {fields.map((field) => <div className={styles.editField} key={field.name}>
        <label htmlFor={`${id}-${field.name}`}>{field.label}</label>
        {field.kind === "textarea" ? <textarea
          id={`${id}-${field.name}`} name={field.name} required
          maxLength={field.maxLength} rows={4} value={values[field.name]}
          onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
        /> : <select id={`${id}-${field.name}`} name={field.name} required
          value={values[field.name]}
          onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}>
          {field.options?.map((option) => <option key={option} value={option}>
            {option.charAt(0).toUpperCase() + option.slice(1)}
          </option>)}
        </select>}
      </div>)}
    </fieldset>
    <div className={styles.actions}>
      <button type="submit" disabled={disabled} className={styles.primary}>Save changes</button>
      <button type="button" disabled={disabled} onClick={onClose}>Discard changes</button>
    </div>
  </form>;
}

function ApprovalPanelContent({ approval, busy, onDecide, onEdit, onCancel, onResume, onExpire, onDismiss }: ApprovalPanelProps) {
  const id = useId();
  const presentation = presentApproval(approval);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const locked = useRef(false);
  const expiredNotification = useRef(false);
  const state = approval.execution_status === "pending" ? approval.status : approval.execution_status;
  const pending = approval.status === "pending" && approval.execution_status === "pending";
  const approved = approval.status === "approved" && approval.execution_status === "approved";
  const timed = pending || approved;
  const deadline = Date.parse(approval.expires_at);
  const expired = timed && (!Number.isFinite(deadline) || now >= deadline);
  const disabled = busy || submitting;
  const actionable = pending && !expired && !disabled;
  const notifyExpiry = useEffectEvent(() => {
    if (!expiredNotification.current) {
      expiredNotification.current = true;
      onExpire(approval);
    }
  });

  useEffect(() => {
    if (!timed) return;
    if (!Number.isFinite(deadline) || Date.now() >= deadline) {
      notifyExpiry();
      return;
    }
    const timer = setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (timestamp >= deadline) {
        clearInterval(timer);
        notifyExpiry();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [timed, deadline]);

  async function act(callback: () => unknown, requiresTime = false) {
    if (disabled || locked.current) return;
    if (requiresTime && (!Number.isFinite(deadline) || Date.now() >= deadline)) {
      setNow(Date.now());
      if (!expiredNotification.current) {
        expiredNotification.current = true;
        onExpire(approval);
      }
      return;
    }
    locked.current = true;
    setSubmitting(true);
    try {
      await callback();
    } catch {} finally {
      locked.current = false;
      setSubmitting(false);
    }
  }

  const knownMemory = approval.tool === "save_memory" && approval.operation === "memory.create";
  const businessFields = presentation.fields.filter((entry) => entry.path !== "target" &&
    entry.path !== "result" && !entry.path.startsWith("result."));
  const summary = businessFields.slice(0, 3);
  const detailEntries = [
    ...businessFields.slice(3),
    ...presentation.fields.filter((entry) => entry.path === "result" || entry.path.startsWith("result.")),
    ...presentation.details.filter((entry) => entry.path !== "target"),
    ...presentation.fields.filter((entry) => entry.path === "target").map((entry) => ({ ...entry, label: "Target reference" })),
    ...presentation.details.filter((entry) => entry.path === "target").map((entry) => ({ ...entry, label: "Target reference" })),
  ];
  const negative = ["rejected", "expired", "cancelled"].includes(state);
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const title = knownMemory ? "Save a memory" : presentation.title;

  return <section className={`${styles.panel}${actionable ? ` ${styles.pending}` : ""}`}
    aria-labelledby={`${id}-title`} aria-busy={disabled}>
    <header className={styles.header}>
      <h2 id={`${id}-title`}>{title}</h2>
      <span className={styles.status} role="status" aria-live="polite" aria-atomic="true">
        {expired ? "Expired" : statusLabels[state] ?? "Unknown status"}
      </span>
    </header>
    <p className={styles.destination}>{presentation.description}</p>
    {knownMemory && <p className={styles.destination}>Your account memory</p>}
    <Fields entries={summary} />
    {presentation.needsReview && <p className={styles.notice}>
      {presentation.hasHiddenFields ? "Some values are hidden. Review required." : "Review required."}
    </p>}
    <details className={styles.details}>
      <summary>Details</summary>
      <p>{presentation.effect}</p>
      <Fields entries={detailEntries} />
    </details>
    {timed && <p className={styles.expiry} aria-live="off" suppressHydrationWarning>
      {expired ? "Awaiting confirmed expiry status" : `Expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
    </p>}
    {pending && !expired && editing ? <EditForm
      key={`${approval.revision}-${approval.arguments_hash}`}
      fields={presentation.editableFields} disabled={disabled}
      onClose={() => { if (!disabled) setEditing(false); }}
      onSave={async (changes) => {
        await act(async () => { await onEdit(approval, changes); setEditing(false); }, true);
      }}
    /> : <div className={styles.actions}>
      {pending && !expired && <>
        <button type="button" className={styles.primary} disabled={disabled}
          onClick={() => { void act(() => onDecide(approval, "approve"), true); }}>Approve</button>
        <button type="button" disabled={disabled}
          onClick={() => { void act(() => onDecide(approval, "reject"), true); }}>Reject</button>
        {presentation.editableFields.length > 0 && <button type="button" disabled={disabled}
          onClick={() => { void act(() => setEditing(true), true); }}>Edit</button>}
        <button type="button" disabled={disabled}
          onClick={() => { void act(() => onCancel(approval), true); }}>Cancel</button>
      </>}
      {approved && !expired && <>
        <button type="button" className={styles.primary} disabled={disabled}
          onClick={() => { void act(() => onResume(approval), true); }}>Run approved action</button>
        <button type="button" disabled={disabled}
          onClick={() => { void act(() => onCancel(approval), true); }}>Cancel</button>
      </>}
      {negative && <>
        <button type="button" disabled={disabled}
          onClick={() => { void act(() => onResume(approval)); }}>Continue conversation</button>
      </>}
      {(state === "manual_review" || state === "completed") && <button type="button" disabled={disabled}
        onClick={() => { void act(() => onDismiss(approval)); }}>Dismiss</button>}
    </div>}
  </section>;
}

export function ApprovalPanel(props: ApprovalPanelProps) {
  return <ApprovalPanelContent
    key={`${props.approval.approval_id}-${props.approval.revision}-${props.approval.expires_at}`}
    {...props}
  />;
}

export default ApprovalPanel;