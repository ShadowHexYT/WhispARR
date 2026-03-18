import { randomUUID } from "node:crypto";
import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AchievementSyncResult,
  AchievementUnlockInput,
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
  hudPosition: null,
  hudScale: 100,
  muteDictationSounds: false,
  appSoundVolume: 80,
  muteMusicWhileDictating: false,
  autoLearnDictionary: false,
  smartFormatting: true,
  filterProfanity: false,
  activationShortcut: defaultActivationShortcut,
  appTheme: defaultAppTheme,
  customTheme: defaultCustomTheme,
  onboardingCompleted: false,
  devModeUnlocked: false,
  devModeEnabled: false
};

const defaultData: LocalData = {
  installRegistrationKey: randomUUID(),
  onboardingProfileKey: null,
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
  unlockedAchievements: [],
  transcriptHistory: [],
  notes: "",
  savedNotes: []
};

const defaultUserStats: UserStats = {
  totalWords: 0,
  totalXp: 0,
  currentLevel: 1,
  currentStreakDays: 0,
  lastUsedOn: null
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

function normalizeUserStats(stats: Partial<UserStats> | undefined): UserStats {
  return {
    ...defaultUserStats,
    ...stats
  };
}

function getActiveProfile(current: LocalData) {
  if (!current.settings.activeProfileId) {
    return null;
  }

  return current.voiceProfiles.find((profile) => profile.id === current.settings.activeProfileId) ?? null;
}

function syncActiveProfileProgress(current: LocalData) {
  const activeProfile = getActiveProfile(current);
  if (!activeProfile) {
    current.stats = normalizeUserStats(current.stats);
    current.unlockedAchievements = Array.isArray(current.unlockedAchievements)
      ? current.unlockedAchievements.filter((entry): entry is string => typeof entry === "string")
      : [];
    return current;
  }

  activeProfile.stats = normalizeUserStats(activeProfile.stats);
  activeProfile.unlockedAchievements = Array.isArray(activeProfile.unlockedAchievements)
    ? activeProfile.unlockedAchievements.filter((entry): entry is string => typeof entry === "string")
    : [];
  current.stats = activeProfile.stats;
  current.unlockedAchievements = activeProfile.unlockedAchievements;
  return current;
}

function getDataFilePath() {
  return path.join(app.getPath("userData"), "whisparr.json");
}

function getCurrentUserProfileKey() {
  const username = (() => {
    try {
      return os.userInfo().username;
    } catch {
      return process.env.USERNAME ?? process.env.USER ?? "unknown-user";
    }
  })();

  return `${process.platform}::${username.toLowerCase()}::${os.homedir().toLowerCase()}`;
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
    const currentUserProfileKey = getCurrentUserProfileKey();
    const nextData: LocalData = {
      ...defaultData,
      ...parsed,
      installRegistrationKey:
        typeof parsed.installRegistrationKey === "string" && parsed.installRegistrationKey.trim()
          ? parsed.installRegistrationKey
          : randomUUID(),
      onboardingProfileKey:
        typeof parsed.onboardingProfileKey === "string" && parsed.onboardingProfileKey.trim()
          ? parsed.onboardingProfileKey
          : null,
      settings: {
        ...defaultSettings,
        ...parsed.settings
      },
      stats: normalizeUserStats(parsed.stats),
      unlockedAchievements: Array.isArray((parsed as { unlockedAchievements?: unknown }).unlockedAchievements)
        ? ((parsed as { unlockedAchievements?: unknown[] }).unlockedAchievements ?? []).filter(
            (entry): entry is string => typeof entry === "string"
          )
        : [],
      voiceProfiles: Array.isArray(parsed.voiceProfiles)
        ? parsed.voiceProfiles.filter(
            (entry): entry is VoiceProfile =>
              Boolean(entry) &&
              typeof entry.id === "string" &&
              typeof entry.name === "string" &&
              typeof entry.createdAt === "string" &&
              typeof entry.updatedAt === "string" &&
              typeof entry.sampleCount === "number" &&
              Boolean(entry.averageEmbedding)
          ).map((entry) => ({
            ...entry,
            stats: normalizeUserStats((entry as Partial<VoiceProfile>).stats),
            unlockedAchievements: Array.isArray((entry as Partial<VoiceProfile>).unlockedAchievements)
              ? ((entry as Partial<VoiceProfile>).unlockedAchievements ?? []).filter(
                  (achievement): achievement is string => typeof achievement === "string"
                )
              : []
          }))
        : [],
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
                replacement:
                  typeof legacyEntry.term === "string" && typeof legacyEntry.replacement === "string"
                    ? (legacyEntry.replacement.trim() || undefined)
                    : undefined,
                entryTypeOverride:
                  (entry as { entryTypeOverride?: unknown }).entryTypeOverride === "Abbreviation" ||
                  (entry as { entryTypeOverride?: unknown }).entryTypeOverride === "Word" ||
                  (entry as { entryTypeOverride?: unknown }).entryTypeOverride === "Phrase" ||
                  (entry as { entryTypeOverride?: unknown }).entryTypeOverride === "Sentence"
                    ? ((entry as {
                        entryTypeOverride?: "Abbreviation" | "Word" | "Phrase" | "Sentence";
                      }).entryTypeOverride ?? undefined)
                    : undefined,
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

    if (nextData.settings.onboardingCompleted && !nextData.onboardingProfileKey) {
      nextData.onboardingProfileKey = currentUserProfileKey;
    }

    if (
      nextData.settings.activeProfileId &&
      !nextData.voiceProfiles.some((profile) => profile.id === nextData.settings.activeProfileId)
    ) {
      nextData.settings.activeProfileId = nextData.voiceProfiles[0]?.id ?? null;
    }

    if (nextData.settings.activeProfileId) {
      const activeProfile = nextData.voiceProfiles.find((profile) => profile.id === nextData.settings.activeProfileId);
      if (activeProfile) {
        const shouldMigrateLegacyProgress =
          activeProfile.stats.totalWords === 0 &&
          activeProfile.stats.totalXp === 0 &&
          activeProfile.stats.currentLevel === 1 &&
          activeProfile.stats.currentStreakDays === 0 &&
          activeProfile.stats.lastUsedOn === null &&
          activeProfile.unlockedAchievements.length === 0 &&
          (nextData.stats.totalWords > 0 || nextData.stats.totalXp > 0 || nextData.unlockedAchievements.length > 0);

        if (shouldMigrateLegacyProgress) {
          activeProfile.stats = normalizeUserStats(nextData.stats);
          activeProfile.unlockedAchievements = [...nextData.unlockedAchievements];
        }
      }
    }

    nextData.settings.onboardingCompleted =
      nextData.settings.onboardingCompleted && nextData.onboardingProfileKey === currentUserProfileKey;

    syncActiveProfileProgress(nextData);

    const serializedNext = JSON.stringify(nextData);
    const serializedParsed = JSON.stringify(parsed);
    if (serializedNext !== serializedParsed) {
      writeData(nextData);
    }

    return nextData;
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
  const nextOnboardingCompleted = patch.onboardingCompleted ?? current.settings.onboardingCompleted;
  const nextTranscriptHistoryLimit = Math.max(
    1,
    Math.round(patch.transcriptHistoryLimit ?? current.settings.transcriptHistoryLimit)
  );
  const next = {
    ...current,
    settings: {
      ...current.settings,
      ...patch,
      onboardingCompleted: nextOnboardingCompleted,
      transcriptHistoryLimit: nextTranscriptHistoryLimit
    },
    onboardingProfileKey: nextOnboardingCompleted ? getCurrentUserProfileKey() : null,
    transcriptHistory: current.transcriptHistory.slice(0, nextTranscriptHistoryLimit)
  };
  syncActiveProfileProgress(next);
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
      averageEmbedding: blendEmbeddings(existing.averageEmbedding, input.embedding, existing.sampleCount),
      stats: normalizeUserStats(existing.stats),
      unlockedAchievements: Array.isArray(existing.unlockedAchievements) ? existing.unlockedAchievements : []
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
      averageEmbedding: input.embedding,
      stats: { ...defaultUserStats },
      unlockedAchievements: []
    };
    current.voiceProfiles = [profile, ...current.voiceProfiles];
    current.settings.activeProfileId = profile.id;
  }

  writeData(current);
  return profile;
}

