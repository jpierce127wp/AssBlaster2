import type { SourceAdapter } from './adapter.interface.js';
import type { CleanedEvidence } from '../evidence.types.js';

export class EmailAdapter implements SourceAdapter {
  clean(rawText: string, metadata: Record<string, unknown>): CleanedEvidence {
    let cleaned = rawText;

    // Normalize line endings
    cleaned = cleaned.replace(/\r\n/g, '\n');

    // Remove email signatures (common patterns)
    cleaned = cleaned.replace(/^--\s*\n[\s\S]*$/m, '');
    cleaned = cleaned.replace(/^_{3,}[\s\S]*$/m, '');
    cleaned = cleaned.replace(/^Sent from my (?:iPhone|iPad|Android).*$/gmi, '');

    // Remove quoted reply chains (keep only latest message body)
    const replyMarkers = [
      /^>+\s?.*/gm,
      /^On .+ wrote:\s*$/gm,
      /^-{3,}\s*Original Message\s*-{3,}$/gmi,
      /^From:\s+.+$/gm,
    ];
    for (const pattern of replyMarkers) {
      cleaned = cleaned.replace(pattern, '');
    }

    // Clean up whitespace
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.trim();

    // Extract subject from metadata if present
    const subject = typeof metadata.subject === 'string' ? metadata.subject : undefined;

    // Extract participants from metadata
    const participants: Array<{ name: string; role?: string }> = [];
    if (typeof metadata.from === 'string') {
      participants.push({ name: metadata.from, role: 'sender' });
    }
    if (Array.isArray(metadata.to)) {
      for (const r of metadata.to) {
        if (typeof r === 'string') participants.push({ name: r, role: 'recipient' });
      }
    }

    return {
      cleaned_text: cleaned,
      source_metadata: {
        ...metadata,
        adapter: 'email',
        ...(subject && { subject }),
      },
      participants,
      matter_hints: [],
      contact_hints: [],
    };
  }
}
