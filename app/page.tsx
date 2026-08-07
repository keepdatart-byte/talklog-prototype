"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DrawingCanvas } from "@/src/components/DrawingCanvas";
import { processTemporaryAudio } from "@/src/lib/audioProcessing";
import { makeId } from "@/src/lib/mockData";
import { loadPeople, loadSessions, savePeople, saveSessions } from "@/src/lib/storage";
import type { CapturedTranscript, ConversationEvent, ConversationSession, Person, Utterance } from "@/src/lib/types";

type Screen =
  | "home"
  | "participants"
  | "add-person"
  | "recording"
  | "finish"
  | "processing"
  | "process-error"
  | "post-participants"
  | "speaker-assign"
  | "title"
  | "done"
  | "album"
  | "detail"
  | "playback"
  | "people"
  | "person-detail"
  | "search";

type CorrectionState = {
  utteranceId: string;
  mode: "menu" | "speaker" | "text";
};

type SpeechCaptureStatus = "idle" | "listening" | "unsupported" | "error";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
  confidence?: number;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorLike = {
  error?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionWindow = typeof window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};

type TimelineItem =
  | {
      kind: "utterance";
      id: string;
      at: number;
      utterance: Utterance;
    }
  | {
      kind: "event";
      id: string;
      at: number;
      event: ConversationEvent;
    };

const processingSteps = [
  "話者を分けています",
  "会話の順番を整えています",
  "笑ったタイミングを記録しています",
  "音声を削除しています"
];

const eventFilterOptions: { value: ConversationEvent["type"]; label: string }[] = [
  { value: "laugh", label: "笑い" },
  { value: "photo", label: "写真" },
  { value: "toast", label: "乾杯" },
  { value: "movement", label: "移動" }
];

const titleKeywordRules = [
  { title: "焼肉", keywords: ["焼肉", "タン", "カルビ", "ハラミ", "肉"] },
  { title: "ドライブ", keywords: ["ドライブ", "車", "運転", "高速"] },
  { title: "カフェ", keywords: ["カフェ", "コーヒー", "ラテ"] },
  { title: "旅行", keywords: ["旅行", "北海道", "温泉", "ホテル"] },
  { title: "ごはん", keywords: ["ごはん", "ご飯", "食べ", "うまい", "おいしい"] },
  { title: "映画", keywords: ["映画", "ドラマ", "アニメ"] }
];

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function assetPath(path: string) {
  if (!basePath) return path;
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric"
  }).format(new Date(value));
}

function formatInputDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatTime(value: string | number) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(typeof value === "number" ? new Date(value) : new Date(value));
}

function formatTimelineTime(session: ConversationSession, ms: number) {
  return formatTime(new Date(session.startedAt).getTime() + ms);
}

function durationLabel(startedAt: string, endedAt: string) {
  const minutes = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}

function shortDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function sessionTimeline(session: ConversationSession): TimelineItem[] {
  return [
    ...session.utterances
      .filter((utterance) => !utterance.hidden)
      .map((utterance) => ({
        kind: "utterance" as const,
        id: utterance.id,
        at: utterance.startTimeMs,
        utterance
      })),
    ...session.events.map((event) => ({
      kind: "event" as const,
      id: event.id,
      at: event.startTimeMs,
      event
    }))
  ].sort((a, b) => a.at - b.at);
}

function eventLabel(event: ConversationEvent) {
  if (event.type === "laugh") return "😂 みんなで笑った";
  if (event.type === "silence") {
    const gap = event.endTimeMs ? Math.round((event.endTimeMs - event.startTimeMs) / 1000) : 1;
    return `… ${gap}秒の間`;
  }
  if (event.type === "toast") return "🥂";
  if (event.type === "photo") return "▣ 写真を撮った";
  if (event.type === "movement") return "↔ 移動した";
  return "・ できごと";
}

function getSessionDurationMs(session: ConversationSession) {
  const utteranceEnd = Math.max(0, ...session.utterances.map((utterance) => utterance.endTimeMs));
  const eventEnd = Math.max(0, ...session.events.map((event) => event.endTimeMs ?? event.startTimeMs));
  return Math.max(utteranceEnd, eventEnd, 1000);
}

function getPlaybackUtterances(session: ConversationSession) {
  return session.utterances.filter((utterance) => !utterance.hidden).sort((a, b) => a.startTimeMs - b.startTimeMs);
}

function getPlaybackDurationMs(session: ConversationSession) {
  const utteranceEnd = Math.max(0, ...getPlaybackUtterances(session).map((utterance) => utterance.endTimeMs));
  return Math.max(utteranceEnd, 1000);
}

function typedUtteranceText(utterance: Utterance, playbackMs: number) {
  if (playbackMs >= utterance.endTimeMs) return utterance.text;
  const glyphs = Array.from(utterance.text);
  const duration = Math.min(900, Math.max(260, glyphs.length * 45));
  const elapsed = Math.max(0, playbackMs - utterance.startTimeMs);
  const visibleCount = Math.max(1, Math.ceil((elapsed / duration) * glyphs.length));
  return glyphs.slice(0, visibleCount).join("");
}

function suggestTitleFromSession(session: ConversationSession) {
  const joinedText = session.utterances.map((utterance) => utterance.text).join(" ");
  const matched = titleKeywordRules.find((rule) => rule.keywords.some((keyword) => joinedText.includes(keyword)));
  if (matched) return matched.title;

  const firstText = session.utterances.find((utterance) => utterance.text.trim().length > 0)?.text ?? "";
  const cleaned = firstText.replace(/[、。！？!?「」『』（）()\s]/g, "").slice(0, 10);
  return cleaned || `${formatDate(session.startedAt)}の会話`;
}

function getAlbumIcon(title?: string) {
  const label = title ?? "";
  if (label.includes("焼肉")) return "grill";
  if (label.includes("ドライブ")) return "drive";
  if (label.includes("ごはん") || label.includes("実家")) return "home";
  if (label.includes("旅行")) return "trip";
  return "talk";
}

