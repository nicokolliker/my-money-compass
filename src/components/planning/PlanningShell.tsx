import { ReactNode } from 'react';

interface PlanningShellProps {
  /** Section name within Planning, e.g. "Overview", "Recurring" */
  section: string;
  /** Optional subtitle/description for the active section */
  description?: string;
  /** Right-aligned action slot (buttons, toggles, etc.) */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Unified header used by every Planning sub-section so the module
 * feels like one product instead of stitched-together legacy pages.
 *
 * Renders ONE consistent title row + a description line, then the
 * children with consistent spacing.
 */
export function PlanningShell({ section, description, actions, children }: PlanningShellProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Planning
          </p>
          <h2 className="text-lg font-semibold text-foreground truncate">{section}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
