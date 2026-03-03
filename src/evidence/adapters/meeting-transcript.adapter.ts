import type { SourceAdapter } from './adapter.interface.js';
import type { CleanedEvidence } from '../evidence.types.js';

export class MeetingTranscriptAdapter implements SourceAdapter {
  clean(rawText: string, metadata: Record<string, unknown>): CleanedEvidence {
    let cleaned = rawText;

    // Normalize line endings and whitespace
    cleaned = cleaned.replace(/\r\n/g, '\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');

    // Remove timestamp markers: "[00:12:34]" or "(12:34)"
    cleaned = cleaned.replace(/\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/g, '');

    // Normalize speaker labels
    cleaned = cleaned.replace(/^([A-Za-z\s]+)\s*[-–—:]\s*/gm, '$1: ');

    // Remove meeting bot artifacts
    cleaned = cleaned.replace(/^\[?(?:Recording started|Recording stopped|Meeting ended)\]?\s*$/gmi, '');
    cleaned = cleaned.replace(/^\[?(?:.*joined|.*left)(?:\s+the\s+meeting)?\]?\s*$/gmi, '');

    // Collapse multiple blank lines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.trim();

    // Detect participants from speaker labels
    const speakerMatches = cleaned.match(/^([A-Za-z\s]+):/gm);
    const uniqueSpeakers = speakerMatches
      ? [...new Set(speakerMatches.map((s) => s.replace(':', '').trim().toLowerCase()))]
      : [];

    const participants = uniqueSpeakers.map((name) => ({
      name,
      role: 'attendee' as const,
    }));

    return {
      cleaned_text: cleaned,
      source_metadata: {
        ...metadata,
        adapter: 'meeting',
        detected_participants: uniqueSpeakers,
        participant_count: uniqueSpeakers.length,
      },
      participants,
      matter_hints: [],
      contact_hints: [],
    };
  }
}
