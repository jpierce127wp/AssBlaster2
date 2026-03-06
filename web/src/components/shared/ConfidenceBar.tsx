import { cn } from '@/lib/utils';

interface ConfidenceBarProps {
  value: number;
  label?: string;
  threshold?: number;
  className?: string;
}

export function ConfidenceBar({ value, label, threshold, className }: ConfidenceBarProps) {
  const pct = Math.round(value * 100);
  const belowThreshold = threshold !== undefined && value < threshold;

  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className={cn('font-mono', belowThreshold && 'font-bold text-destructive')}>
            {pct}%
          </span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            belowThreshold ? 'bg-destructive' : value >= 0.9 ? 'bg-green-500' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
