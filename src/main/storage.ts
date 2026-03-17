import { randomUUID } from "node:crypto";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  ActivationShortcut,
  AppThemeName,
  AppSettings,
  CustomThemeColors,
  LocalData,
  ManualDictionaryEntry,
  SaveVoiceProfileInput,
  UserStats,
  VoiceEmbedding,
  VoiceProfile
} from "../shared/types";

const defaultActivationShortcut: ActivationShortcut = {
  modifiers: ["meta", "ctrl"],
  key: null
};

const defaultAppTheme: AppThemeName = "aurora";
const defaultCustomTheme: CustomThemeColors = {
  primary: "#5ef0ba",
  secondary: "#54d8ff",
  tertiary: "#ff77c8"
};

const defaultSettings: AppSettings = {
  selectedMicId: null,
  whisperBinaryPath: "",
  whisperModelPath: "",
  transcriptHistoryLimit: 3,
  autoVerifySpeaker: false,
  activeProfileId: null,
  autoPaste: true,
  launchOnLogin: false,
  alwaysShowPill: false,
  muteDictationSounds: false,
  appSoundVolume: 80,
  muteMusicWhileDictating: false,
  autoLearnDictionary: false,
  smartFormatting: true,
  activationShortcut: defaultActivationShortcut,
  appTheme: defaultAppTheme,
  customTheme: defaultCustomTheme,
  onboardingCompleted: false,
  devModeUnlocked: false,
  devModeEnabled: false
};

const defaultData: LocalData = {
  settings: defaultSettings,
  voiceProfiles: [],
  manualDictionary: [],
  stats: {
    totalWords: 0,
    totalXp: 0,
    currentLevel: 1,
    currentStreakDays: 0,
    lastUsedOn: null
  },
  transcriptHistory: [],
  notes: "",
  savedNotes: []
};

function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function previousDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return toDateKey(date);
}

function getLevelFromXp(totalXp: number) {
  if (totalXp < 1000) {
    return 1;
  }

  return Math.floor((totalXp - 1000) / 500) + 2;
}

function getDataFilePath() {
  return path.join(app.getPath("userData"), "whisparr.json");
}

function ensureDataFile() {
  const filePath = getDataFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), "utf8");
  }
}

export function readData(): LocalData {
  ensureDataFile();
  const filePath = getDataFilePath();
  const content = fs.readFileSync(filePath, "utf8");

  try {
    const parsed = JSON.parse(content) as Partial<LocalData>;
    return {
      ...defaultData,
      ...parsed,
      settings: {
        ...defaultSettings,
        ...parsed.settings
      },
      stats: {
        ...defaultData.stats,
        ...parsed.stats
      },
      manualDictionary: Array.isArray(parsed.manualDictionary)
        ? parsed.manualDictionary.filter(
            (entry): entry is ManualDictionaryEntry =>
              Boolean(entry) &&
              typeof entry.id === "string" &&
              typeof entry.createdAt === "string" &&
              typeof entry.updatedAt === "string" &&
              (typeof (entry as { term?: unknown }).term === "string" ||
                typeof (entry as { spoken?: unknown }).spoken === "string" ||
                typeof (entry as { replacement?: unknown }).replacement === "string")
          )
            .map((entry) => {
              const legacyEntry = entry as ManualDictionaryEntry & {
                spoken?: string;
                replacement?: string;
              };

              return {
                id: entry.id,
                term:
                  typeof legacyEntry.term === "string"
                    ? (legacyEntry.term.trim() || "")
                    : typeof legacyEntry.replacement === "string"
                      ? (legacyEntry.replacement.trim() || "")
                      : (legacyEntry.spoken?.trim() || ""),
                addedBySystem: typeof (entry as { addedBySystem?: unknown }).addedBySystem === "boolean"
                  ? Boolean((entry as { addedBySystem?: boolean }).addedBySystem)
                  : false,
                createdAt: entry.createdAt,
                updatedAt: entry.updatedAt
              };
            })
            .filter((entry) => entry.term.length > 0)
        : [],
      transcriptHistory: Array.isArray(parsed.transcriptHistory)
        ? parsed.transcriptHistory.filter((entry): entry is string => typeof entry === "string")
        : [],
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      savedNotes: Array.isArray(parsed.savedNotes)
        ? parsed.savedNotes.filter((entry): entry is string => typeof entry === "string")
        : []
    };
  } catch {
    return defaultData;
  }
}

export function writeData(data: LocalData) {
  ensureDataFile();
  fs.writeFileSync(getDataFilePath(), JSON.stringify(data, null, 2), "utf8");
}