export function deleteVoiceProfile(id: string) {
  const current = readData();
  current.voiceProfiles = current.voiceProfiles.filter((profile) => profile.id !== id);
  if (current.settings.activeProfileId === id) {
    current.settings.activeProfileId = current.voiceProfiles[0]?.id ?? null;
  }
  syncActiveProfileProgress(current);
  writeData(current);
  return current.voiceProfiles;
}

export function saveManualDictionaryEntry(input: {
  id?: string;
  term: string;
  replacement?: string;
  entryTypeOverride?: "Abbreviation" | "Word" | "Phrase" | "Sentence";
  addedBySystem?: boolean;
}): ManualDictionaryEntry {
  const current = readData();
  const now = new Date().toISOString();
  const normalizedTerm = input.term.trim();
  const normalizedReplacement = input.replacement?.trim() || undefined;
  const existing = current.manualDictionary.find((entry) => entry.id === input.id);

  let entry: ManualDictionaryEntry;

  if (existing) {
    entry = {
      ...existing,
      term: normalizedTerm,
      replacement: normalizedReplacement,
      entryTypeOverride: input.entryTypeOverride,
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
      replacement: normalizedReplacement,
      entryTypeOverride: input.entryTypeOverride,
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
    return syncActiveProfileProgress(current).stats;
  }

  const activeProfile = getActiveProfile(current);
  const sourceStats = activeProfile ? normalizeUserStats(activeProfile.stats) : normalizeUserStats(current.stats);
  const today = toDateKey();
  const lastUsedOn = sourceStats.lastUsedOn;
  let currentStreakDays = sourceStats.currentStreakDays;

  if (lastUsedOn === today) {
    currentStreakDays = Math.max(1, currentStreakDays);
  } else if (lastUsedOn === previousDateKey(today)) {
    currentStreakDays += 1;
  } else {
    currentStreakDays = 1;
  }

  const totalWords = sourceStats.totalWords + words;
  const totalXp = sourceStats.totalXp + words;
  const currentLevel = getLevelFromXp(totalXp);

  const nextStats: UserStats = {
    totalWords,
    totalXp,
    currentLevel,
    currentStreakDays,
    lastUsedOn: today
  };

  if (activeProfile) {
    activeProfile.stats = nextStats;
  }
  current.stats = nextStats;

  writeData(current);
  return syncActiveProfileProgress(current).stats;
}

export function syncAchievementUnlocks(unlocked: AchievementUnlockInput[]): AchievementSyncResult {
  const current = readData();
  const activeProfile = getActiveProfile(current);
  const sourceUnlocks = activeProfile
    ? (Array.isArray(activeProfile.unlockedAchievements) ? activeProfile.unlockedAchievements : [])
    : current.unlockedAchievements;
  const sourceStats = activeProfile ? normalizeUserStats(activeProfile.stats) : normalizeUserStats(current.stats);
  const known = new Set(sourceUnlocks);
  const newlyUnlocked: string[] = [];
  let xpAward = 0;

  for (const achievement of unlocked) {
    if (!achievement.title || known.has(achievement.title)) {
      continue;
    }

    known.add(achievement.title);
    newlyUnlocked.push(achievement.title);
    xpAward += Math.max(0, Math.round(achievement.xp));
  }

  if (newlyUnlocked.length > 0) {
    const nextUnlocks = [...sourceUnlocks, ...newlyUnlocked];
    const nextStats: UserStats = {
      ...sourceStats,
      totalXp: sourceStats.totalXp + xpAward,
      currentLevel: getLevelFromXp(sourceStats.totalXp + xpAward)
    };

    if (activeProfile) {
      activeProfile.unlockedAchievements = nextUnlocks;
      activeProfile.stats = nextStats;
    }

    current.unlockedAchievements = nextUnlocks;
    current.stats = nextStats;
    writeData(current);
  }

  syncActiveProfileProgress(current);
  return {
    unlockedAchievements: current.unlockedAchievements,
    newlyUnlocked,
    stats: current.stats
  };
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
