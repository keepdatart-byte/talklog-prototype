import type { ConversationEvent, ConversationSession, Person, Utterance } from "./types";

export const seedStartedAt = "2026-08-06T11:12:00.000Z";
export const seedEndedAt = "2026-08-06T12:44:00.000Z";

export function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function makePixelPortrait(label: string, accent = "#ff2d87") {
  const initial = label.slice(0, 1);
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" shape-rendering="crispEdges">
    <rect width="96" height="96" fill="#f7f6ef"/>
    <path d="M18 74h60v8H18z" fill="#222"/>
    <path d="M28 30h40v10h8v26H20V40h8z" fill="#fff"/>
    <path d="M28 24h40v8H28zM20 32h8v8h-8zM68 32h8v8h-8z" fill="${accent}"/>
    <path d="M34 46h8v8h-8zM54 46h8v8h-8zM38 62h20v4H38z" fill="#222"/>
    <text x="48" y="88" text-anchor="middle" font-family="monospace" font-size="18" fill="#222">${initial}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createSeedPeople(): Person[] {
  const createdAt = "2026-08-06T08:30:00.000Z";
  return [
    { id: "person-yuta", name: "ゆうた", drawingDataUrl: makePixelPortrait("ゆうた", "#ff2d87"), createdAt },
    { id: "person-kana", name: "かな", drawingDataUrl: makePixelPortrait("かな", "#f070a8"), createdAt },
    { id: "person-shota", name: "しょうた", drawingDataUrl: makePixelPortrait("しょうた", "#808080"), createdAt },
    { id: "person-me", name: "自分", drawingDataUrl: makePixelPortrait("自分", "#222222"), createdAt }
  ];
}

export function createMockUtterances(): Utterance[] {
  return [
    {
      id: "utt-1",
      speakerId: "speaker-a",
      personId: "person-yuta",
      text: "焼肉久しぶり！",
      startTimeMs: 0,
      endTimeMs: 1600,
      confidence: 0.94
    },
    {
      id: "utt-2",
      speakerId: "speaker-b",
      personId: "person-kana",
      text: "このタン、めっちゃうまい",
      startTimeMs: 2300,
      endTimeMs: 4700,
      confidence: 0.92
    },
    {
      id: "utt-3",
      speakerId: "speaker-c",
      personId: "person-shota",
      text: "お前また遅刻したな",
      startTimeMs: 6100,
      endTimeMs: 8200,
      confidence: 0.9
    },
    {
      id: "utt-4",
      speakerId: "speaker-a",
      personId: "person-yuta",
      text: "いや、今日は違うって",
      startTimeMs: 11100,
      endTimeMs: 13200,
      confidence: 0.93
    },
    {
      id: "utt-5",
      speakerId: "speaker-c",
      personId: "person-shota",
      text: "もう遅刻してるじゃん",
      startTimeMs: 15100,
      endTimeMs: 17400,
      confidence: 0.9
    },
    {
      id: "utt-6",
      speakerId: "speaker-b",
      personId: "person-kana",
      text: "このあとデザートいける人いる？",
      startTimeMs: 151000,
      endTimeMs: 153300,
      confidence: 0.91
    },
    {
      id: "utt-7",
      speakerId: "speaker-a",
      personId: "person-yuta",
      text: "俺は別腹が四つある",
      startTimeMs: 154500,
      endTimeMs: 156700,
      confidence: 0.89
    },
    {
      id: "utt-8",
      speakerId: "speaker-d",
      personId: "person-me",
      text: "それもう胃袋じゃなくて収納だよ",
      startTimeMs: 158400,
      endTimeMs: 161100,
      confidence: 0.9
    },
    {
      id: "utt-9",
      speakerId: "speaker-c",
      personId: "person-shota",
      text: "じゃあ帰りは収納担当で",
      startTimeMs: 166000,
      endTimeMs: 168100,
      confidence: 0.9
    },
    {
      id: "utt-10",
      speakerId: "speaker-d",
      personId: "person-me",
      text: "あの時の写真、全員目つぶってた",
      startTimeMs: 311000,
      endTimeMs: 313800,
      confidence: 0.92
    },
    {
      id: "utt-11",
      speakerId: "speaker-b",
      personId: "person-kana",
      text: "それ奇跡の集合写真じゃん",
      startTimeMs: 315000,
      endTimeMs: 317100,
      confidence: 0.91
    },
    {
      id: "utt-12",
      speakerId: "speaker-a",
      personId: "person-yuta",
      text: "思い出ってそういうことでしょ",
      startTimeMs: 319200,
      endTimeMs: 321500,
      confidence: 0.9
    }
  ];
}

export function createMockEvents(): ConversationEvent[] {
  return [
    {
      id: "event-laugh-1",
      type: "laugh",
      startTimeMs: 8700,
      endTimeMs: 10100,
      participantIds: ["person-yuta", "person-kana", "person-shota"]
    },
    {
      id: "event-silence-1",
      type: "silence",
      startTimeMs: 10100,
      endTimeMs: 11100
    },
    {
      id: "event-laugh-2",
      type: "laugh",
      startTimeMs: 17800,
      endTimeMs: 19200,
      participantIds: ["person-yuta", "person-kana", "person-shota"]
    },
    {
      id: "event-laugh-3",
      type: "laugh",
      startTimeMs: 162200,
      endTimeMs: 164200,
      participantIds: ["person-yuta", "person-kana", "person-me"]
    },
    {
      id: "event-laugh-4",
      type: "laugh",
      startTimeMs: 169000,
      endTimeMs: 170100,
      participantIds: ["person-shota", "person-me"]
    },
    {
      id: "event-laugh-5",
      type: "laugh",
      startTimeMs: 322600,
      endTimeMs: 324000,
      participantIds: ["person-yuta", "person-kana", "person-me"]
    }
  ];
}

export function createSeedSession(): ConversationSession {
  const utterances = createMockUtterances().slice(0, 5);
  const events = createMockEvents().slice(0, 3);
  const clipEndedAt = new Date(new Date(seedStartedAt).getTime() + 49200).toISOString();

  return {
    id: "session-yakiniku",
    title: "焼肉 01",
    startedAt: seedStartedAt,
    endedAt: clipEndedAt,
    memoryKind: "clip",
    sourceStartedAt: seedStartedAt,
    sourceEndedAt: seedEndedAt,
    participantIds: ["person-yuta", "person-kana", "person-shota", "person-me"],
    speakerAssignments: {
      "speaker-a": "person-yuta",
      "speaker-b": "person-kana",
      "speaker-c": "person-shota"
    },
    utterances,
    events,
    audioDeleted: true,
    clipAudioStored: true,
    clipAudioDataUrl: null,
    laughCount: 2,
    createdAt: "2026-08-06T12:45:00.000Z"
  };
}

export function createUnassignedMockSession(participantIds: string[], startedAt: string, endedAt: string): ConversationSession {
  const utterances = createMockUtterances().map((utterance) => ({
    ...utterance,
    id: makeId("utt"),
    personId: null
  }));
  const speakerIds = Array.from(new Set(utterances.map((utterance) => utterance.speakerId)));

  return {
    id: makeId("session"),
    startedAt,
    endedAt,
    participantIds,
    speakerAssignments: Object.fromEntries(speakerIds.map((speakerId) => [speakerId, null])),
    utterances,
    events: createMockEvents().map((event) => ({ ...event, id: makeId("event"), participantIds })),
    audioDeleted: true,
    createdAt: new Date().toISOString()
  };
}
