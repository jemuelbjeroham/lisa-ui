import type { Approval } from "../approvals";
import type { ApprovalEditField, ApprovalPresentation, PresentationEntry } from "./types";

export const MEMORY_TYPES = ["fact", "preference", "instruction", "episodic", "project"] as const;
export const MEMORY_SCOPES = ["user", "project"] as const;

const MAX_ENTRIES = 80;
const MAX_DEPTH = 5;
const PREVIEW_LENGTH = 240;
const DETAIL_LENGTH = 4000;
const secretKey = /token|password|passwd|secret|authorization|authentication|auth|capability|credential|cookie|session|apikey|privatekey|internal|metadata|argumentshash|payloadhash|decisionkey|executionid|approvalid|policyversion|schemaversion/i;

const formatters = new Map([
  ["save_memory:memory.create", {
    title: "Save a memory",
    description: "LISA wants to remember this information for future conversations.",
    effect: "Stores the information with the type and scope shown below. An equivalent memory may already exist; no duplicate is created in that case.",
  }],
  ["create_jira_ticket:jira.create", {
    title: "Create a Jira ticket",
    description: "Create a ticket at the resolved Jira destination.",
    effect: "Creates the exact prepared request shown below. The on-air destination will not be resolved again during execution.",
  }],
  ["update_jira_ticket:jira.comment", {
    title: "Add a Jira comment",
    description: "Append a comment to the resolved Jira issue.",
    effect: "Adds the prepared comment once. Does not replace the issue description or change its status.",
  }],
  ["close_ticket:jira.close", {
    title: "Close a Jira ticket",
    description: "Apply the resolved close transition to the Jira issue.",
    effect: "Runs only the prepared transition and verifies Closed status. An already-closed issue requires no transition.",
  }],
]);

