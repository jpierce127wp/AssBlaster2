import type { SourceAdapter } from './adapter.interface.js';
import type { CleanedEvidence } from '../evidence.types.js';

export class PhoneTranscriptAdapter implements SourceAdapter {
  clean(rawText: string, metadata: Record<string, unknown>): CleanedEvidence {
    let cleaned = rawText;

    // Normalize whitespace
    cleaned = cleaned.replace(/\r\n/g, '\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.trim();

    // Remove common transcript artifacts
    cleaned = cleaned.replace(/\[(?:inaudible|crosstalk)\]/gi, '[...]');
    cleaned = cleaned.replace(/\((?:pause|silence)\)/gi, '');

    // Normalize speaker labels: "Speaker 1:" → "Speaker 1:"
    cleaned = cleaned.replace(/^(Speaker\s*\d+)\s*[-–—:]\s*/gmi, '$1: ');

    // Extract participant count from metadata or infer from speakers
    const speakerMatches = cleaned.match(/^Speaker\s*\d+:/gmi);
    const uniqueSpeakers = speakerMatches
      ? [...new Set(speakerMatches.map((s) => s.toLowerCase()))]
      : [];

    const participants = uniqueSpeakers.map((s) => ({
      name: s.replace(':', '').trim(),
      role: 'speaker' as const,
    }));

    return {
      cleaned_text: cleaned,
      source_metadata: {
        ...metadata,
        adapter: 'phone',
        detected_speakers: uniqueSpeakers.length,
      },
      participants,
      matter_hints: [],
      contact_hints: [],
    };
  }
}
