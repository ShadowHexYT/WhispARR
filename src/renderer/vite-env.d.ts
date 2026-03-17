/// <reference types="vite/client" />

import {
  AchievementSyncResult,
  AchievementUnlockInput,
  AppDiagnostics,
  AppUpdateInfo,
  AppSettings,
  DictationResult,
  HudState,
  LocalData,
  ManualDictionaryEntry,
  RuntimeDiscoveryResult,
  RuntimeInstallResult,
  SaveVoiceProfileInput,
  TrainingSample,
  UserStats,
  VoiceProfile,
  WhisperConfigStatus
} from "../shared/types";

declare global {
  interface Window {
    wisprApi: {
      loadData: () => Promise<LocalData>;
      updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
      saveVoiceProfile: (input: SaveVoiceProfileInput) => Promise<VoiceProfile>;
      deleteVoiceProfile: (id: string) => Promise<VoiceProfile[]>;
      saveManualDictionaryEntry: (input: {
        id?: string;
        term: string;
        addedBySystem?: boolean;
      }) => Promise<ManualDictionaryEntry>;
      deleteManualDictionaryEntry: (id: string) => Promise<ManualDictionaryEntry[]>;
      getWhisperStatus: () => Promise<WhisperConfigStatus>;
      discoverRuntime: () => Promise<RuntimeDiscoveryResult>;
      installRuntime: () => Promise<RuntimeInstallResult>;
      checkForAppUpdates: () => Promise<AppUpdateInfo>;
      downloadAndInstallAppUpdate: () => Promise<string>;
      transcribe: (sample: TrainingSample) => Promise<DictationResult>;
      trackTranscriptStats: (transcript: string) => Promise<UserStats>;
      syncAchievements: (unlocked: AchievementUnlockInput[]) => Promise<AchievementSyncResult>;
      saveTranscriptHistory: (history: string[], limit: number) => Promise<string[]>;
      saveNotes: (notes: string) => Promise<string>;
      saveSavedNotes: (savedNotes: string[]) => Promise<string[]>;
      pickFile: () => Promise<string | null>;
      pasteText: (text: string) => Promise<boolean>;
      showWindow: () => Promise<boolean>;
      getAppDiagnostics: () => Promise<AppDiagnostics>;
      updateHud: (state: HudState) => Promise<boolean>;
      startHudMoveMode: () => Promise<boolean>;
      stopHudMoveMode: () => Promise<AppSettings>;
      onPushToTalk: (listener: (state: "start" | "stop") => void) => () => void;
      onHudState: (listener: (state: HudState) => void) => () => void;
      onAutoDictionaryLearned: (listener: (terms: string[]) => void) => () => void;
    };
  }
}

export {};
