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

export type AppSettings = {
  selectedMicId: string | null;
  whisperBinaryPath: string;
  whisperModelPath: string;
  transcriptHistoryLimit: number;
  autoVerifySpeaker: boolean;
  activeProfileId: string | null;
  autoPaste: boolean;
  launchOnLogin: boolean;
  activationShortcut: ActivationShortcut;
  appTheme: AppThemeName;
  customTheme: CustomThemeColors;
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

export type LocalData = {
  settings: AppSettings;
  voiceProfiles: VoiceProfile[];
  manualDictionary: ManualDictionaryEntry[];
  stats: UserStats;
  transcriptHistory: string[];
  notes: string;
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
  message: string;
};

export type HudState = {
  visible: boolean;
  level: number;
  label?: string;
};
