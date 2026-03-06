import { formatDistanceToNow, format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface DateDisplayProps {
  date: string | null;
  relative?: boolean;
}

export function DateDisplay({ date, relative = true }: DateDisplayProps) {
  if (!date) return <span className="text-muted-foreground">-</span>;

  const d = new Date(date);
  const formatted = format(d, 'PPp');
  const rel = formatDistanceToNow(d, { addSuffix: true });

  if (relative) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <span className="cursor-default text-sm">{rel}</span>
        </TooltipTrigger>
        <TooltipContent>{formatted}</TooltipContent>
      </Tooltip>
    );
  }

  return <span className="text-sm">{formatted}</span>;
}
