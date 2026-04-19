import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, AlertCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { DERIVED_STATE_META, TONE_CLASS, type DerivedInstanceState } from '@/lib/money';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<DerivedInstanceState, typeof CheckCircle2> = {
  matched: CheckCircle2,
  paid_manual: CheckCircle2,
  upcoming: Clock,
  needs_review: AlertTriangle,
  missing: AlertCircle,
};

type Size = 'xs' | 'sm';

interface Props {
  state: DerivedInstanceState;
  size?: Size;
  showIcon?: boolean;
  className?: string;
}

/**
 * Single source of truth for rendering recurring instance state.
 * No page is allowed to define its own colors or labels.
 */
export function RecurringStatusBadge({ state, size = 'xs', showIcon = true, className }: Props) {
  const meta = DERIVED_STATE_META[state];
  const tone = TONE_CLASS[meta.tone];
  const Icon = ICON_MAP[state];
  const sizeCls = size === 'xs'
    ? 'text-[9px] h-4 px-1.5 gap-0.5'
    : 'text-[10px] h-5 px-2 gap-1';
  const iconCls = size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  return (
    <Badge variant="outline" className={cn('inline-flex items-center font-medium border', tone, sizeCls, className)}>
      {showIcon && <Icon className={iconCls} />}
      {meta.label}
    </Badge>
  );
}
