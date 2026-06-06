import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  eyebrow?: string;
  eyebrowIcon?: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ eyebrow, eyebrowIcon: Icon, title, description, actions, children }: PageHeaderProps) {
  return (
    <header className="mb-6">
      <div className="flowit-header-bg relative overflow-hidden rounded-3xl border border-border/80 shadow-[0_8px_28px_-18px_rgba(94,108,246,0.35)]">
        <div className="relative px-6 lg:px-8 py-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[11px] uppercase tracking-[0.14em] text-primary/80 font-semibold flex items-center gap-1.5">
                {Icon && <Icon className="h-3.5 w-3.5" />} {eyebrow}
              </div>
            )}
            <h1 className="font-display text-2xl sm:text-3xl lg:text-[34px] font-semibold tracking-tight mt-1.5 text-foreground">
              {title}
            </h1>
            {description && (
              <p className="text-[15px] text-muted-foreground mt-1.5 max-w-2xl leading-snug">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}
