import { describe, it, expect } from 'vitest';
import { PhoneTranscriptAdapter } from '../../src/ingestion/adapters/phone-transcript.adapter.js';
import { EmailAdapter } from '../../src/ingestion/adapters/email.adapter.js';
import { MeetingTranscriptAdapter } from '../../src/ingestion/adapters/meeting-transcript.adapter.js';

describe('PhoneTranscriptAdapter', () => {
  const adapter = new PhoneTranscriptAdapter();

  it('should normalize whitespace and speaker labels', () => {
    const raw = "Speaker 1 -  Hello, how are you?\n\n\n\nSpeaker 2:  I'm fine.";
    const result = adapter.clean(raw, {});
    expect(result.cleaned_text).toContain('Speaker 1: Hello');
    expect(result.cleaned_text).not.toContain('\n\n\n');
    expect(result.source_metadata.adapter).toBe('phone');
  });

  it('should replace inaudible markers', () => {
    const raw = 'Speaker 1: I said [inaudible] yesterday.';
    const result = adapter.clean(raw, {});
    expect(result.cleaned_text).toContain('[...]');
    expect(result.cleaned_text).not.toContain('[inaudible]');
  });

  it('should detect speaker count', () => {
    const raw = 'Speaker 1: Hi\nSpeaker 2: Hello\nSpeaker 1: How are you?';
    const result = adapter.clean(raw, {});
    expect(result.source_metadata.detected_speakers).toBe(2);
  });

  it('should return participants array', () => {
    const raw = 'Speaker 1: Hi\nSpeaker 2: Hello';
    const result = adapter.clean(raw, {});
    expect(result.participants.length).toBe(2);
  });

  it('should return empty matter_hints and contact_hints', () => {
    const result = adapter.clean('test', {});
    expect(result.matter_hints).toEqual([]);
    expect(result.contact_hints).toEqual([]);
  });
});

describe('EmailAdapter', () => {
  const adapter = new EmailAdapter();

  it('should remove email signatures', () => {
    const raw = 'Please file the motion by Friday.\n\n--\nJohn Doe\nLaw Firm LLC';
    const result = adapter.clean(raw, {});
    expect(result.cleaned_text).toBe('Please file the motion by Friday.');
  });

  it('should remove "Sent from" lines', () => {
    const raw = 'Important update.\n\nSent from my iPhone';
    const result = adapter.clean(raw, {});
    expect(result.cleaned_text).toBe('Important update.');
  });

  it('should preserve subject from metadata', () => {
    const result = adapter.clean('Body text', { subject: 'Re: Motion' });
    expect(result.source_metadata.subject).toBe('Re: Motion');
  });

  it('should extract participants from metadata', () => {
    const result = adapter.clean('Body', { from: 'john@example.com', to: ['sarah@example.com'] });
    expect(result.participants.length).toBe(2);
    expect(result.participants[0]!.role).toBe('sender');
    expect(result.participants[1]!.role).toBe('recipient');
  });
});

describe('MeetingTranscriptAdapter', () => {
  const adapter = new MeetingTranscriptAdapter();

  it('should remove timestamps', () => {
    const raw = '[00:01:23] John: We need to file the brief.\n[00:02:45] Sarah: Agreed.';
    const result = adapter.clean(raw, {});
    expect(result.cleaned_text).not.toContain('[00:');
    expect(result.cleaned_text).toContain('John: We need to file the brief.');
  });

  it('should remove meeting bot artifacts', () => {
    const raw = 'Recording started\nJohn: Hello\nSarah left the meeting\nJohn: Bye';
    const result = adapter.clean(raw, {});
    expect(result.cleaned_text).not.toContain('Recording started');
    expect(result.cleaned_text).not.toContain('left the meeting');
  });

  it('should detect participants', () => {
    const raw = 'John: Hello\nSarah: Hi\nJohn: Let us begin.';
    const result = adapter.clean(raw, {});
    expect(result.source_metadata.participant_count).toBe(2);
    expect(result.source_metadata.detected_participants).toContain('john');
    expect(result.source_metadata.detected_participants).toContain('sarah');
  });

  it('should return participants array', () => {
    const raw = 'John: Hello\nSarah: Hi';
    const result = adapter.clean(raw, {});
    expect(result.participants.length).toBe(2);
  });
});
