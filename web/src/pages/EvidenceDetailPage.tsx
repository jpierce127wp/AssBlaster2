import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ProcessingStateBadge } from '@/components/shared/StatusBadge';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { evidenceApi } from '@/api/endpoints/evidence';
import { SOURCE_TYPE_COLORS, SOURCE_TYPE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const REPLAY_STAGES = ['ingest', 'extract', 'normalize', 'resolve', 'dedup'] as const;

export function EvidenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: evidence, isLoading } = useQuery({
    queryKey: ['evidence', id],
    queryFn: () => evidenceApi.get(id!),
    enabled: !!id,
  });

  const replayMutation = useMutation({
    mutationFn: () => evidenceApi.replay(id!),
  });

  const replayStageMutation = useMutation({
    mutationFn: (stage: string) => evidenceApi.replayFromStage(id!, stage),
  });

  if (isLoading || !evidence) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/evidence')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <h2 className="text-xl font-bold">Evidence Detail</h2>
        <Badge
          variant="outline"
          className={cn('text-sm', SOURCE_TYPE_COLORS[evidence.source_type])}
        >
          {SOURCE_TYPE_LABELS[evidence.source_type]}
        </Badge>
        <ProcessingStateBadge state={evidence.processing_state} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="ID" value={evidence.id} mono />
            <Field label="Idempotency Key" value={evidence.idempotency_key} mono />
            <Field label="Language" value={evidence.language} />
            <Field label="Schema Version" value={String(evidence.schema_version)} />
            <Field label="External ID" value={evidence.source_external_id} mono />
            <Field label="Thread ID" value={evidence.source_thread_id} mono />
            <div className="flex gap-6">
              <div>
                <span className="text-xs text-muted-foreground">Received</span>
                <div><DateDisplay date={evidence.received_at} relative={false} /></div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Source Timestamp</span>
                <div><DateDisplay date={evidence.source_timestamp} relative={false} /></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Participants */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Participants ({evidence.participants.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {evidence.participants.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {evidence.participants.map((p, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {p.name}{p.role ? ` (${p.role})` : ''}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">None</p>
              )}
            </CardContent>
          </Card>

          {/* Hints & Flags */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hints & Flags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Matter Hints</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {evidence.matter_hints.length > 0
                    ? evidence.matter_hints.map((h, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{h}</Badge>
                      ))
                    : <span className="text-sm text-muted-foreground">None</span>
                  }
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Contact Hints</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {evidence.contact_hints.length > 0
                    ? evidence.contact_hints.map((h, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{h}</Badge>
                      ))
                    : <span className="text-sm text-muted-foreground">None</span>
                  }
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Privilege Flags</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.entries(evidence.privilege_flags).map(([k, v]) => (
                    <Badge
                      key={k}
                      variant={v ? 'destructive' : 'outline'}
                      className="text-xs"
                    >
                      {k}: {v ? 'Yes' : 'No'}
                    </Badge>
                  ))}
                  {Object.keys(evidence.privilege_flags).length === 0 && (
                    <span className="text-sm text-muted-foreground">None</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Metadata */}
      {Object.keys(evidence.source_metadata).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Source Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={evidence.source_metadata} />
          </CardContent>
        </Card>
      )}

      {/* Text tabs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Text Content</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => replayMutation.mutate()}
              disabled={replayMutation.isPending}
            >
              <Play className="mr-1 h-3 w-3" /> Replay from Start
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button size="sm" variant="outline" disabled={replayStageMutation.isPending} />}
              >
                Replay from Stage
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {REPLAY_STAGES.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => replayStageMutation.mutate(s)}
                    className="capitalize"
                  >
                    {s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {(replayMutation.isSuccess || replayStageMutation.isSuccess) && (
            <p className="mb-2 text-sm text-green-600">Replay initiated successfully.</p>
          )}
          <Tabs defaultValue="cleaned">
            <TabsList>
              <TabsTrigger value="cleaned">Cleaned Text</TabsTrigger>
              <TabsTrigger value="raw">Raw Text</TabsTrigger>
            </TabsList>
            <TabsContent value="cleaned">
              <ScrollArea className="h-80 rounded-md border p-4">
                <pre className="text-xs whitespace-pre-wrap">
                  {evidence.cleaned_text ?? 'No cleaned text available'}
                </pre>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="raw">
              <ScrollArea className="h-80 rounded-md border p-4">
                <pre className="text-xs whitespace-pre-wrap">{evidence.raw_text}</pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={mono ? 'font-mono text-xs' : ''}>
        {value ?? <span className="text-muted-foreground">-</span>}
      </p>
    </div>
  );
}
