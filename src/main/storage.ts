import { randomUUID } from "node:crypto";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  AchievementSyncResult,
  AchievementUnlockInput,
  ActivationShortcut,
  AppThemeName,
  AppSettings,
  CustomThemeColors,
  DailyChallengeMetric,
  DailyChallengeProgress,
  DailyChallengeSet,
  DailyChallengeTask,
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
  levelUpSoundPath: "",
  levelUpSoundVolume: 50,
  achievementSoundPath: "",
  achievementSoundVolume: 50,
  dictionarySoundPath: "",
  dictionarySoundVolume: 50,
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

const DAILY_CHALLENGE_REWARD_XP = 200;
const DAILY_CHALLENGE_SET_BONUS_XP = 400;
const DAILY_CHALLENGE_SET_VERSION = 1;
const LONG_DICTATION_WORD_COUNT = 50;
const MARATHON_DICTATION_WORD_COUNT = 100;

const defaultDailyChallengeProgress: DailyChallengeProgress = {
  dictatedWords: 0,
  dictatedCharacters: 0,
  completedDictations: 0,
  longestDictationWords: 0,
  longDictations: 0,
  marathonDictations: 0,
  activityXpEarned: 0,
  voiceSamplesRecorded: 0,
  dictionaryEntriesSaved: 0
};