function humanize(value: string): string {
  return safeText(value).text.replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/[_\-.]+/g, " ").trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function safeText(value: string): { text: string; redacted: boolean } {
  let redacted = false;
  const text = value.replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s<>"']+|\/\/[^\s<>"']+/gi, () => {
    redacted = true;
    return "[URL hidden]";
  }).replace(/\b(?:bearer|basic)\s+[a-z\d+/_.=:-]+/gi, () => {
    redacted = true;
    return "[Credential hidden]";
  }).replace(/\b(?:[a-z\d-]+\.)+(?:internal|local|localhost|svc|cluster\.local)(?::\d+)?(?:\/[^\s<>"']*)?/gi, () => {
    redacted = true;
    return "[Internal address hidden]";
  }).replace(/\b(?:localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?(?:\/[^\s<>"']*)?/gi, () => {
    redacted = true;
    return "[Internal address hidden]";
  });
  return { text, redacted };
}

export function presentApproval(approval: Approval): ApprovalPresentation {
  const fields: PresentationEntry[] = [];
  const details: PresentationEntry[] = [];
  let hasHiddenFields = false;
  let needsReview = false;
  let visited = 0;
  const ancestors = new WeakSet<object>();
  const formatter = formatters.get(`${approval.tool}:${approval.operation}`);
  const known = formatter !== undefined;

  function add(path: string, label: string, value: string, hidden = false) {
    const safe = safeText(value);
    const safeLabel = safeText(label);
    const safePath = safeText(path);
    const redacted = hidden || safe.redacted || safeLabel.redacted || safePath.redacted;
    hasHiddenFields ||= redacted;
    needsReview ||= redacted;
    const boundedLabel = safeLabel.text.slice(0, PREVIEW_LENGTH);
    const boundedPath = safePath.text.slice(0, PREVIEW_LENGTH);
    const truncated = safe.text.length > PREVIEW_LENGTH || safeLabel.text.length > PREVIEW_LENGTH || safePath.text.length > PREVIEW_LENGTH;
    fields.push({ path: boundedPath, label: boundedLabel, value: safe.text.length > PREVIEW_LENGTH
      ? `${safe.text.slice(0, PREVIEW_LENGTH)}... [See details]` : safe.text, redacted, truncated });
    if (truncated) {
      const omitted = safe.text.length > DETAIL_LENGTH;
      details.push({ path: boundedPath, label: boundedLabel,
        value: omitted ? `${safe.text.slice(0, DETAIL_LENGTH)}... [Additional content hidden; review required]` : safe.text,
        redacted, truncated: omitted });
      hasHiddenFields ||= omitted || safeLabel.text.length > PREVIEW_LENGTH || safePath.text.length > PREVIEW_LENGTH;
      needsReview ||= hasHiddenFields;
    }
  }

  function visit(value: unknown, path: string, label: string, depth: number): void {
    if (visited >= MAX_ENTRIES) return;
    visited += 1;
    if (secretKey.test(path.replace(/[^a-z\d]/gi, ""))) {
      add(path, "Protected field", "[Sensitive value hidden; review required]", true);
      return;
    }
    if (value === null || typeof value !== "object") {
      add(path, label, value === null ? "None" : value === undefined ? "Not provided" : String(value));
      return;
    }
    if (depth >= MAX_DEPTH || ancestors.has(value)) {
      add(path, label, "[Nested content hidden; review required]", true);
      return;
    }
    ancestors.add(value);
    const entries = Object.entries(value);
    if (!entries.length) add(path, label, Array.isArray(value) ? "Empty list" : "Empty object");
    for (let index = 0; index < entries.length; index += 1) {
      if (visited >= MAX_ENTRIES) {
        add(path, label, `[${entries.length - index} additional fields hidden; review required]`, true);
        break;
      }
      const [key, child] = entries[index];
      visit(child, `${path}.${key}`, `${label} / ${Array.isArray(value) ? Number(key) + 1 : humanize(key)}`, depth + 1);
    }
    ancestors.delete(value);
  }

  if (!known) {
    add("tool", "Tool", approval.tool);
    add("operation", "Operation", approval.operation);
  }
  for (const [key, value] of Object.entries(approval.arguments)) {
    if (visited >= MAX_ENTRIES) {
      add("arguments", "Additional arguments", "[Additional fields hidden; review required]", true);
      break;
    }
    visit(value, `arguments.${key}`, humanize(key), 0);
  }
  if (!fields.length) add("arguments", "Arguments", "No arguments provided");

  const jira = approval.operation.startsWith("jira.") && known;
  if (jira) {
    const effective = approval.effective_operation;
    if (!effective || effective.tool_name !== approval.tool) {
      add("effective_operation", "Prepared Jira request", "Unavailable; review required", true);
    } else {
      try {
        const destination = new URL(String(effective.destination));
        if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password || destination.search || destination.hash) throw new Error();
        add("jira_destination", "Jira destination", destination.host + destination.pathname);
      } catch {
        add("jira_destination", "Jira destination", "Invalid destination; review required", true);
      }
      if (effective.ticket_key) add("jira_issue", "Resolved issue", String(effective.ticket_key));
      if (effective.noop === true) add("jira_noop", "Status", "Already closed; no transition");
      visit(effective.payload, "jira_payload", "Prepared Jira payload", 0);
    }
  }

  const editableFields: ApprovalEditField[] = [];
  if (known) {
    const definitions: ApprovalEditField[] = jira ? [
      { name: "subject", label: "Subject", kind: "textarea", value: "", maxLength: 243 },
      { name: "description", label: "Description", kind: "textarea", value: "", maxLength: 32767 },
      { name: "comment", label: "Comment", kind: "textarea", value: "", maxLength: 32767 },
      { name: "core", label: "Core", kind: "textarea", value: "", maxLength: 255 },
      { name: "side", label: "Side", kind: "select", value: "", options: ["x", "y", "both"] },
      { name: "department", label: "Department", kind: "select", value: "", options: ["DC NOC", "Stamford Ops", "DNOC"] },
      { name: "onair_core", label: "On-air core", kind: "textarea", value: "", maxLength: 255 },
    ].filter((field) => approval.editable_fields.includes(field.name)) as ApprovalEditField[] : [
      { name: "content", label: "Content", kind: "textarea", value: "", maxLength: 32000 },
      { name: "memory_type", label: "Memory type", kind: "select", value: "", options: MEMORY_TYPES },
      { name: "scope", label: "Scope", kind: "select", value: "", options: MEMORY_SCOPES },
    ];
    for (const definition of definitions) {
      const value = approval.arguments[definition.name];
      const valid = typeof value === "string" && (definition.options
        ? definition.options.includes(value) : value.trim().length > 0 && value.length <= 32000);
      if (!valid && !(jira && definition.name === "onair_core" && value == null)) needsReview = true;
      if (valid && approval.editable_fields.includes(definition.name) && approval.status === "pending" &&
        approval.execution_status === "pending" && !safeText(value).redacted) {
        editableFields.push({ ...definition, value });
      }
    }
    if (!jira && Object.keys(approval.arguments).some((key) => !definitions.some((definition) => definition.name === key))) needsReview = true;
  } else {
    needsReview = true;
  }
  if (approval.editable_fields.some((key) => !editableFields.some((field) => field.name === key))) {
    details.push({ path: "editable_fields", label: "Editing", value: "Some supplied fields are not available for editing. Review required." });
  }
  add("target", "Target", approval.target);
  if (approval.result !== null) {
    if (visited >= MAX_ENTRIES) add("result", "Result", "[Result hidden; review required]", true);
    else visit(approval.result, "result", "Result", 0);
  }

  return {
    title: formatter?.title ?? "Review requested action",
    description: formatter?.description ?? "LISA is requesting permission to run an operation. Review its parameters and target before deciding.",
    effect: formatter?.effect ?? "The effect of this operation requires review; it cannot be determined safely from these parameters alone.",
    fields, details, editableFields, hasHiddenFields, needsReview,
  };
}