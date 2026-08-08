export type Person = {
  id: string;
  name: string;
  drawingDataUrl: string;
  createdAt: string;
};

export type ConversationSession = {
  id: string;
  title?: string;
  startedAt: string;
  endedAt: string;
  memoryKind?: "clip" | "session";
  sourceStartedAt?: string;
  sourceEndedAt?: string;
  participantIds: string[];
  speakerAssignments: Record<string, string | null>;
  utterances: Utterance[];
  events: ConversationEvent[];
  audioDeleted: boolean;
  clipAudioStored?: boolean;
  clipAudioDataUrl?: string | null;
  laughCount?: number;
  createdAt: string;
};

export type Utterance = {
  id: string;
  speakerId: string;
  personId?: string | null;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence?: number;
  hidden?: boolean;
};

export type ConversationEvent = {
  id: string;
  type: "laugh" | "silence" | "toast" | "photo" | "movement" | "unknown";
  startTimeMs: number;
  endTimeMs?: number;
  participantIds?: string[];
  metadata?: Record<string, unknown>;
};

export type CapturedTranscript = {
  id: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence?: number;
  source: "speech-recognition" | "manual";
};

export type AudioProcessingResult = {
  utterances: Utterance[];
  events: ConversationEvent[];
  speakerAssignments: Record<string, string | null>;
  audioDeleted: boolean;
};