const defaultData: LocalData = {
  installRegistrationKey: randomUUID(),
  onboardingCompletedKeys: [],
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
  dailyChallenges: {
    version: DAILY_CHALLENGE_SET_VERSION,
    cycleKey: "",
    startedAt: "",
    resetsAt: "",
    tasks: [],
    progress: { ...defaultDailyChallengeProgress },
    completedSetRewardGranted: false,
    setCompletedAt: null
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

const DEFAULT_PROFILE_EMOJI = "🎙️";

function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function previousDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return toDateKey(date);
}

type DailyChallengeBlueprint = {
  metric: DailyChallengeMetric;
  thresholds: number[];
  title: (target: number) => string;
  description: (target: number) => string;
};

const dailyChallengeBlueprints: DailyChallengeBlueprint[] = [
  {
    metric: "dictatedWords",
    thresholds: [75, 120, 180, 260, 380, 550, 800, 1150, 1600, 2200, 3000],
    title: (target) => `Dictate ${target.toLocaleString()} words`,
    description: (target) => `Use WhispARR to speak ${target.toLocaleString()} words before the daily reset.`
  },
  {
    metric: "dictatedCharacters",
    thresholds: [300, 500, 800, 1200, 1700, 2400, 3300, 4500, 6000, 7800, 10000],
    title: (target) => `Reach ${target.toLocaleString()} characters`,
    description: (target) => `Rack up ${target.toLocaleString()} dictated characters across your sessions today.`
  },
  {
    metric: "completedDictations",
    thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
    title: (target) => `Finish ${target} dictation${target === 1 ? "" : "s"}`,
    description: (target) => `Complete ${target} successful dictation${target === 1 ? "" : "s"} today.`
  },
  {
    metric: "longestDictationWords",
    thresholds: [30, 45, 60, 80, 110, 150, 200, 260, 330, 420, 520],
    title: (target) => `Hit a ${target}-word run`,
    description: (target) => `Land a single dictation session with at least ${target} words.`
  },
  {
    metric: "longDictations",
    thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
    title: (target) => `Complete ${target} long run${target === 1 ? "" : "s"}`,
    description: (target) =>
      `Finish ${target} dictation${target === 1 ? "" : "s"} with at least ${LONG_DICTATION_WORD_COUNT} words each.`
  },
  {
    metric: "marathonDictations",
    thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
    title: (target) => `Crush ${target} marathon${target === 1 ? "" : "s"}`,
    description: (target) =>
      `Finish ${target} dictation${target === 1 ? "" : "s"} with at least ${MARATHON_DICTATION_WORD_COUNT} words each.`
  },
  {
    metric: "activityXpEarned",
    thresholds: [100, 160, 240, 340, 480, 650, 850, 1100, 1450, 1850, 2300],
    title: (target) => `Earn ${target.toLocaleString()} XP`,
    description: (target) => `Earn ${target.toLocaleString()} XP from your activity before noon rolls around.`
  },
  {
    metric: "voiceSamplesRecorded",
    thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
    title: (target) => `Record ${target} voice sample${target === 1 ? "" : "s"}`,
    description: (target) => `Train your voice profile with ${target} new sample${target === 1 ? "" : "s"} today.`
  },
  {
    metric: "dictionaryEntriesSaved",
    thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
    title: (target) => `Save ${target} dictionary ${target === 1 ? "entry" : "entries"}`,
    description: (target) => `Add or update ${target} local dictionary ${target === 1 ? "entry" : "entries"} today.`
  }
];

function getDailyChallengeWindow(date = new Date()) {
  const resetAt = new Date(date);
  resetAt.setHours(12, 0, 0, 0);

  let startedAt = new Date(resetAt);
  if (date >= resetAt) {
    resetAt.setDate(resetAt.getDate() + 1);
  } else {
    startedAt.setDate(startedAt.getDate() - 1);
  }

  return {
    cycleKey: startedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    resetsAt: resetAt.toISOString()
  };
}

function hashString(value: string) {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function createSeededRandom(seed: string) {
  let state = hashString(seed) || 1;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: string) {
  const random = createSeededRandom(seed);
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function createDailyChallengeTasks(seedBase: string): DailyChallengeTask[] {
  const shuffledBlueprints = shuffleWithSeed(dailyChallengeBlueprints, `${seedBase}:categories`).slice(0, 3);

  return shuffledBlueprints.map((blueprint, index) => {
    const thresholdIndex = Math.floor(createSeededRandom(`${seedBase}:${blueprint.metric}:${index}`)() * blueprint.thresholds.length);
    const target = blueprint.thresholds[thresholdIndex];

    return {
      id: `${blueprint.metric}:${target}`,
      title: blueprint.title(target),
      description: blueprint.description(target),
      metric: blueprint.metric,
      target,
      rewardXp: DAILY_CHALLENGE_REWARD_XP,
      completedAt: null,
      rewardGranted: false
    };
  });
}

function createDailyChallengeSet(seedBase: string, date = new Date()): DailyChallengeSet {
  const window = getDailyChallengeWindow(date);
  const seed = `${seedBase}:${window.cycleKey}`;

  return {
    version: DAILY_CHALLENGE_SET_VERSION,
    cycleKey: window.cycleKey,
    startedAt: window.startedAt,
    resetsAt: window.resetsAt,
    tasks: createDailyChallengeTasks(seed),
    progress: { ...defaultDailyChallengeProgress },
    completedSetRewardGranted: false,
    setCompletedAt: null
  };
}

function normalizeDailyChallengeProgress(progress: Partial<DailyChallengeProgress> | undefined): DailyChallengeProgress {
  return {
    dictatedWords: Math.max(0, Number(progress?.dictatedWords ?? 0) || 0),
    dictatedCharacters: Math.max(0, Number(progress?.dictatedCharacters ?? 0) || 0),
    completedDictations: Math.max(0, Number(progress?.completedDictations ?? 0) || 0),
    longestDictationWords: Math.max(0, Number(progress?.longestDictationWords ?? 0) || 0),
    longDictations: Math.max(0, Number(progress?.longDictations ?? 0) || 0),
    marathonDictations: Math.max(0, Number(progress?.marathonDictations ?? 0) || 0),
    activityXpEarned: Math.max(0, Number(progress?.activityXpEarned ?? 0) || 0),
    voiceSamplesRecorded: Math.max(0, Number(progress?.voiceSamplesRecorded ?? 0) || 0),
    dictionaryEntriesSaved: Math.max(0, Number(progress?.dictionaryEntriesSaved ?? 0) || 0)
  };
}

function normalizeDailyChallenges(
  challenges: Partial<DailyChallengeSet> | undefined,
  seedBase: string,
  date = new Date()
): DailyChallengeSet {
  const currentWindow = getDailyChallengeWindow(date);

  if (
    !challenges ||
    challenges.version !== DAILY_CHALLENGE_SET_VERSION ||
    challenges.cycleKey !== currentWindow.cycleKey ||
    !Array.isArray(challenges.tasks) ||
    challenges.tasks.length !== 3
  ) {
    return createDailyChallengeSet(seedBase, date);
  }

  const regeneratedTasks = createDailyChallengeTasks(`${seedBase}:${currentWindow.cycleKey}`);
  const knownTaskMap = new Map(challenges.tasks.map((task) => [task.id, task]));

  return {
    version: DAILY_CHALLENGE_SET_VERSION,
    cycleKey: currentWindow.cycleKey,
    startedAt: currentWindow.startedAt,
    resetsAt: currentWindow.resetsAt,
    tasks: regeneratedTasks.map((task) => {
      const savedTask = knownTaskMap.get(task.id);
      return {
        ...task,
        completedAt: typeof savedTask?.completedAt === "string" ? savedTask.completedAt : null,
        rewardGranted: Boolean(savedTask?.rewardGranted)
      };
    }),
    progress: normalizeDailyChallengeProgress(challenges.progress),
    completedSetRewardGranted: Boolean(challenges.completedSetRewardGranted),
    setCompletedAt: typeof challenges.setCompletedAt === "string" ? challenges.setCompletedAt : null
  };
}

function getDailyChallengeSeedBase(current: LocalData) {
  return current.settings.activeProfileId ?? current.installRegistrationKey;
}

function getCurrentDailyChallenges(current: LocalData) {
  return getActiveProfile(current)?.dailyChallenges ?? current.dailyChallenges;
}

function setCurrentDailyChallenges(current: LocalData, dailyChallenges: DailyChallengeSet) {
  const activeProfile = getActiveProfile(current);
  if (activeProfile) {
    activeProfile.dailyChallenges = dailyChallenges;
  }
  current.dailyChallenges = dailyChallenges;
}

function applyXpToCurrentStats(current: LocalData, xp: number) {
  if (xp <= 0) {
    return;
  }

  const activeProfile = getActiveProfile(current);
  const sourceStats = activeProfile ? normalizeUserStats(activeProfile.stats) : normalizeUserStats(current.stats);
  const totalXp = sourceStats.totalXp + xp;
  const nextStats: UserStats = {
    ...sourceStats,
    totalXp,
    currentLevel: getLevelFromXp(totalXp)
  };

  if (activeProfile) {
    activeProfile.stats = nextStats;
  }
  current.stats = nextStats;
}

function ensureCurrentDailyChallenges(current: LocalData) {
  const next = normalizeDailyChallenges(getCurrentDailyChallenges(current), getDailyChallengeSeedBase(current));
  setCurrentDailyChallenges(current, next);
  return next;
}

function applyDailyChallengeActivity(current: LocalData, patch: Partial<DailyChallengeProgress>) {
  const dailyChallenges = ensureCurrentDailyChallenges(current);
  const nextProgress: DailyChallengeProgress = {
    ...dailyChallenges.progress,
    dictatedWords: dailyChallenges.progress.dictatedWords + (patch.dictatedWords ?? 0),
    dictatedCharacters: dailyChallenges.progress.dictatedCharacters + (patch.dictatedCharacters ?? 0),
    completedDictations: dailyChallenges.progress.completedDictations + (patch.completedDictations ?? 0),
    longestDictationWords: Math.max(dailyChallenges.progress.longestDictationWords, patch.longestDictationWords ?? 0),
    longDictations: dailyChallenges.progress.longDictations + (patch.longDictations ?? 0),
    marathonDictations: dailyChallenges.progress.marathonDictations + (patch.marathonDictations ?? 0),
    activityXpEarned: dailyChallenges.progress.activityXpEarned + (patch.activityXpEarned ?? 0),
    voiceSamplesRecorded: dailyChallenges.progress.voiceSamplesRecorded + (patch.voiceSamplesRecorded ?? 0),
    dictionaryEntriesSaved: dailyChallenges.progress.dictionaryEntriesSaved + (patch.dictionaryEntriesSaved ?? 0)
  };

  const now = new Date().toISOString();
  let rewardXp = 0;
  const nextTasks = dailyChallenges.tasks.map((task) => {
    const isComplete = nextProgress[task.metric] >= task.target;
    if (!isComplete) {
      return task;
    }

    if (!task.rewardGranted) {
      rewardXp += task.rewardXp;
    }

    return {
      ...task,
      completedAt: task.completedAt ?? now,
      rewardGranted: true
    };
  });

  const completedCount = nextTasks.filter((task) => task.rewardGranted).length;
  const shouldGrantSetBonus = completedCount === nextTasks.length && !dailyChallenges.completedSetRewardGranted;
  if (shouldGrantSetBonus) {
    rewardXp += DAILY_CHALLENGE_SET_BONUS_XP;
  }

  const nextDailyChallenges: DailyChallengeSet = {
    ...dailyChallenges,
    progress: nextProgress,
    tasks: nextTasks,
    completedSetRewardGranted: dailyChallenges.completedSetRewardGranted || shouldGrantSetBonus,
    setCompletedAt:
      dailyChallenges.setCompletedAt ??
      (shouldGrantSetBonus ? now : null)
  };

  setCurrentDailyChallenges(current, nextDailyChallenges);
  applyXpToCurrentStats(current, rewardXp);
}

function getXpForNextLevel(level: number) {
  return 1000 + Math.max(0, level - 1) * 500;
}

function getLevelFromXp(totalXp: number) {
  let level = 1;
  let remainingXp = Math.max(0, totalXp);

  while (remainingXp >= getXpForNextLevel(level)) {
    remainingXp -= getXpForNextLevel(level);
    level += 1;
  }

  return level;
}

function normalizeUserStats(stats: Partial<UserStats> | undefined): UserStats {
  const normalizedTotalXp = Math.max(0, Number(stats?.totalXp ?? defaultUserStats.totalXp) || 0);

  return {
    ...defaultUserStats,
    ...stats,
    totalXp: normalizedTotalXp,
    currentLevel: getLevelFromXp(normalizedTotalXp)
  };
}

function normalizeProfileEmoji(emoji: unknown) {
  if (typeof emoji !== "string") {
    return DEFAULT_PROFILE_EMOJI;
  }

  const trimmed = emoji.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 16) : DEFAULT_PROFILE_EMOJI;
}

function getActiveProfile(current: LocalData) {
  if (!current.settings.activeProfileId) {
    return null;
  }

  return current.voiceProfiles.find((profile) => profile.id === current.settings.activeProfileId) ?? null;
}

function getOnboardingScopeKey(current: Pick<LocalData, "installRegistrationKey" | "settings">) {
  return current.settings.activeProfileId ?? current.installRegistrationKey;
}

function normalizeOnboardingCompletedKeys(keys: string[] | undefined, current: Pick<LocalData, "installRegistrationKey" | "settings">) {
  const normalized = Array.isArray(keys)
    ? keys.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];

  if (normalized.length === 0 && current.settings.onboardingCompleted) {
    normalized.push(getOnboardingScopeKey(current));
  }

  return [...new Set(normalized)];
}

function syncActiveProfileProgress(current: LocalData) {
  const activeProfile = getActiveProfile(current);
  if (!activeProfile) {
    current.stats = normalizeUserStats(current.stats);
    current.dailyChallenges = normalizeDailyChallenges(current.dailyChallenges, current.installRegistrationKey);
    current.unlockedAchievements = Array.isArray(current.unlockedAchievements)
      ? current.unlockedAchievements.filter((entry): entry is string => typeof entry === "string")
      : [];
    return current;
  }

  activeProfile.stats = normalizeUserStats(activeProfile.stats);
  activeProfile.dailyChallenges = normalizeDailyChallenges(activeProfile.dailyChallenges, activeProfile.id);
  activeProfile.unlockedAchievements = Array.isArray(activeProfile.unlockedAchievements)
    ? activeProfile.unlockedAchievements.filter((entry): entry is string => typeof entry === "string")
    : [];
  current.stats = activeProfile.stats;
  current.dailyChallenges = activeProfile.dailyChallenges;
  current.unlockedAchievements = activeProfile.unlockedAchievements;
  return current;
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
    const installRegistrationKey =
      typeof parsed.installRegistrationKey === "string" && parsed.installRegistrationKey.trim()
        ? parsed.installRegistrationKey
        : randomUUID();
    const legacyOnboardingProfileKey =
      typeof (parsed as { onboardingProfileKey?: unknown }).onboardingProfileKey === "string" &&
      ((parsed as { onboardingProfileKey?: string }).onboardingProfileKey?.trim()?.length ?? 0) > 0
        ? (parsed as { onboardingProfileKey: string }).onboardingProfileKey
        : null;
    const nextData: LocalData = {
      ...defaultData,
      ...parsed,
      installRegistrationKey,
      onboardingCompletedKeys: Array.isArray((parsed as { onboardingCompletedKeys?: unknown }).onboardingCompletedKeys)
        ? ((parsed as { onboardingCompletedKeys?: unknown[] }).onboardingCompletedKeys ?? []).filter(
            (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
          )
        : [],
      settings: {
        ...defaultSettings,
        ...parsed.settings
      },
      stats: normalizeUserStats(parsed.stats),
      dailyChallenges: normalizeDailyChallenges(parsed.dailyChallenges, installRegistrationKey),
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
            emoji: normalizeProfileEmoji((entry as Partial<VoiceProfile>).emoji),
            stats: normalizeUserStats((entry as Partial<VoiceProfile>).stats),
            dailyChallenges: normalizeDailyChallenges(
              (entry as Partial<VoiceProfile>).dailyChallenges,
              entry.id
            ),
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

    if (nextData.onboardingCompletedKeys.length === 0 && nextData.settings.onboardingCompleted) {
      nextData.onboardingCompletedKeys = legacyOnboardingProfileKey
        ? [legacyOnboardingProfileKey, nextData.installRegistrationKey, ...nextData.voiceProfiles.map((profile) => profile.id)]
        : [nextData.installRegistrationKey, ...nextData.voiceProfiles.map((profile) => profile.id)];
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
          activeProfile.dailyChallenges.tasks.length === 0 &&
          activeProfile.unlockedAchievements.length === 0 &&
          (nextData.stats.totalWords > 0 || nextData.stats.totalXp > 0 || nextData.unlockedAchievements.length > 0);

        if (shouldMigrateLegacyProgress) {
          activeProfile.stats = normalizeUserStats(nextData.stats);
          activeProfile.dailyChallenges = normalizeDailyChallenges(nextData.dailyChallenges, activeProfile.id);
          activeProfile.unlockedAchievements = [...nextData.unlockedAchievements];
        }
      }
    }

    nextData.onboardingCompletedKeys = normalizeOnboardingCompletedKeys(nextData.onboardingCompletedKeys, nextData);
    nextData.settings.onboardingCompleted = nextData.onboardingCompletedKeys.includes(getOnboardingScopeKey(nextData));

    syncActiveProfileProgress(nextData);

    const serializedNext = JSON.stringify(nextData);
    const serializedParsed = JSON.stringify(parsed);
    if (serializedNext !== serializedParsed) {
      writeData(nextData);
    }

    return nextData;
  } catch {
    return {
      ...defaultData,
      dailyChallenges: createDailyChallengeSet(defaultData.installRegistrationKey)
    };
  }
}

export function writeData(data: LocalData) {
  ensureDataFile();
  fs.writeFileSync(getDataFilePath(), JSON.stringify(data, null, 2), "utf8");
}

export function updateSettings(patch: Partial<AppSettings>) {
  const current = readData();
  const nextTranscriptHistoryLimit = Math.max(
    1,
    Math.round(patch.transcriptHistoryLimit ?? current.settings.transcriptHistoryLimit)
  );
  const nextSettings: AppSettings = {
    ...current.settings,
    ...patch,
    transcriptHistoryLimit: nextTranscriptHistoryLimit
  };
  const nextOnboardingScopeKey = getOnboardingScopeKey({
    installRegistrationKey: current.installRegistrationKey,
    settings: nextSettings
  });
  const nextOnboardingCompletedKeys = new Set(normalizeOnboardingCompletedKeys(current.onboardingCompletedKeys, current));
  const requestedOnboardingCompleted = patch.onboardingCompleted;

  if (requestedOnboardingCompleted === true) {
    nextOnboardingCompletedKeys.add(nextOnboardingScopeKey);
  } else if (requestedOnboardingCompleted === false) {
    nextOnboardingCompletedKeys.delete(nextOnboardingScopeKey);
  }

  nextSettings.onboardingCompleted = nextOnboardingCompletedKeys.has(nextOnboardingScopeKey);
  const next = {
    ...current,
    settings: nextSettings,
    onboardingCompletedKeys: [...nextOnboardingCompletedKeys],
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
      emoji: normalizeProfileEmoji(input.emoji ?? existing.emoji),
      updatedAt: now,
      sampleCount: existing.sampleCount + input.incrementSamplesBy,
      averageEmbedding:
        input.incrementSamplesBy > 0
          ? blendEmbeddings(existing.averageEmbedding, input.embedding, existing.sampleCount)
          : existing.averageEmbedding,
      stats: normalizeUserStats(existing.stats),
      dailyChallenges: normalizeDailyChallenges(existing.dailyChallenges, existing.id),
      unlockedAchievements: Array.isArray(existing.unlockedAchievements) ? existing.unlockedAchievements : []
    };
    current.voiceProfiles = current.voiceProfiles.map((item) =>
      item.id === existing.id ? profile : item
    );
  } else {
    const profileId = randomUUID();
    profile = {
      id: profileId,
      name: input.name,
      emoji: normalizeProfileEmoji(input.emoji),
      createdAt: now,
      updatedAt: now,
      sampleCount: input.incrementSamplesBy,
      averageEmbedding: input.embedding,
      stats: { ...defaultUserStats },
      dailyChallenges: createDailyChallengeSet(profileId),
      unlockedAchievements: []
    };
    current.voiceProfiles = [profile, ...current.voiceProfiles];
    current.settings.activeProfileId = profile.id;
  }

  if (input.incrementSamplesBy > 0) {
    if (!existing) {
      current.settings.activeProfileId = profile.id;
    }
    applyDailyChallengeActivity(current, {
      voiceSamplesRecorded: input.incrementSamplesBy
    });
  }

  syncActiveProfileProgress(current);
  writeData(current);
  return profile;
}

export function deleteVoiceProfile(id: string) {
  const current = readData();
  current.voiceProfiles = current.voiceProfiles.filter((profile) => profile.id !== id);
  current.onboardingCompletedKeys = current.onboardingCompletedKeys.filter((key) => key !== id);
  if (current.settings.activeProfileId === id) {
    current.settings.activeProfileId = current.voiceProfiles[0]?.id ?? null;
  }
  current.settings.onboardingCompleted = current.onboardingCompletedKeys.includes(getOnboardingScopeKey(current));
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

  applyDailyChallengeActivity(current, {
    dictionaryEntriesSaved: 1
  });
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
  applyDailyChallengeActivity(current, {
    dictatedWords: words,
    dictatedCharacters: transcript.trim().length,
    completedDictations: 1,
    longestDictationWords: words,
    longDictations: words >= LONG_DICTATION_WORD_COUNT ? 1 : 0,
    marathonDictations: words >= MARATHON_DICTATION_WORD_COUNT ? 1 : 0,
    activityXpEarned: words
  });

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
    applyDailyChallengeActivity(current, {
      activityXpEarned: xpAward
    });
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
