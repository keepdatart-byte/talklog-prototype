import { createMockEvents, createMockUtterances } from "./mockData";
import type { AudioProcessingResult, CapturedTranscript, ConversationEvent, Utterance } from "./types";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function transcribeAudio(_temporaryAudio: Blob | null): Promise<Utterance[]> {
  await wait(350);
  return createMockUtterances().map((utterance) => ({
    ...utterance,
    id: crypto.randomUUID(),
    personId: null
  }));
}

function transcriptLooksLikeLaugh(text: string) {
  return /(笑|ｗ{2,}|w{2,}|はは|ハハ|あは|アハ|へへ|ふふ)/i.test(text);
}

function removeLaughText(text: string) {
  return text
    .replace(/[（(]?\s*(笑|笑笑|ｗ+|w+)\s*[）)]?/gi, "")
    .replace(/(ははは+|ハハハ+|あはは+|アハハ+|へへへ+|ふふふ+)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function utterancesFromTranscripts(transcripts: CapturedTranscript[], speakerBucketCount = 2): Utterance[] {
  const speakerIds = ["speaker-a", "speaker-b", "speaker-c", "speaker-d"].slice(0, Math.max(1, Math.min(4, speakerBucketCount)));

  return transcripts
    .map((transcript, index) => ({
      id: crypto.randomUUID(),
      speakerId: speakerIds[index % speakerIds.length],
      personId: null,
      text: removeLaughText(transcript.text),
      startTimeMs: transcript.startTimeMs,
      endTimeMs: Math.max(transcript.endTimeMs, transcript.startTimeMs + 800),
      confidence: transcript.confidence
    }))
    .filter((utterance) => utterance.text.length > 0);
}

export async function separateSpeakers(utterances: Utterance[]): Promise<Utterance[]> {
  await wait(350);
  return utterances.map((utterance) => ({ ...utterance }));
}

function eventsFromTranscripts(transcripts: CapturedTranscript[]): ConversationEvent[] {
  const sorted = [...transcripts].sort((a, b) => a.startTimeMs - b.startTimeMs);
  const events: ConversationEvent[] = [];

  sorted.forEach((transcript, index) => {
    if (transcriptLooksLikeLaugh(transcript.text)) {
      events.push({
        id: crypto.randomUUID(),
        type: "laugh",
        startTimeMs: transcript.startTimeMs,
        endTimeMs: Math.max(transcript.endTimeMs, transcript.startTimeMs + 900)
      });
    }

    const next = sorted[index + 1];
    if (next) {
      const gap = next.startTimeMs - transcript.endTimeMs;
      if (gap >= 1200) {
        events.push({
          id: crypto.randomUUID(),
          type: "silence",
          startTimeMs: transcript.endTimeMs,
          endTimeMs: next.startTimeMs
        });
      }
    }
  });

  return events;
}

export async function detectConversationEvents(
  _temporaryAudio: Blob | null,
  capturedTranscripts: CapturedTranscript[] = []
): Promise<ConversationEvent[]> {
  await wait(350);
  if (capturedTranscripts.length > 0) {
    return eventsFromTranscripts(capturedTranscripts);
  }

  return createMockEvents().map((event) => ({
    ...event,
    id: crypto.randomUUID()
  }));
}

export async function deleteTemporaryAudio(temporaryChunks: Blob[] = []): Promise<boolean> {
  temporaryChunks.splice(0, temporaryChunks.length);
  await wait(220);
  return true;
}

export async function processTemporaryAudio(
  temporaryAudio: Blob | null,
  temporaryChunks: Blob[] = [],
  capturedTranscripts: CapturedTranscript[] = [],
  speakerBucketCount = 2
): Promise<AudioProcessingResult> {
  const sortedTranscripts = [...capturedTranscripts].sort((a, b) => a.startTimeMs - b.startTimeMs);
  const transcribed =
    sortedTranscripts.length > 0 ? utterancesFromTranscripts(sortedTranscripts, speakerBucketCount) : await transcribeAudio(temporaryAudio);
  const separated = await separateSpeakers(transcribed);
  const events = await detectConversationEvents(temporaryAudio, sortedTranscripts);
  const audioDeleted = await deleteTemporaryAudio(temporaryChunks);
  const speakerIds = Array.from(new Set(separated.map((utterance) => utterance.speakerId)));

  return {
    utterances: separated,
    events,
    speakerAssignments: Object.fromEntries(speakerIds.map((speakerId) => [speakerId, null])),
    audioDeleted
  };
}
