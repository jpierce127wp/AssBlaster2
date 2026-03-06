import { useState, useRef, useCallback } from 'react';
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
import { CheckCircle, XCircle, AlertTriangle, Plus, Trash2, Upload, FileText, Loader2 } from 'lucide-react';
import mammoth from 'mammoth';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

interface Participant {
  name: string;
  role: string;
}

const ACCEPTED_EXTENSIONS = '.txt,.docx,.pdf';

async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.txt')) {
    return file.text();
  }

  if (name.endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  if (name.endsWith('.pdf')) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .filter((item): item is typeof item & { str: string } => 'str' in item)
        .map((item) => item.str)
        .join(' ');
      pages.push(text);
    }
    return pages.join('\n\n');
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function IngestPage() {
  const [sourceType, setSourceType] = useState<SourceType>('meeting');
  const [rawText, setRawText] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [matterHints, setMatterHints] = useState('');
  const [contactHints, setContactHints] = useState('');
  const [privileged, setPrivileged] = useState(false);
  const [sourceTimestamp, setSourceTimestamp] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const ingestMutation = useMutation({
    mutationFn: (body: IngestRequest) => evidenceApi.ingest(body),
  });

  const processFile = useCallback(async (file: File) => {
    setSelectedFile(file);
    setRawText('');
    setExtractionError(null);
    setExtracting(true);
    try {
      const text = await extractText(file);
      setRawText(text);
    } catch (err) {
      setExtractionError(err instanceof Error ? err.message : 'Failed to extract text from file');
    } finally {
      setExtracting(false);
    }
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
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

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Upload Document</Label>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag & drop a file here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                Supports .txt, .docx, and .pdf
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* File info */}
          {selectedFile && (
            <div className="flex items-center gap-3 rounded-md border px-4 py-3 text-sm">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
              </div>
              {extracting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          )}

          {/* Extraction error */}
          {extractionError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{extractionError}</AlertDescription>
            </Alert>
          )}

          {/* Text preview */}
          {rawText && !extracting && (
            <div className="space-y-1">
              <Label>Extracted Text Preview</Label>
              <Textarea
                value={rawText}
                readOnly
                rows={10}
                className="font-mono text-sm"
              />
            </div>
          )}

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
            disabled={!rawText.trim() || extracting || ingestMutation.isPending}
          >
            {ingestMutation.isPending ? 'Submitting...' : 'Submit Transcript'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
