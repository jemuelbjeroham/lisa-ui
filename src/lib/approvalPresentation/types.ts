export interface PresentationEntry {
  label: string;
  value: string;
  path: string;
  redacted?: boolean;
  truncated?: boolean;
}

export interface ApprovalEditField {
  name: string;
  label: string;
  kind: "textarea" | "select";
  value: string;
  options?: readonly string[];
  maxLength?: number;
}

export interface ApprovalPresentation {
  title: string;
  description: string;
  effect: string;
  fields: PresentationEntry[];
  details: PresentationEntry[];
  editableFields: ApprovalEditField[];
  hasHiddenFields: boolean;
  needsReview: boolean;
}

export type { Approval } from "../approvals";