export function updateSettings(patch: Partial<AppSettings>) {
  const current = readData();
  const next = {
    ...current,
    settings: {
      ...current.settings,
      ...patch
    }
  };
  writeData(next);
  return next.settings;
}

function blendEmbeddings(current: VoiceEmbedding, incoming: VoiceEmbedding, currentSamples: number) {
  const nextSampleCount = currentSamples + 1;
  return {
    bands: current.bands.map((band, index) => {
      const value = incoming.bands[index] ?? 0;
      return (band * currentSamples + value) / nextSampleCount;
    }),
    rms: (current.rms * currentSamples + incoming.rms) / nextSampleCount,
    zcr: (current.zcr * currentSamples + incoming.zcr) / nextSampleCount
  };
}

export function saveVoiceProfile(input: SaveVoiceProfileInput): VoiceProfile {
  const current = readData();
  const now = new Date().toISOString();
  const existing = current.voiceProfiles.find((profile) => profile.id === input.id);

  let profile: VoiceProfile;

  if (existing) {
    profile = {
      ...existing,
      name: input.name,
      updatedAt: now,
      sampleCount: existing.sampleCount + input.incrementSamplesBy,
      averageEmbedding: blendEmbeddings(existing.averageEmbedding, input.embedding, existing.sampleCount)
    };
    current.voiceProfiles = current.voiceProfiles.map((item) =>
      item.id === existing.id ? profile : item
    );
  } else {
    profile = {
      id: randomUUID(),
      name: input.name,
      createdAt: now,
      updatedAt: now,
      sampleCount: input.incrementSamplesBy,
      averageEmbedding: input.embedding
    };
    current.voiceProfiles = [profile, ...current.voiceProfiles];
  }

  writeData(current);
  return profile;
}

export function deleteVoiceProfile(id: string) {
  const current = readData();
  current.voiceProfiles = current.voiceProfiles.filter((profile) => profile.id !== id);
  if (current.settings.activeProfileId === id) {
    current.settings.activeProfileId = null;
  }
  writeData(current);
  return current.voiceProfiles;
}

export function saveManualDictionaryEntry(input: {
  id?: string;
  term: string;
  addedBySystem?: boolean;
}): ManualDictionaryEntry {
  const current = readData();
  const now = new Date().toISOString();
  const normalizedTerm = input.term.trim();
  const existing = current.manualDictionary.find((entry) => entry.id === input.id);

  let entry: ManualDictionaryEntry;

  if (existing) {
    entry = {
      ...existing,
      term: normalizedTerm,
      addedBySystem: input.addedBySystem ?? existing.addedBySystem,
      updatedAt: now
    };
    current.manualDictionary = current.manualDictionary.map((item) =>
      item.id === existing.id ? entry : item
    );
  } else {
    entry = {
      id: randomUUID(),
      term: normalizedTerm,
      addedBySystem: Boolean(input.addedBySystem),
      createdAt: now,
      updatedAt: now
    };
    current.manualDictionary = [entry, ...current.manualDictionary];
  }

  writeData(current);
  return entry;
}

export function deleteManualDictionaryEntry(id: string) {
  const current = readData();
  current.manualDictionary = current.manualDictionary.filter((entry) => entry.id !== id);
  writeData(current);
  return current.manualDictionary;
}

export function updateStatsFromTranscript(transcript: string): UserStats {
  const current = readData();
  const words = transcript
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  if (words === 0) {
    return current.stats;
  }

  const today = toDateKey();
  const lastUsedOn = current.stats.lastUsedOn;
  let currentStreakDays = current.stats.currentStreakDays;

  if (lastUsedOn === today) {
    currentStreakDays = Math.max(1, currentStreakDays);
  } else if (lastUsedOn === previousDateKey(today)) {
    currentStreakDays += 1;
  } else {
    currentStreakDays = 1;
  }

  const totalWords = current.stats.totalWords + words;
  const totalXp = current.stats.totalXp + words;
  const currentLevel = getLevelFromXp(totalXp);

  current.stats = {
    totalWords,
    totalXp,
    currentLevel,
    currentStreakDays,
    lastUsedOn: today
  };

  writeData(current);
  return current.stats;
}

export function saveTranscriptHistory(history: string[], limit: number) {
  const current = readData();
  current.transcriptHistory = history
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, Math.max(1, limit));
  writeData(current);
  return current.transcriptHistory;
}

export function saveNotes(notes: string) {
  const current = readData();
  current.notes = notes;
  writeData(current);
  return current.notes;
}

export function saveSavedNotes(savedNotes: string[]) {
  const current = readData();
  current.savedNotes = savedNotes.map((entry) => entry.trim()).filter(Boolean);
  writeData(current);
  return current.savedNotes;
}
