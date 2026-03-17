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
  whisperBinaryPath: string;
  whisperModelPath: string;
  transcriptHistoryLimit: number;
  autoVerifySpeaker: boolean;
  activeProfileId: string | null;
  autoPaste: boolean;
  launchOnLogin: boolean;
  alwaysShowPill: boolean;
  hudPosition: HudPosition | null;
  hudScale: number;
  muteDictationSounds: boolean;
  appSoundVolume: number;
  muteMusicWhileDictating: boolean;
  autoLearnDictionary: boolean;
  smartFormatting: boolean;
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

export type VoiceEmbedding = {
  bands: number[];
  rms: number;
  zcr: number;
};

export type VoiceProfile = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sampleCount: number;
  averageEmbedding: VoiceEmbedding;
};

export type ManualDictionaryEntry = {
  id: string;
  term: string;
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

export type AchievementUnlockInput = {
  title: string;
  xp: number;
};

export type AchievementSyncResult = {
  unlockedAchievements: string[];
  newlyUnlocked: string[];
  stats: UserStats;
};

export type LocalData = {
  settings: AppSettings;
  voiceProfiles: VoiceProfile[];
  manualDictionary: ManualDictionaryEntry[];
  stats: UserStats;
  unlockedAchievements: string[];
  transcriptHistory: string[];
  notes: string;
  savedNotes: string[];
};

export type WhisperConfigStatus = {
  binaryExists: boolean;
  modelExists: boolean;
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

export type AppDiagnostics = {
  version: string;
  platform: string;
  arch: string;
  isPackaged: boolean;
  exePath: string;
  userDataPath: string;
  appPath: string;
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
