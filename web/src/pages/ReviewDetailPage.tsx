import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfidenceBar } from '@/components/shared/ConfidenceBar';
import { PriorityBadge } from '@/components/shared/PriorityBadge';
import { reviewsApi } from '@/api/endpoints/reviews';
import {
  REVIEW_REASON_COLORS,
  REVIEW_REASON_LABELS,
  SIGNAL_TYPE_LABELS,
  MERGE_OUTCOME_LABELS,
  SOURCE_TYPE_COLORS,
  SOURCE_TYPE_LABELS,
  MATTER_CONFIDENCE_MIN,
  SENSITIVE_FIELD_MIN_CONFIDENCE,
} from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ReviewContext } from '@/api/types';

export function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [decidedBy, setDecidedBy] = useState(
    () => localStorage.getItem('taskmaster_user_id') ?? '',
  );

  const { data: ctx, isLoading, error } = useQuery({
    queryKey: ['reviews', id, 'context'],
    queryFn: () => reviewsApi.getContext(id!),
    enabled: !!id,
  });

  const decideMutation = useMutation({
    mutationFn: (status: 'resolved' | 'dismissed') =>
      reviewsApi.decide(id!, { status, decided_by: decidedBy }),
    onSuccess: () => {
      localStorage.setItem('taskmaster_user_id', decidedBy);
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      navigate('/reviews');
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error || !ctx) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/reviews')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Queue
        </Button>
        <p className="text-destructive">Failed to load review context.</p>
      </div>
    );
  }

  const { reviewItem, candidateTask, evidenceEvent, actionSpan, mergeDecisions, relatedCanonicalTasks, reason_explanation } = ctx;
  const isOpen = reviewItem.status === 'open';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/reviews')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Badge
          variant="outline"
          className={cn('text-sm', REVIEW_REASON_COLORS[reviewItem.reason])}
        >
          {REVIEW_REASON_LABELS[reviewItem.reason]}
        </Badge>
        <Badge variant="outline" className="text-sm">
          {reviewItem.status}
        </Badge>
      </div>

      {/* Reason explanation */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{reason_explanation}</AlertDescription>
      </Alert>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          {/* Candidate Task */}
          {candidateTask && (
            <CandidateTaskCard task={candidateTask} />
          )}

          {/* Action Span */}
          {actionSpan && (
            <ActionSpanCard span={actionSpan} />
          )}

          {/* Merge Decisions */}
          {mergeDecisions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Merge Decisions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {mergeDecisions.map((md) => (
                  <div key={md.id} className="rounded-md border p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{MERGE_OUTCOME_LABELS[md.outcome]}</Badge>
                      {md.fingerprint_score != null && (
                        <span className="text-xs text-muted-foreground">
                          FP: {(md.fingerprint_score * 100).toFixed(0)}%
                        </span>
                      )}
                      {md.embedding_score != null && (
                        <span className="text-xs text-muted-foreground">
                          Emb: {(md.embedding_score * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    {md.rationale && (
                      <p className="text-xs text-muted-foreground">{md.rationale}</p>
                    )}
                    {md.selected_canonical_id && (
                      <Link
                        to={`/tasks/${md.selected_canonical_id}`}
                        className="text-xs text-primary underline"
                      >
                        Canonical: {md.selected_canonical_id.slice(0, 8)}...
                      </Link>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Related Canonical Tasks */}
          {relatedCanonicalTasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Related Canonical Tasks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {relatedCanonicalTasks.map((t) => (
                  <Link
                    key={t.id}
                    to={`/tasks/${t.id}`}
                    className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50"
                  >
                    <div>
                      <p className="text-sm font-medium">{t.canonical_summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.status} / {t.priority}
                      </p>
                    </div>
                    <PriorityBadge priority={t.priority} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          {/* Evidence Source */}
          {evidenceEvent && (
            <EvidenceSourceCard evidence={evidenceEvent} />
          )}
        </div>
      </div>

      {/* Decision panel (sticky at bottom) */}
      {isOpen && (
        <div className="sticky bottom-0 z-10 border-t bg-background p-4">
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs space-y-1">
              <Label htmlFor="decided-by">Decided by</Label>
              <Input
                id="decided-by"
                value={decidedBy}
                onChange={(e) => setDecidedBy(e.target.value)}
                placeholder="Your name or ID"
              />
            </div>
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="default" disabled={!decidedBy || decideMutation.isPending} />}
              >
                Resolve
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Resolve this review?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark the review as resolved. The candidate task will proceed through the pipeline.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => decideMutation.mutate('resolved')}>
                    Resolve
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="outline" disabled={!decidedBy || decideMutation.isPending} />}
              >
                Dismiss
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Dismiss this review?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will dismiss the review item. No further action will be taken.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => decideMutation.mutate('dismissed')}>
                    Dismiss
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {decideMutation.isError && (
              <span className="text-sm text-destructive">
                {(decideMutation.error as Error).message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateTaskCard({ task }: { task: ReviewContext['candidateTask'] }) {
  if (!task) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Candidate Task</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">{task.canonical_summary}</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field label="Action" value={task.action_type} />
          <Field label="Priority" value={task.priority} />
          <Field label="Matter" value={task.matter_id} />
          <Field label="Assignee" value={task.assignee_name ?? task.assignee_user_id} />
          <Field label="Due" value={task.due_date_source_text ?? task.due_date_window_start} />
          <Field label="Source Authority" value={task.source_authority} />
        </div>
        <div className="space-y-2 pt-2">
          <ConfidenceBar
            label="Extraction"
            value={task.confidence_extraction}
            threshold={SENSITIVE_FIELD_MIN_CONFIDENCE}
          />
          <ConfidenceBar
            label="Normalization"
            value={task.confidence_normalization}
            threshold={SENSITIVE_FIELD_MIN_CONFIDENCE}
          />
          <ConfidenceBar
            label="Resolution"
            value={task.confidence_resolution}
            threshold={MATTER_CONFIDENCE_MIN}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ActionSpanCard({ span }: { span: ReviewContext['actionSpan'] }) {
  if (!span) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Action Span</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScrollArea className="max-h-32 rounded-md border p-3">
          <p className="text-sm italic">"{span.text}"</p>
        </ScrollArea>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field label="Signal" value={SIGNAL_TYPE_LABELS[span.signal_type]} />
          <Field label="Confidence" value={`${(span.confidence * 100).toFixed(0)}%`} />
          <Field label="Action" value={span.extracted_action} />
          <Field label="Object" value={span.extracted_object} />
          <Field label="Assignee" value={span.extracted_assignee_name} />
          <Field label="Due" value={span.extracted_due_text} />
        </div>
      </CardContent>
    </Card>
  );
}

function EvidenceSourceCard({ evidence }: { evidence: NonNullable<ReviewContext['evidenceEvent']> }) {
  const hasPrivilegeFlags = Object.values(evidence.privilege_flags).some(Boolean);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Evidence Source</CardTitle>
          <Badge
            variant="outline"
            className={cn('text-xs', SOURCE_TYPE_COLORS[evidence.source_type])}
          >
            {SOURCE_TYPE_LABELS[evidence.source_type]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Privilege flags */}
        {hasPrivilegeFlags && (
          <Alert variant="destructive">
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Privilege flags:{' '}
              {Object.entries(evidence.privilege_flags)
                .filter(([, v]) => v)
                .map(([k]) => k)
                .join(', ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Participants */}
        {evidence.participants.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Participants</p>
            <div className="flex flex-wrap gap-1">
              {evidence.participants.map((p, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {p.name}
                  {p.role && ` (${p.role})`}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Matter hints */}
        {evidence.matter_hints.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Matter Hints</p>
            <div className="flex flex-wrap gap-1">
              {evidence.matter_hints.map((h, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {h}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Text tabs */}
        <Tabs defaultValue="cleaned">
          <TabsList>
            <TabsTrigger value="cleaned">Cleaned Text</TabsTrigger>
            <TabsTrigger value="raw">Raw Text</TabsTrigger>
          </TabsList>
          <TabsContent value="cleaned">
            <ScrollArea className="h-64 rounded-md border p-4">
              <pre className="text-xs whitespace-pre-wrap">
                {evidence.cleaned_text ?? 'No cleaned text available'}
              </pre>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="raw">
            <ScrollArea className="h-64 rounded-md border p-4">
              <pre className="text-xs whitespace-pre-wrap">{evidence.raw_text}</pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm">{value ?? <span className="text-muted-foreground">-</span>}</p>
    </div>
  );
}
