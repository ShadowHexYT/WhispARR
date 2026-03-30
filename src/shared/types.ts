export type ShortcutModifier = "ctrl" | "meta" | "alt" | "shift";

export type AppThemeName =
  | "aurora"
  | "ember"
  | "ocean"
  | "rose"
  | "sunset"
  | "violet"
  | "forest"
  | "gold"
  | "arctic"
  | "crimson"
  | "custom";

export type CustomThemeColors = {
  primary: string;
  secondary: string;
  tertiary: string;
};

export type ActivationShortcut = {
  modifiers: ShortcutModifier[];
  key: string | null;
};

export type HudPosition = {
  x: number;
  y: number;
};

export type AppSettings = {
  selectedMicId: string | null;
  selectedOutputDeviceId: string | null;
  whisperBinaryPath: string;
  whisperModelPath: string;
  transcriptHistoryLimit: number;
  autoVerifySpeaker: boolean;
  activeProfileId: string | null;
  autoPaste: boolean;
  launchOnLogin: boolean;
  alwaysShowPill: boolean;
  enableHudDragHotkey: boolean;
  hudPosition: HudPosition | null;
  hudScale: number;
  muteDictationSounds: boolean;
  appSoundVolume: number;
  levelUpSoundPath: string;
  levelUpSoundVolume: number;
  achievementSoundPath: string;
  achievementSoundVolume: number;
  dictionarySoundPath: string;
  dictionarySoundVolume: number;
  lowerVolumeOnTranscription: boolean;
  transcriptionReducedVolume: number;
  saveDictationToClipboardHistory: boolean;
  codingLanguageMode: boolean;
  smartFormatting: boolean;
  filterProfanity: boolean;
  activationShortcut: ActivationShortcut;
  appTheme: AppThemeName;
  customTheme: CustomThemeColors;
  onboardingCompleted: boolean;
  devModeUnlocked: boolean;
  devModeEnabled: boolean;
};

export type DictationResult = {
  transcript: string;
  elapsedMs: number;
  speakerScore?: number;
};

export type PasteTextResult = {
  autoPasted: boolean;
  manualPasteReady: boolean;
};

export type VoiceEmbedding = {
  bands: number[];
  rms: number;
  zcr: number;
};

export type VoiceProfile = {
  id: string;
  name: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
  sampleCount: number;
  averageEmbedding: VoiceEmbedding;
  stats: UserStats;
  unlockedAchievements: string[];
  dailyChallenges: DailyChallengeSet;
};

export type ManualDictionaryEntry = {
  id: string;
  term: string;
  replacement?: string;
  entryTypeOverride?: "Abbreviation" | "Word" | "Phrase" | "Sentence";
  addedBySystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TrainingSample = {
  pcm: number[];
  sampleRate: number;
};

export type SaveVoiceProfileInput = {
  id?: string;
  name: string;
  emoji?: string;
  embedding: VoiceEmbedding;
  incrementSamplesBy: number;
};

export type UserStats = {
  totalWords: number;
  totalXp: number;
  currentLevel: number;
  currentStreakDays: number;
  lastUsedOn: string | null;
};

export type DailyChallengeMetric =
  | "dictatedWords"
  | "dictatedCharacters"
  | "completedDictations"
  | "longestDictationWords"
  | "longDictations"
  | "marathonDictations"
  | "activityXpEarned"
  | "voiceSamplesRecorded"
  | "dictionaryEntriesSaved";

export type DailyChallengeProgress = {
  dictatedWords: number;
  dictatedCharacters: number;
  completedDictations: number;
  longestDictationWords: number;
  longDictations: number;
  marathonDictations: number;
  activityXpEarned: number;
  voiceSamplesRecorded: number;
  dictionaryEntriesSaved: number;
};

export type DailyChallengeTask = {
  id: string;
  title: string;
  description: string;
  metric: DailyChallengeMetric;
  target: number;
  rewardXp: number;
  completedAt: string | null;
  rewardGranted: boolean;
};

export type DailyChallengeSet = {
  version: number;
  cycleKey: string;
  startedAt: string;
  resetsAt: string;
  tasks: DailyChallengeTask[];
  progress: DailyChallengeProgress;
  completedSetRewardGranted: boolean;
  setCompletedAt: string | null;
};

export type AchievementUnlockInput = {
  title: string;
  xp: number;
};

export type AchievementSyncResult = {
  unlockedAchievements: string[];
  newlyUnlocked: string[];
  stats: UserStats;
};

export type SpokenPunctuationPreference = {
  punctuationBias: number;
  literalBias: number;
  updatedAt: string | null;
};

export type SpokenPunctuationPreferenceMap = Record<string, SpokenPunctuationPreference>;

export type DataIntegrity = {
  installScope: string | null;
  profiles: Record<string, string>;
  generatedAt: string | null;
};

export type LocalData = {
  installRegistrationKey: string;
  integrity: DataIntegrity;
  onboardingCompletedKeys: string[];
  skippedAppUpdateVersion: string | null;
  skippedPatchNotesVersion: string | null;
  neverShowPatchNotes: boolean;
  pendingPatchNotes: PatchNotesRecord | null;
  spokenPunctuationPreferences: SpokenPunctuationPreferenceMap;
  settings: AppSettings;
  voiceProfiles: VoiceProfile[];
  manualDictionary: ManualDictionaryEntry[];
  stats: UserStats;
  dailyChallenges: DailyChallengeSet;
  unlockedAchievements: string[];
  transcriptHistory: string[];
  notes: string;
  savedNotes: string[];
};

export type WhisperConfigStatus = {
  binaryExists: boolean;
  modelExists: boolean;
};

export type PushToTalkEvent = {
  id: number;
  state: "start" | "stop";
};

export type RuntimeCandidate = {
  binaryPath: string;
  modelPath: string;
  source: string;
};

export type RuntimeDiscoveryResult = {
  candidates: RuntimeCandidate[];
  selected: RuntimeCandidate | null;
};

export type RuntimeInstallResult = {
  discovery: RuntimeDiscoveryResult;
  installed: boolean;
  ready: boolean;
  message: string;
};

export type AppUpdateInfo = {
  configured: boolean;
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  releaseName: string | null;
  releaseNotes: string | null;
  downloadUrl: string | null;
  assetName: string | null;
  htmlUrl: string | null;
  message: string;
};

export type AppUpdateState = {
  stage: "idle" | "checking" | "available" | "none" | "downloading" | "downloaded" | "installing" | "error";
  message: string;
  progress: number | null;
  info: AppUpdateInfo | null;
};

export type PatchNotesRecord = {
  version: string;
  releaseName: string | null;
  releaseNotes: string | null;
};

export type AppDiagnostics = {
  version: string;
  platform: string;
  arch: string;
  isPackaged: boolean;
  exePath: string;
  userDataPath: string;
  appPath: string;
};

export type AudioOutputDevice = {
  id: string;
  label: string;
  isDefault: boolean;
};

export type HudState = {
  visible: boolean;
  level: number;
  label?: string;
  soundEnabled?: boolean;
  soundVolume?: number;
  hudScale?: number;
  moveMode?: boolean;
};
