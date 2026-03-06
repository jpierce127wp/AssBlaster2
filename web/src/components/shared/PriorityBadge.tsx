import { Badge } from '@/components/ui/badge';
import { PRIORITY_COLORS } from '@/lib/constants';
import type { TaskPriority } from '@/api/types';
import { cn } from '@/lib/utils';

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge variant="outline" className={cn('text-xs', PRIORITY_COLORS[priority])}>
      {priority}
    </Badge>
  );
}
