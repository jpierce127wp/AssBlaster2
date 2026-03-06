import { Badge } from '@/components/ui/badge';
import { STATUS_COLORS, REVIEW_STATUS_COLORS, PROCESSING_STATE_COLORS, PROCESSING_STATE_LABELS } from '@/lib/constants';
import type { CanonicalTaskStatus, ReviewStatus, ProcessingState } from '@/api/types';
import { cn } from '@/lib/utils';

export function TaskStatusBadge({ status }: { status: CanonicalTaskStatus }) {
  return (
    <Badge variant="outline" className={cn('text-xs', STATUS_COLORS[status])}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <Badge variant="outline" className={cn('text-xs', REVIEW_STATUS_COLORS[status])}>
      {status}
    </Badge>
  );
}

export function ProcessingStateBadge({ state }: { state: ProcessingState }) {
  return (
    <Badge variant="outline" className={cn('text-xs', PROCESSING_STATE_COLORS[state])}>
      {PROCESSING_STATE_LABELS[state]}
    </Badge>
  );
}