export default function SetlogPrototype() {
  const [screen, setScreen] = useState<Screen>("home");
  const [people, setPeople] = useState<Person[]>([]);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [tempSession, setTempSession] = useState<ConversationSession | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  const [newPersonName, setNewPersonName] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [participantCount, setParticipantCount] = useState(3);
  const [personPickerReturnScreen, setPersonPickerReturnScreen] = useState<"participants" | "post-participants">("participants");
  const [assignmentIndex, setAssignmentIndex] = useState(0);
  const [processingLog, setProcessingLog] = useState<string[]>([]);
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const [lowVolume, setLowVolume] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0.18);
  const [now, setNow] = useState(Date.now());
  const [correction, setCorrection] = useState<CorrectionState | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [pendingSpeakerPersonId, setPendingSpeakerPersonId] = useState<string | null | undefined>(undefined);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchPersonId, setSearchPersonId] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const [searchTitle, setSearchTitle] = useState("");
  const [searchEventType, setSearchEventType] = useState("");
  const [playbackMs, setPlaybackMs] = useState(0);
  const [playbackRunning, setPlaybackRunning] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [compressSilence, setCompressSilence] = useState(true);
  const [speechCaptureStatus, setSpeechCaptureStatus] = useState<SpeechCaptureStatus>("idle");
  const [capturedTranscriptCount, setCapturedTranscriptCount] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const capturedTranscriptsRef = useRef<CapturedTranscript[]>([]);
  const temporaryAudioRef = useRef<Blob | null>(null);
  const recordingStartedAtRef = useRef<string>("");
  const recordingEndedAtRef = useRef<string>("");
  const processingStartedRef = useRef(false);
  const playbackLastTickRef = useRef<number | null>(null);
  const playbackScrollerRef = useRef<HTMLDivElement | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechShouldRunRef = useRef(false);
  const speechRestartTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const loadedPeople = loadPeople();
    const loadedSessions = loadSessions();
    setPeople(loadedPeople);
    setSessions(loadedSessions);
    setSelectedParticipantIds([]);
    setActiveSessionId(loadedSessions[0]?.id ?? null);
    setIsOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ENABLE_SW === "true") {
      navigator.serviceWorker.register(assetPath("/sw.js"), { scope: `${basePath || ""}/` }).catch(() => undefined);
    } else if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
    }
  }, []);

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }
    function handleOffline() {
      setIsOffline(true);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (screen !== "recording") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (screen !== "processing") {
      processingStartedRef.current = false;
      return;
    }
    if (processingStartedRef.current) return;
    processingStartedRef.current = true;

    let cancelled = false;

    async function runProcessing() {
      try {
        setProcessingLog([]);
        for (const step of processingSteps) {
          await new Promise((resolve) => window.setTimeout(resolve, 520));
          if (cancelled) return;
          setProcessingLog((current) => (current.includes(step) ? current : [...current, step]));
        }

        const result = await processTemporaryAudio(
          temporaryAudioRef.current,
          recordingChunksRef.current,
          capturedTranscriptsRef.current,
          selectedParticipantIds.length || 3
        );
        if (cancelled) return;

        const session: ConversationSession = {
          id: makeId("session"),
          startedAt: recordingStartedAtRef.current || new Date().toISOString(),
          endedAt: recordingEndedAtRef.current || new Date().toISOString(),
          participantIds: selectedParticipantIds,
          speakerAssignments: result.speakerAssignments,
          utterances: result.utterances,
          events: result.events,
          audioDeleted: result.audioDeleted,
          createdAt: new Date().toISOString()
        };

        temporaryAudioRef.current = null;
        setTempSession(session);
        setTitleInput(suggestTitleFromSession(session));
        setParticipantCount(Math.min(4, Math.max(2, Object.keys(session.speakerAssignments).length || 3)));
        setSelectedParticipantIds(session.participantIds);
        setAssignmentIndex(0);
        setScreen("post-participants");
      } catch {
        recordingChunksRef.current = [];
        temporaryAudioRef.current = null;
        setScreen("process-error");
      }
    }

    void runProcessing();

    return () => {
      cancelled = true;
    };
  }, [screen, selectedParticipantIds]);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? tempSession ?? sessions[0] ?? null,
    [activeSessionId, sessions, tempSession]
  );
  const activePerson = activePersonId ? peopleById.get(activePersonId) ?? null : null;
  const selectedPeople = selectedParticipantIds.map((id) => peopleById.get(id)).filter(Boolean) as Person[];

  useEffect(() => {
    if (screen !== "playback" || !playbackRunning || !activeSession) {
      playbackLastTickRef.current = null;
      return;
    }

    const totalMs = getPlaybackDurationMs(activeSession);
    const utterances = getPlaybackUtterances(activeSession);
    let frame = 0;

    const tick = (timestamp: number) => {
      if (playbackLastTickRef.current === null) {
        playbackLastTickRef.current = timestamp;
      }
      const delta = (timestamp - playbackLastTickRef.current) * playbackSpeed;
      playbackLastTickRef.current = timestamp;
      setPlaybackMs((current) => {
        let next = Math.min(totalMs, current + delta);
        if (compressSilence) {
          const nextUtterance = utterances.find((utterance) => utterance.startTimeMs > next);
          const hasActive = utterances.some((utterance) => {
            return utterance.startTimeMs <= next && utterance.endTimeMs >= next;
          });
          if (!hasActive && nextUtterance && nextUtterance.startTimeMs - next > 2600) {
            next = nextUtterance.startTimeMs - 420;
          }
        }
        if (next >= totalMs) {
          setPlaybackRunning(false);
        }
        return next;
      });
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [screen, playbackRunning, playbackSpeed, compressSilence, activeSession]);

  useEffect(() => {
    if (screen !== "playback") return;
    const node = playbackScrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [screen, playbackMs, activeSession?.id]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const keyword = searchKeyword.trim().toLowerCase();
      const title = searchTitle.trim().toLowerCase();
      const matchesKeyword =
        keyword.length === 0 ||
        session.utterances.some((utterance) => utterance.text.toLowerCase().includes(keyword)) ||
        (session.title ?? "").toLowerCase().includes(keyword);
      const matchesTitle = title.length === 0 || (session.title ?? "").toLowerCase().includes(title);
      const matchesPerson = searchPersonId.length === 0 || session.participantIds.includes(searchPersonId);
      const matchesDate = searchDate.length === 0 || formatInputDate(session.startedAt) === searchDate;
      const matchesEvent = searchEventType.length === 0 || session.events.some((event) => event.type === searchEventType);
      return matchesKeyword && matchesTitle && matchesPerson && matchesDate && matchesEvent;
    });
  }, [searchKeyword, searchTitle, searchPersonId, searchDate, searchEventType, sessions]);

  function replacePeople(nextPeople: Person[]) {
    setPeople(nextPeople);
    savePeople(nextPeople);
  }

  function replaceSessions(nextSessions: ConversationSession[]) {
    const sorted = [...nextSessions].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    setSessions(sorted);
    saveSessions(sorted);
  }

  function updateSession(updated: ConversationSession) {
    replaceSessions(sessions.map((session) => (session.id === updated.id ? updated : session)));
    if (tempSession?.id === updated.id) {
      setTempSession(updated);
    }
  }

  function toggleParticipant(personId: string) {
    setSelectedParticipantIds((current) => {
      if (current.includes(personId)) {
        return current.filter((id) => id !== personId);
      }
      const limit = screen === "post-participants" ? participantCount : 4;
      if (current.length >= limit) {
        return current;
      }
      return [...current, personId];
    });
  }

  function changeParticipantCount(count: number) {
    setParticipantCount(count);
    setSelectedParticipantIds((current) => current.slice(0, count));
  }

  function confirmPostParticipants(assignVoices: boolean) {
    if (!tempSession) return;
    const participantIds = selectedParticipantIds.slice(0, participantCount);
    const updated = {
      ...tempSession,
      participantIds
    };
    setTempSession(updated);
    setAssignmentIndex(0);
    if (assignVoices && participantIds.length > 0) {
      setScreen("speaker-assign");
      return;
    }
    saveConversation(undefined, updated);
  }

  function saveNewPerson(drawingDataUrl: string) {
    const name = newPersonName.trim();
    if (!name) return;

    const person: Person = {
      id: makeId("person"),
      name,
      drawingDataUrl,
      createdAt: new Date().toISOString()
    };
    replacePeople([...people, person]);
    const limit = personPickerReturnScreen === "post-participants" ? participantCount : 4;
    setSelectedParticipantIds((current) => [...current.filter((id) => id !== person.id), person.id].slice(-limit));
    setNewPersonName("");
    setScreen(personPickerReturnScreen);
  }

  async function startCapture() {
    recordingChunksRef.current = [];
    temporaryAudioRef.current = null;
    capturedTranscriptsRef.current = [];
    setCapturedTranscriptCount(0);
    setSpeechCaptureStatus("idle");
    setMicMessage(null);
    setLowVolume(false);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicMessage("会話を残すには\nマイクの許可が必要です");
      startSpeechCapture();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.start(1000);
      startAudioMeter(stream);
      startSpeechCapture();
    } catch {
      setMicMessage("会話を残すには\nマイクの許可が必要です");
      startSpeechCapture();
    }
  }

  function getSpeechRecognitionConstructor() {
    const speechWindow = window as SpeechRecognitionWindow;
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  }

  function addCapturedTranscript(text: string, confidence?: number) {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return;

    const startedAt = recordingStartedAtRef.current ? new Date(recordingStartedAtRef.current).getTime() : Date.now();
    const endTimeMs = Math.max(0, Date.now() - startedAt);
    const estimatedDuration = Math.min(7000, Math.max(900, cleaned.length * 150));
    const startTimeMs = Math.max(0, endTimeMs - estimatedDuration);
    const previous = capturedTranscriptsRef.current.at(-1);

    if (previous && previous.text === cleaned && Math.abs(previous.endTimeMs - endTimeMs) < 1200) {
      return;
    }

    capturedTranscriptsRef.current.push({
      id: makeId("speech"),
      text: cleaned,
      startTimeMs,
      endTimeMs: Math.max(endTimeMs, startTimeMs + 800),
      confidence,
      source: "speech-recognition"
    });
    setCapturedTranscriptCount(capturedTranscriptsRef.current.length);
  }

  function startSpeechCapture() {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setSpeechCaptureStatus("unsupported");
      return;
    }

    const recognition = new SpeechRecognition();
    speechRecognitionRef.current = recognition;
    speechShouldRunRef.current = true;

    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result?.isFinal || result.length === 0) continue;
        addCapturedTranscript(result[0].transcript, result[0].confidence);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech") {
        return;
      }
      if (event.error === "audio-capture" || event.error === "not-allowed") {
        setSpeechCaptureStatus("error");
      }
    };
    recognition.onend = () => {
      if (!speechShouldRunRef.current) return;
      speechRestartTimerRef.current = window.setTimeout(() => {
        try {
          recognition.start();
          setSpeechCaptureStatus("listening");
        } catch {
          setSpeechCaptureStatus("error");
        }
      }, 350);
    };

    try {
      recognition.start();
      setSpeechCaptureStatus("listening");
    } catch {
      setSpeechCaptureStatus("error");
    }
  }

  function startAudioMeter(stream: MediaStream) {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const data = new Uint8Array(analyser.fftSize);
    let quietFrames = 0;
    source.connect(analyser);

    function tick() {
      analyser.getByteTimeDomainData(data);
      let total = 0;
      for (const value of data) {
        const normalized = (value - 128) / 128;
        total += normalized * normalized;
      }
      const level = Math.sqrt(total / data.length);
      setAudioLevel(Math.min(1, level * 6));
      quietFrames = level < 0.015 ? quietFrames + 1 : 0;
      setLowVolume(quietFrames > 240);
      animationRef.current = window.requestAnimationFrame(tick);
    }
    tick();
  }

  async function stopCapture() {
    stopAudioMeter();
    stopSpeechCapture();
    const recorder = recorderRef.current;
    const stream = streamRef.current;

    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }

    stream?.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    streamRef.current = null;

    if (recordingChunksRef.current.length > 0) {
      temporaryAudioRef.current = new Blob(recordingChunksRef.current, { type: "audio/webm" });
    }
  }

  function stopAudioMeter() {
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }

  function stopSpeechCapture() {
    speechShouldRunRef.current = false;
    if (speechRestartTimerRef.current) {
      window.clearTimeout(speechRestartTimerRef.current);
      speechRestartTimerRef.current = null;
    }

    const recognition = speechRecognitionRef.current;
    if (!recognition) return;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        // Nothing else to clean up; audio chunks are still deleted later.
      }
    }
    speechRecognitionRef.current = null;
  }

  function beginRecordingFlow(participantIds = selectedParticipantIds) {
    if (participantIds.length > 4) return;
    setSelectedParticipantIds(participantIds);
    const nowIso = new Date().toISOString();
    recordingStartedAtRef.current = recordingStartedAtRef.current || nowIso;
    recordingEndedAtRef.current = "";
    setNow(Date.now());
    setScreen("recording");
    void startCapture();
  }

  async function moveToFinish() {
    recordingEndedAtRef.current = new Date().toISOString();
    await stopCapture();
    setScreen("finish");
  }

  function resetDraft() {
    recordingStartedAtRef.current = "";
    recordingEndedAtRef.current = "";
    recordingChunksRef.current = [];
    capturedTranscriptsRef.current = [];
    temporaryAudioRef.current = null;
    setCapturedTranscriptCount(0);
    setSpeechCaptureStatus("idle");
    setTempSession(null);
    setTitleInput("");
    setAssignmentIndex(0);
    setParticipantCount(3);
    setSelectedParticipantIds([]);
  }

  function assignSpeaker(personId: string | null) {
    if (!tempSession) return;
    const speakerIds = Object.keys(tempSession.speakerAssignments);
    const speakerId = speakerIds[assignmentIndex];
    if (!speakerId) {
      saveConversation(undefined, tempSession);
      return;
    }
    const nextParticipantIds =
      personId && !tempSession.participantIds.includes(personId) ? [...tempSession.participantIds, personId] : tempSession.participantIds;

    const updated: ConversationSession = {
      ...tempSession,
      participantIds: nextParticipantIds,
      speakerAssignments: {
        ...tempSession.speakerAssignments,
        [speakerId]: personId
      },
      utterances: tempSession.utterances.map((utterance) =>
        utterance.speakerId === speakerId ? { ...utterance, personId } : utterance
      )
    };

    setTempSession(updated);
    if (assignmentIndex >= speakerIds.length - 1) {
      saveConversation(undefined, updated);
    } else {
      setAssignmentIndex((current) => current + 1);
    }
  }

  function saveConversation(title?: string, sourceSession?: ConversationSession) {
    const session = sourceSession ?? tempSession;
    if (!session) return;
    const trimmed = title?.trim();
    const saved: ConversationSession = {
      ...session,
      title: trimmed || suggestTitleFromSession(session),
      audioDeleted: true,
      createdAt: new Date().toISOString()
    };
    replaceSessions([saved, ...sessions.filter((session) => session.id !== saved.id)]);
    setTempSession(saved);
    setActiveSessionId(saved.id);
    setScreen("done");
  }

  function openDetail(sessionId: string) {
    setActiveSessionId(sessionId);
    setPlaybackRunning(false);
    setPlaybackMs(0);
    setScreen("detail");
  }

  function openPlayback(sessionId: string) {
    setActiveSessionId(sessionId);
    setPlaybackMs(0);
    setPlaybackRunning(true);
    setScreen("playback");
  }

  function openCorrection(utterance: Utterance, mode: CorrectionState["mode"] = "menu") {
    setCorrection({ utteranceId: utterance.id, mode });
    setTextDraft(utterance.text);
    setPendingSpeakerPersonId(undefined);
  }

  function closeCorrection() {
    setCorrection(null);
    setPendingSpeakerPersonId(undefined);
    setTextDraft("");
  }

  function saveTextCorrection() {
    if (!activeSession || !correction) return;
    const updated = {
      ...activeSession,
      utterances: activeSession.utterances.map((utterance) =>
        utterance.id === correction.utteranceId ? { ...utterance, text: textDraft.trim() || utterance.text } : utterance
      )
    };
    updateSession(updated);
    closeCorrection();
  }

  function hideUtterance() {
    if (!activeSession || !correction) return;
    const updated = {
      ...activeSession,
      utterances: activeSession.utterances.map((utterance) =>
        utterance.id === correction.utteranceId ? { ...utterance, hidden: true } : utterance
      )
    };
    updateSession(updated);
    closeCorrection();
  }

  function applySpeakerCorrection(scope: "one" | "all") {
    if (!activeSession || !correction || pendingSpeakerPersonId === undefined) return;
    const target = activeSession.utterances.find((utterance) => utterance.id === correction.utteranceId);
    if (!target) return;
    const nextParticipantIds =
      pendingSpeakerPersonId && !activeSession.participantIds.includes(pendingSpeakerPersonId)
        ? [...activeSession.participantIds, pendingSpeakerPersonId]
        : activeSession.participantIds;

    const updated = {
      ...activeSession,
      participantIds: nextParticipantIds,
      speakerAssignments:
        scope === "all"
          ? {
              ...activeSession.speakerAssignments,
              [target.speakerId]: pendingSpeakerPersonId
            }
          : activeSession.speakerAssignments,
      utterances: activeSession.utterances.map((utterance) => {
        const shouldChange = scope === "all" ? utterance.speakerId === target.speakerId : utterance.id === target.id;
        return shouldChange ? { ...utterance, personId: pendingSpeakerPersonId } : utterance;
      })
    };

    updateSession(updated);
    closeCorrection();
  }

  function renderPersonChip(person: Person, selected = false) {
    return (
      <span className={selected ? "person-chip selected" : "person-chip"} key={person.id}>
        <img src={person.drawingDataUrl} alt="" />
        <span>{person.name}</span>
      </span>
    );
  }

  function renderPrivacyNote(compact = false) {
    return (
      <div className={compact ? "privacy-note compact" : "privacy-note"}>
        <span className="pixel-lock" aria-hidden="true" />
        <span>音声は会話を整理したあと削除されます。</span>
      </div>
    );
  }

  function renderSpeechCaptureNote() {
    if (speechCaptureStatus === "listening") {
      return (
        <div className="capture-note live">
          <span className="capture-pixel" aria-hidden="true" />
          <span>
            ことばの順番を記録中
            <small>内容は画面に出しません / {capturedTranscriptCount}件</small>
          </span>
        </div>
      );
    }

    if (speechCaptureStatus === "unsupported") {
      return (
        <div className="capture-note">
          <span className="capture-pixel muted" aria-hidden="true" />
          <span>
            この端末では文字起こし補助が使えません
            <small>会話フローはサンプルで確認できます</small>
          </span>
        </div>
      );
    }

    if (speechCaptureStatus === "error") {
      return (
        <div className="capture-note">
          <span className="capture-pixel muted" aria-hidden="true" />
          <span>
            ことばを拾えませんでした
            <small>マイク許可やHTTPS接続を確認してください</small>
          </span>
        </div>
      );
    }

    return null;
  }

  function renderPixelFace(size: "small" | "large" = "small") {
    return (
      <span className={`pixel-face ${size}`} aria-hidden="true">
        <span />
      </span>
    );
  }

  function renderHearts() {
    return (
      <span className="heart-trail" aria-hidden="true">
        ♥ ♥ ♥ ♥ ♥
      </span>
    );
  }

  function renderMiniBrand() {
    return (
      <div className="mini-brand">
        {renderPixelFace("small")}
        <div>
          <strong>SETLOG</strong>
          <span>
            V.1.0 <i />
          </span>
        </div>
      </div>
    );
  }

  function renderTopBar(label?: string) {
    return (
      <div className="top-bar">
        <button type="button" className="icon-button" onClick={() => setScreen("home")} aria-label="ホームへ戻る">
          ←
        </button>
        <span className="top-title">{label ?? "SETLOG"}</span>
        <span className="top-icons" aria-hidden="true">
          <span className="pixel-flower">✿</span>
          <span className="pixel-menu">☰</span>
        </span>
      </div>
    );
  }

  function renderHome() {
    return (
      <section className="screen-section home-screen">
        <header className="brand-block">
          {renderMiniBrand()}
          <div className="onair-badge">
            <span />
            ON AIR
          </div>
        </header>

        <button
          type="button"
          className="mic-record-button"
          onClick={() => {
            resetDraft();
            beginRecordingFlow([]);
          }}
          aria-label="会話を記録する"
        >
          <span className="mic-ring one" />
          <span className="mic-ring two" />
          <div className="pixel-mic" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <strong>REC</strong>
        </button>
        <p className="home-tap">TAP</p>
        {renderPrivacyNote(true)}

        <div className="bottom-actions">
          <button type="button" className="text-button" onClick={() => setScreen("album")}>
            ▣ 過去の会話を見る ›
          </button>
        </div>
      </section>
    );
  }

  function renderParticipants() {
    const canStart = selectedParticipantIds.length >= 2 && selectedParticipantIds.length <= 4;
    return (
      <section className="screen-section">
        {renderTopBar("MEMBER")}
        <h1>
          TODAY,
          <br />
          今日は誰と過ごす？
        </h1>
        <div className="participant-list">
          {people.map((person) => {
            const selected = selectedParticipantIds.includes(person.id);
            return (
              <button
                type="button"
                className={selected ? "participant-row selected" : "participant-row"}
                key={person.id}
                onClick={() => toggleParticipant(person.id)}
              >
                <img src={person.drawingDataUrl} alt="" />
                <span className="check">{selected ? "☑" : "□"}</span>
                <span>{person.name}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setPersonPickerReturnScreen("participants");
            setScreen("add-person");
          }}
        >
          ＋ 新しい人を追加
        </button>
        <div className="sticky-action">
          <p className="microcopy">2〜4人を選んでください</p>
          <button type="button" className="primary-button" disabled={!canStart} onClick={() => beginRecordingFlow()}>
            このメンバーで残す
            <span className="button-arrow">›</span>
          </button>
        </div>
      </section>
    );
  }

  function renderAddPerson() {
    return (
      <section className="screen-section">
        {renderTopBar("DRAW")}
        <h1>その人を描いてみよう</h1>
        <p className="lead">似てなくて大丈夫。思い出せればOK。</p>
        <label className="input-label" htmlFor="person-name">
          名前
        </label>
        <input
          id="person-name"
          className="text-input"
          value={newPersonName}
          onChange={(event) => setNewPersonName(event.target.value)}
          placeholder="例：あき"
        />
        <DrawingCanvas onSave={saveNewPerson} />
      </section>
    );
  }

  function renderRecording() {
    const started = recordingStartedAtRef.current ? new Date(recordingStartedAtRef.current).getTime() : now;
    const elapsed = Math.max(0, now - started);

    return (
      <section className="screen-section recording-screen">
        <div className="recording-header">
          <span>
            <span className="record-dot" />
            RECORDING
          </span>
          {renderHearts()}
          <span>{shortDuration(elapsed)}</span>
        </div>
        <div className="mini-portraits">
          {selectedPeople.length > 0 ? (
            selectedPeople.map((person) => renderPersonChip(person, true))
          ) : (
            <span className="later-note">人物はあとで設定できます</span>
          )}
        </div>
        <div className="signal-box" aria-label="音声の取得状態">
          <span style={{ height: `${24 + audioLevel * 52}px` }} />
          <span style={{ height: `${42 + audioLevel * 40}px` }} />
          <span style={{ height: `${28 + audioLevel * 56}px` }} />
          <span style={{ height: `${36 + audioLevel * 44}px` }} />
        </div>
        <h1>今日を残しています</h1>
        <p className="lead">スマホをみんなの近くに置いてください</p>
        {renderSpeechCaptureNote()}
        {micMessage ? <div className="error-card">{micMessage}</div> : null}
        {isOffline ? <div className="notice-card">記録は続いています<br />通信が戻ったら整理します</div> : null}
        {lowVolume ? <div className="notice-card">声が少し遠いようです<br />スマホをみんなの近くに置いてください</div> : null}
        <div className="sticky-action">
          <button type="button" className="danger-button" onClick={() => void moveToFinish()}>
            終了する
          </button>
        </div>
      </section>
    );
  }

  function renderFinish() {
    return (
      <section className="screen-section center-screen">
        <h1>FINISH?</h1>
        <h2>今日を閉じる？</h2>
        <p className="lead">会話を整理して、思い出にしまいます。</p>
        <div className="finish-icon" aria-hidden="true">
          <div className="pixel-mic small">
            <span />
            <span />
            <span />
          </div>
        </div>
        <button type="button" className="primary-button huge" onClick={() => setScreen("processing")}>
          思い出にする
          <span className="button-arrow">›</span>
        </button>
        <button type="button" className="secondary-button" onClick={() => beginRecordingFlow()}>
          まだ続ける
        </button>
      </section>
    );
  }

  function renderProcessing() {
    return (
      <section className="screen-section center-screen">
        <div className="pixel-loader" aria-hidden="true" />
        <h1>今日を整理しています</h1>
        <div className="processing-list">
          {processingSteps.map((step) => (
            <div className={processingLog.includes(step) ? "processing-item done" : "processing-item"} key={step}>
              <span>{processingLog.includes(step) ? "■" : "□"}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
        <div className="audio-deleted-note">音声は保存されません</div>
      </section>
    );
  }

  function renderProcessError() {
    return (
      <section className="screen-section center-screen">
        <h1>会話を整理できませんでした</h1>
        <p className="lead">一時データを削除します</p>
        <button type="button" className="primary-button" onClick={() => setScreen("home")}>
          ホームへ戻る
        </button>
      </section>
    );
  }

  function renderPostParticipants() {
    if (!tempSession) return null;
    const detectedCount = Object.keys(tempSession.speakerAssignments).length;
    const canAssign = selectedParticipantIds.length > 0;
    return (
      <section className="screen-section">
        {renderTopBar("WHO")}
        <h1>
          何人で
          <br />
          話してた？
        </h1>
        <div className="count-picker" aria-label="人数">
          {[2, 3, 4].map((count) => (
            <button
              type="button"
              className={participantCount === count ? "count-choice selected" : "count-choice"}
              key={count}
              onClick={() => changeParticipantCount(count)}
            >
              {count}
              <span>人</span>
            </button>
          ))}
        </div>
        <p className="microcopy">検出された声: {detectedCount || "?"} / 人物はあとで直せます</p>

        <h2 className="section-label">いた人</h2>
        <div className="participant-list compact">
          {people.map((person) => {
            const selected = selectedParticipantIds.includes(person.id);
            return (
              <button
                type="button"
                className={selected ? "participant-row selected" : "participant-row"}
                key={person.id}
                onClick={() => toggleParticipant(person.id)}
              >
                <img src={person.drawingDataUrl} alt="" />
                <span className="check">{selected ? "☑" : "□"}</span>
                <span>{person.name}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setPersonPickerReturnScreen("post-participants");
            setScreen("add-person");
          }}
        >
          ＋ 新しい人を追加
        </button>
        <div className="sticky-action">
          <button type="button" className="primary-button" disabled={!canAssign} onClick={() => confirmPostParticipants(true)}>
            声にあてはめる
            <span className="button-arrow">›</span>
          </button>
          <button type="button" className="text-button" onClick={() => confirmPostParticipants(false)}>
            あとで設定する
          </button>
        </div>
      </section>
    );
  }

  function renderSpeakerAssign() {
    if (!tempSession) return null;
    const speakerIds = Object.keys(tempSession.speakerAssignments);
    const speakerId = speakerIds[assignmentIndex];
    if (!speakerId) {
      return (
        <section className="screen-section center-screen">
          <h1>声の確認が終わりました</h1>
          <button type="button" className="primary-button huge" onClick={() => saveConversation(undefined, tempSession)}>
            保存する
          </button>
        </section>
      );
    }
    const sample = tempSession.utterances.find((utterance) => utterance.speakerId === speakerId);

    return (
      <section className="screen-section">
        {renderTopBar("VOICE")}
        <h1>この声は誰？</h1>
        <p className="lead">音声は保存しないため、今は発言テキストで確認します。</p>
        <div className="quote-box">「{sample?.text ?? "うまく聞き取れない部分"}」</div>
        <div className="assign-grid">
          {selectedPeople.map((person) => (
            <button type="button" className="person-choice" key={person.id} onClick={() => assignSpeaker(person.id)}>
              <img src={person.drawingDataUrl} alt="" />
              <span>{person.name}</span>
            </button>
          ))}
          <button type="button" className="person-choice unknown" onClick={() => assignSpeaker(null)}>
            <span className="unknown-face">?</span>
            <span>わからない</span>
          </button>
        </div>
        <div className="notice-card">誰が話したか分からない部分があります<br />あとから確認できます</div>
        <button type="button" className="text-button" onClick={() => saveConversation(undefined, tempSession)}>
          残りはあとで
        </button>
      </section>
    );
  }

  function renderTitleInput() {
    const suggested = tempSession ? suggestTitleFromSession(tempSession) : titleInput;
    return (
      <section className="screen-section center-screen">
        <h1>名前をつけました</h1>
        <div className="auto-title">{suggested || "名前のない日"}</div>
        <button type="button" className="primary-button huge" onClick={() => saveConversation(suggested)}>
          保存する
          <span className="button-arrow">›</span>
        </button>
        <button type="button" className="secondary-button" onClick={() => saveConversation(undefined)}>
          このまま保存
        </button>
      </section>
    );
  }

  function renderDone() {
    return (
      <section className="screen-section center-screen">
        <div className="done-label">DONE!</div>
        <div className="pixel-heart" aria-hidden="true" />
        <h1>
          今日の会話を
          <br />
          アルバムにしました
        </h1>
        <div className="audio-deleted-note">音声は削除済み</div>
        <button
          type="button"
          className="primary-button huge"
          onClick={() => {
            if (tempSession) openPlayback(tempSession.id);
          }}
        >
          振り返る
          <span className="button-arrow">›</span>
        </button>
        <button type="button" className="secondary-button" onClick={() => setScreen("home")}>
          ホームへ戻る
        </button>
      </section>
    );
  }

  function renderAlbum() {
    return (
      <section className="screen-section">
        {renderTopBar("ALBUM")}
        <div className="month-label">2026年 8月</div>
        <div className="quick-nav">
          <button type="button" onClick={() => setScreen("people")}>
            人物ごと
          </button>
          <button type="button" onClick={() => setScreen("search")}>
            検索
          </button>
        </div>
        <div className="album-list">
          {sessions.map((session) => {
            const participantLabel = session.participantIds.length > 0 ? `${session.participantIds.length}人` : "人物はあとで";
            return (
              <button type="button" className="album-card" key={session.id} onClick={() => openDetail(session.id)}>
                <span className={`album-pixel-icon ${getAlbumIcon(session.title)}`} aria-hidden="true" />
                <div>
                  <div className="album-title">{session.title || "名前のない日"}</div>
                  <div className="album-meta">
                    {formatDate(session.startedAt)} {formatTime(session.startedAt)}〜{formatTime(session.endedAt)}
                  </div>
                  <div className="album-meta">
                    ♙ {participantLabel}　◷ {durationLabel(session.startedAt, session.endedAt)}
                  </div>
                </div>
                <div className="portrait-stack">
                  {session.participantIds.map((id) => {
                    const person = peopleById.get(id);
                    return person ? <img src={person.drawingDataUrl} alt="" key={id} /> : null;
                  })}
                </div>
                <span className="card-arrow">›</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderTimeline(session: ConversationSession) {
    const items = sessionTimeline(session);
    return (
      <div className="timeline">
        {items.map((item) => {
          if (item.kind === "event") {
            return (
              <div className={`timeline-event ${item.event.type}`} key={item.id}>
                <span className="timeline-time">{formatTimelineTime(session, item.event.startTimeMs)}</span>
                <span>{eventLabel(item.event)}</span>
              </div>
            );
          }

          const person = item.utterance.personId ? peopleById.get(item.utterance.personId) : null;
          return (
            <div className="timeline-utterance" key={item.id} onDoubleClick={() => openCorrection(item.utterance)}>
              <span className="timeline-time">{formatTimelineTime(session, item.utterance.startTimeMs)}</span>
              <img src={person?.drawingDataUrl ?? assetPath("/icon.svg")} alt="" />
              <div className="utterance-body">
                <div className="utterance-head">
                  <span>{person?.name ?? "わからない"}</span>
                  <button type="button" className="mini-menu" onClick={() => openCorrection(item.utterance)}>
                    ...
                  </button>
                </div>
                <p>{item.utterance.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderDetail() {
    if (!activeSession) return null;
    return (
      <section className="screen-section">
        {renderTopBar("LOG")}
        <div className="detail-title-row">
          <div>
            <h1>{activeSession.title || "名前のない日"}</h1>
            <p className="album-meta">
              {formatDate(activeSession.startedAt)} {formatTime(activeSession.startedAt)}〜{formatTime(activeSession.endedAt)}
            </p>
          </div>
          <button type="button" className="play-button" onClick={() => openPlayback(activeSession.id)}>
            ▶
          </button>
        </div>
        {activeSession.participantIds.length > 0 ? (
          <div className="participant-strip">
            {activeSession.participantIds.map((id) => {
              const person = peopleById.get(id);
              return person ? (
                <span className="strip-person" key={id}>
                  <img src={person.drawingDataUrl} alt="" />
                  <span>{person.name}</span>
                </span>
              ) : null;
            })}
          </div>
        ) : (
          <div className="later-note wide">人物はあとで設定できます</div>
        )}
        {activeSession.audioDeleted ? <div className="audio-deleted-note">音声は削除済み</div> : renderPrivacyNote(true)}
        {renderTimeline(activeSession)}
        {renderCorrectionSheet()}
      </section>
    );
  }

  function renderCorrectionSheet() {
    if (!activeSession || !correction) return null;
    const utterance = activeSession.utterances.find((item) => item.id === correction.utteranceId);
    if (!utterance) return null;

    return (
      <div className="sheet-backdrop" role="dialog" aria-modal="true">
        <div className="bottom-sheet">
          <div className="sheet-grip" />
          {correction.mode === "menu" ? (
            <>
              <h2>この発言を直す</h2>
              <button type="button" className="sheet-button" onClick={() => setCorrection({ ...correction, mode: "speaker" })}>
                話した人を変更
              </button>
              <button type="button" className="sheet-button" onClick={() => setCorrection({ ...correction, mode: "text" })}>
                文章を修正
              </button>
              <button type="button" className="sheet-button danger" onClick={hideUtterance}>
                この発言を非表示
              </button>
              <button type="button" className="text-button" onClick={closeCorrection}>
                閉じる
              </button>
            </>
          ) : null}

          {correction.mode === "text" ? (
            <>
              <h2>文章を修正</h2>
              <textarea className="text-area" value={textDraft} onChange={(event) => setTextDraft(event.target.value)} />
              <button type="button" className="primary-button" onClick={saveTextCorrection}>
                保存
              </button>
              <button type="button" className="text-button" onClick={() => setCorrection({ ...correction, mode: "menu" })}>
                戻る
              </button>
            </>
          ) : null}

          {correction.mode === "speaker" ? (
            <>
              <h2>話した人を変更</h2>
              <div className="assign-grid compact">
                {people.map((person) => {
                  return (
                    <button
                      type="button"
                      className={pendingSpeakerPersonId === person.id ? "person-choice selected" : "person-choice"}
                      key={person.id}
                      onClick={() => setPendingSpeakerPersonId(person.id)}
                    >
                      <img src={person.drawingDataUrl} alt="" />
                      <span>{person.name}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={pendingSpeakerPersonId === null ? "person-choice selected unknown" : "person-choice unknown"}
                  onClick={() => setPendingSpeakerPersonId(null)}
                >
                  <span className="unknown-face">?</span>
                  <span>わからない</span>
                </button>
              </div>
              <button
                type="button"
                className="primary-button small"
                disabled={pendingSpeakerPersonId === undefined}
                onClick={() => applySpeakerCorrection("one")}
              >
                この発言だけ変更
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={pendingSpeakerPersonId === undefined}
                onClick={() => applySpeakerCorrection("all")}
              >
                同じ話者の発言をすべて変更
              </button>
              <button type="button" className="text-button" onClick={() => setCorrection({ ...correction, mode: "menu" })}>
                戻る
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  function renderPlayback() {
    if (!activeSession) return null;
    const session = activeSession;
    const totalMs = getPlaybackDurationMs(session);
    const progress = Math.min(100, (playbackMs / totalMs) * 100);
    const utterances = getPlaybackUtterances(session);
    const visibleUtterances = utterances.filter((utterance) => utterance.startTimeMs <= playbackMs);
    const activeLaughEvents = session.events.filter((event) => {
      if (event.type !== "laugh") return false;
      const end = event.endTimeMs ?? event.startTimeMs + 1400;
      return event.startTimeMs <= playbackMs && end >= playbackMs;
    });

    return (
      <section className="screen-section playback-screen">
        {renderTopBar("REPLAY")}
        <div className="playback-head">
          <h1>{session.title || "名前のない日"}</h1>
          <p>
            {formatDate(session.startedAt)} {formatTime(session.startedAt)} - {formatTime(session.endedAt)}
          </p>
        </div>
        {session.participantIds.length > 0 ? (
          <div className="participant-strip compact">
            {session.participantIds.map((id) => {
              const person = peopleById.get(id);
              return person ? (
                <span className="strip-person" key={id}>
                  <img src={person.drawingDataUrl} alt="" />
                  <span>{person.name}</span>
                </span>
              ) : null;
            })}
          </div>
        ) : (
          <div className="later-note wide compact">人物はあとで設定できます</div>
        )}
        {activeLaughEvents.length > 0 ? (
          <div className="laugh-float-layer" aria-hidden="true">
            {activeLaughEvents.flatMap((event, eventIndex) =>
              Array.from({ length: 6 }, (_, index) => (
                <span className={`laugh-emoji e${index}`} key={`${event.id}-${eventIndex}-${index}`}>
                  😂
                </span>
              ))
            )}
          </div>
        ) : null}
        <div className="chat-playback-list" ref={playbackScrollerRef}>
          {visibleUtterances.map((utterance) => {
            const person = utterance.personId ? peopleById.get(utterance.personId) : null;
            const isMine = person?.id === "person-me" || person?.name === "自分";
            const isTyping = playbackMs >= utterance.startTimeMs && playbackMs < utterance.endTimeMs;
            const shownText = typedUtteranceText(utterance, playbackMs);
            return (
              <div className={isMine ? "chat-message mine" : "chat-message other"} key={utterance.id}>
                {!isMine ? <img src={person?.drawingDataUrl ?? assetPath("/icon.svg")} alt="" /> : null}
                <div className="chat-stack">
                  <div className="chat-meta">
                    <span>{person?.name ?? "わからない"}</span>
                    <time>{formatTimelineTime(session, utterance.startTimeMs)}</time>
                  </div>
                  <div className={isTyping ? "chat-bubble typing" : "chat-bubble"}>
                    <span>{shownText}</span>
                    {isTyping ? <i aria-hidden="true" /> : null}
                  </div>
                </div>
                {isMine ? <img src={person?.drawingDataUrl ?? assetPath("/icon.svg")} alt="" /> : null}
              </div>
            );
          })}
        </div>
        <div className="player-dock">
          <div className="playback-controls">
            <button type="button" className="icon-button" onClick={() => setPlaybackMs((current) => Math.max(0, current - 10000))}>
              -10
            </button>
            <button type="button" className="primary-button small" onClick={() => setPlaybackRunning((current) => !current)}>
              {playbackRunning ? "一時停止" : playbackMs > 0 ? "再開" : "再生"}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setPlaybackMs((current) => Math.min(totalMs, current + 10000))}
            >
              +10
            </button>
          </div>
          <div className="progress-wrap">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div className="player-time">
            <span>{shortDuration(playbackMs)}</span>
            <span>{shortDuration(totalMs)}</span>
          </div>
          <div className="speed-row">
            {[0.75, 1, 1.25, 1.5].map((speed) => (
              <button
                type="button"
                className={playbackSpeed === speed ? "speed active" : "speed"}
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
              >
                {speed}x
              </button>
            ))}
          </div>
          <label className="toggle-row">
            <input type="checkbox" checked={compressSilence} onChange={(event) => setCompressSilence(event.target.checked)} />
            <span>長い沈黙を短くする</span>
          </label>
        </div>
      </section>
    );
  }

  function renderPeople() {
    return (
      <section className="screen-section">
        {renderTopBar("PEOPLE")}
        <h1>人物ごとの思い出</h1>
        <div className="people-memory-list">
          {people.map((person) => {
            const count = sessions.filter((session) => session.participantIds.includes(person.id)).length;
            return (
              <button
                type="button"
                className="memory-person-card"
                key={person.id}
                onClick={() => {
                  setActivePersonId(person.id);
                  setScreen("person-detail");
                }}
              >
                <img src={person.drawingDataUrl} alt="" />
                <span>{person.name}</span>
                <small>一緒に残した会話 {count}件</small>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderPersonDetail() {
    if (!activePerson) return null;
    const personSessions = sessions.filter((session) => session.participantIds.includes(activePerson.id));
    return (
      <section className="screen-section">
        {renderTopBar("MEMORY")}
        <div className="person-memory-head">
          <img src={activePerson.drawingDataUrl} alt="" />
          <div>
            <h1>{activePerson.name}</h1>
            <p>一緒に残した会話 {personSessions.length}件</p>
          </div>
        </div>
        <div className="album-list compact">
          {personSessions.map((session) => (
            <button type="button" className="memory-row" key={session.id} onClick={() => openDetail(session.id)}>
              <span>{session.title || "名前のない日"}</span>
              <small>{formatDate(session.startedAt)}</small>
            </button>
          ))}
        </div>
      </section>
    );
  }

  function renderSearch() {
    return (
      <section className="screen-section">
        {renderTopBar("SEARCH")}
        <h1>検索・絞り込み</h1>
        <label className="input-label" htmlFor="keyword">
          キーワード
        </label>
        <input
          id="keyword"
          className="text-input"
          value={searchKeyword}
          onChange={(event) => setSearchKeyword(event.target.value)}
          placeholder="会話の言葉"
        />
        <label className="input-label" htmlFor="title-search">
          タイトル
        </label>
        <input
          id="title-search"
          className="text-input"
          value={searchTitle}
          onChange={(event) => setSearchTitle(event.target.value)}
          placeholder="焼肉"
        />
        <label className="input-label" htmlFor="person-search">
          人
        </label>
        <select id="person-search" className="text-input" value={searchPersonId} onChange={(event) => setSearchPersonId(event.target.value)}>
          <option value="">すべて</option>
          {people.map((person) => (
            <option value={person.id} key={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <label className="input-label" htmlFor="date-search">
          日付
        </label>
        <input
          id="date-search"
          className="text-input"
          type="date"
          value={searchDate}
          onChange={(event) => setSearchDate(event.target.value)}
        />
        <label className="input-label" htmlFor="event-search">
          できごと
        </label>
        <select
          id="event-search"
          className="text-input"
          value={searchEventType}
          onChange={(event) => setSearchEventType(event.target.value)}
        >
          <option value="">すべて</option>
          {eventFilterOptions.map((event) => (
            <option value={event.value} key={event.value}>
              {event.label}
            </option>
          ))}
        </select>
        <div className="search-note">保存された会話テキストとメタデータだけを探します。</div>
        <div className="album-list compact">
          {filteredSessions.map((session) => (
            <button type="button" className="memory-row" key={session.id} onClick={() => openDetail(session.id)}>
              <span>{session.title || "名前のない日"}</span>
              <small>
                {formatDate(session.startedAt)} / {session.participantIds.length}人
              </small>
            </button>
          ))}
        </div>
      </section>
    );
  }

  let content: React.ReactNode = null;
  if (screen === "home") content = renderHome();
  if (screen === "participants") content = renderParticipants();
  if (screen === "add-person") content = renderAddPerson();
  if (screen === "recording") content = renderRecording();
  if (screen === "finish") content = renderFinish();
  if (screen === "processing") content = renderProcessing();
  if (screen === "process-error") content = renderProcessError();
  if (screen === "post-participants") content = renderPostParticipants();
  if (screen === "speaker-assign") content = renderSpeakerAssign();
  if (screen === "title") content = renderTitleInput();
  if (screen === "done") content = renderDone();
  if (screen === "album") content = renderAlbum();
  if (screen === "detail") content = renderDetail();
  if (screen === "playback") content = renderPlayback();
  if (screen === "people") content = renderPeople();
  if (screen === "person-detail") content = renderPersonDetail();
  if (screen === "search") content = renderSearch();

  return (
    <main className="app-shell">
      <div className="phone-frame">{content}</div>
    </main>
  );
}
