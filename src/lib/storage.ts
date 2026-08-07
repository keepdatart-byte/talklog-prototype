import { createSeedPeople, createSeedSession } from "./mockData";
import type { ConversationSession, Person } from "./types";

const PEOPLE_KEY = "setlog.people.v1";
const SESSIONS_KEY = "setlog.sessions.v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadPeople(): Person[] {
  const people = readJson<Person[]>(PEOPLE_KEY, []);
  if (people.length > 0) {
    return people;
  }

  const seeded = createSeedPeople();
  writeJson(PEOPLE_KEY, seeded);
  return seeded;
}

export function loadSessions(): ConversationSession[] {
  const sessions = readJson<ConversationSession[]>(SESSIONS_KEY, []);
  if (sessions.length > 0) {
    return sessions;
  }

  const seeded = [createSeedSession()];
  writeJson(SESSIONS_KEY, seeded);
  return seeded;
}

export function savePeople(people: Person[]) {
  writeJson(PEOPLE_KEY, people);
}

export function saveSessions(sessions: ConversationSession[]) {
  writeJson(SESSIONS_KEY, sessions);
}
