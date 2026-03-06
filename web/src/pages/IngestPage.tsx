import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { evidenceApi } from '@/api/endpoints/evidence';
import type { SourceType, IngestRequest } from '@/api/types';
import { CheckCircle, XCircle, AlertTriangle, Plus, Trash2 } from 'lucide-react';

interface Participant {
  name: string;
  role: string;
}

export function IngestPage() {
  const [sourceType, setSourceType] = useState<SourceType>('meeting');
  const [rawText, setRawText] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [matterHints, setMatterHints] = useState('');
  const [contactHints, setContactHints] = useState('');
  const [privileged, setPrivileged] = useState(false);
  const [sourceTimestamp, setSourceTimestamp] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ingestMutation = useMutation({
    mutationFn: (body: IngestRequest) => evidenceApi.ingest(body),
  });

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawText(reader.result);
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }

  function addParticipant() {
    setParticipants((prev) => [...prev, { name: '', role: '' }]);
  }

  function updateParticipant(index: number, field: keyof Participant, value: string) {
    setParticipants((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  }

  function removeParticipant(index: number) {
    setParticipants((prev) => prev.filter((_, i) => i !== index));
  }

  function splitCsv(value: string): string[] {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function handleSubmit() {
    const body: IngestRequest = {
      idempotency_key: crypto.randomUUID(),
      source_type: sourceType,
      raw_text: rawText,
    };

    const filteredParticipants = participants.filter((p) => p.name.trim());
    if (filteredParticipants.length > 0) {
      body.participants = filteredParticipants.map((p) => ({
        name: p.name.trim(),
        ...(p.role.trim() ? { role: p.role.trim() } : {}),
      }));
    }

    const matters = splitCsv(matterHints);
    if (matters.length > 0) body.matter_hints = matters;

    const contacts = splitCsv(contactHints);
    if (contacts.length > 0) body.contact_hints = contacts;

    if (privileged) {
      body.privilege_flags = { attorney_client: true };
    }

    if (sourceTimestamp) {
      body.source_timestamp = new Date(sourceTimestamp).toISOString();
    }

    ingestMutation.mutate(body);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Ingest Transcript</h2>

      {ingestMutation.isSuccess && ingestMutation.data.status === 'accepted' && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Evidence accepted (ID:{' '}
            <Link to={`/evidence/${ingestMutation.data.id}`} className="underline font-medium">
              {ingestMutation.data.id}
            </Link>
            ). {ingestMutation.data.message}
          </AlertDescription>
        </Alert>
      )}

      {ingestMutation.isSuccess && ingestMutation.data.status === 'duplicate' && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Duplicate submission. {ingestMutation.data.message}
          </AlertDescription>
        </Alert>
      )}

      {ingestMutation.isError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            {(ingestMutation.error as Error).message}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transcript Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Source Type */}
          <div className="space-y-1">
            <Label>Source Type</Label>
            <Select value={sourceType} onValueChange={(v) => setSourceType(v as SourceType)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="phone">Phone Call</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Transcript Text */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Transcript Text</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload .txt
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste transcript text here..."
              rows={20}
              className="font-mono text-sm"
            />
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Participants</Label>
              <Button type="button" variant="outline" size="sm" onClick={addParticipant}>
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
            {participants.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={p.name}
                  onChange={(e) => updateParticipant(i, 'name', e.target.value)}
                  placeholder="Name"
                  className="flex-1"
                />
                <Input
                  value={p.role}
                  onChange={(e) => updateParticipant(i, 'role', e.target.value)}
                  placeholder="Role (optional)"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeParticipant(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Matter Hints */}
          <div className="space-y-1">
            <Label>Matter Hints</Label>
            <Input
              value={matterHints}
              onChange={(e) => setMatterHints(e.target.value)}
              placeholder="Comma-separated matter names or references"
            />
          </div>

          {/* Contact Hints */}
          <div className="space-y-1">
            <Label>Contact Hints</Label>
            <Input
              value={contactHints}
              onChange={(e) => setContactHints(e.target.value)}
              placeholder="Comma-separated contact names"
            />
          </div>

          {/* Privilege Flag */}
          <div className="flex items-center gap-3">
            <Switch
              id="privileged"
              checked={privileged}
              onCheckedChange={(checked) => setPrivileged(!!checked)}
            />
            <Label htmlFor="privileged">Attorney-Client Privileged</Label>
          </div>

          {/* Source Timestamp */}
          <div className="space-y-1">
            <Label>Source Timestamp (optional)</Label>
            <Input
              type="datetime-local"
              value={sourceTimestamp}
              onChange={(e) => setSourceTimestamp(e.target.value)}
              className="w-64"
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!rawText.trim() || ingestMutation.isPending}
          >
            {ingestMutation.isPending ? 'Submitting...' : 'Submit Transcript'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
