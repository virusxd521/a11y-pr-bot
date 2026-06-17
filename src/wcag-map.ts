import type { Severity } from "./types";

// jsx-a11y ruleId -> WCAG success criterion + default severity.
// Severities follow axe-core impact conventions where the rules overlap.
const RULE_WCAG: Record<string, { wcag: string; severity: Severity }> = {
  "jsx-a11y/alt-text": { wcag: "1.1.1", severity: "critical" },
  "jsx-a11y/anchor-has-content": { wcag: "2.4.4", severity: "serious" },
  "jsx-a11y/anchor-is-valid": { wcag: "2.1.1", severity: "serious" },
  "jsx-a11y/aria-activedescendant-has-tabindex": { wcag: "4.1.2", severity: "serious" },
  "jsx-a11y/aria-props": { wcag: "4.1.2", severity: "serious" },
  "jsx-a11y/aria-proptypes": { wcag: "4.1.2", severity: "serious" },
  "jsx-a11y/aria-role": { wcag: "4.1.2", severity: "serious" },
  "jsx-a11y/aria-unsupported-elements": { wcag: "4.1.2", severity: "serious" },
  "jsx-a11y/autocomplete-valid": { wcag: "1.3.5", severity: "moderate" },
  "jsx-a11y/click-events-have-key-events": { wcag: "2.1.1", severity: "serious" },
  "jsx-a11y/heading-has-content": { wcag: "1.3.1", severity: "serious" },
  "jsx-a11y/html-has-lang": { wcag: "3.1.1", severity: "serious" },
  "jsx-a11y/iframe-has-title": { wcag: "2.4.1", severity: "serious" },
  "jsx-a11y/img-redundant-alt": { wcag: "1.1.1", severity: "minor" },
  "jsx-a11y/interactive-supports-focus": { wcag: "2.1.1", severity: "serious" },
  "jsx-a11y/label-has-associated-control": { wcag: "3.3.2", severity: "critical" },
  "jsx-a11y/media-has-caption": { wcag: "1.2.2", severity: "serious" },
  "jsx-a11y/mouse-events-have-key-events": { wcag: "2.1.1", severity: "serious" },
  "jsx-a11y/no-access-key": { wcag: "2.1.1", severity: "minor" },
  "jsx-a11y/no-autofocus": { wcag: "2.4.3", severity: "moderate" },
  "jsx-a11y/no-distracting-elements": { wcag: "2.2.2", severity: "serious" },
  "jsx-a11y/no-interactive-element-to-noninteractive-role": { wcag: "4.1.2", severity: "moderate" },
  "jsx-a11y/no-noninteractive-element-interactions": { wcag: "4.1.2", severity: "moderate" },
  "jsx-a11y/no-noninteractive-element-to-interactive-role": { wcag: "4.1.2", severity: "moderate" },
  "jsx-a11y/no-noninteractive-tabindex": { wcag: "4.1.2", severity: "moderate" },
  "jsx-a11y/no-redundant-roles": { wcag: "4.1.2", severity: "minor" },
  "jsx-a11y/no-static-element-interactions": { wcag: "4.1.2", severity: "serious" },
  "jsx-a11y/role-has-required-aria-props": { wcag: "4.1.2", severity: "serious" },
  "jsx-a11y/role-supports-aria-props": { wcag: "4.1.2", severity: "serious" },
  "jsx-a11y/scope": { wcag: "1.3.1", severity: "moderate" },
  "jsx-a11y/tabindex-no-positive": { wcag: "2.4.3", severity: "moderate" },
};

export const wcagForRule = (ruleId: string): { wcag: string; severity: Severity } | undefined =>
  RULE_WCAG[ruleId];
