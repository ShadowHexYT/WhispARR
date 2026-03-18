/// <reference types="vite/client" />

import {
  AchievementSyncResult,
  AchievementUnlockInput,
  AppDiagnostics,
  AppUpdateInfo,
  AppUpdateState,
  AppSettings,
  DictationResult,
  HudState,
  LocalData,
  ManualDictionaryEntry,
  PatchNotesRecord,
  PushToTalkEvent,
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
        replacement?: string;
        entryTypeOverride?: "Abbreviation" | "Word" | "Phrase" | "Sentence";
        addedBySystem?: boolean;
      }) => Promise<ManualDictionaryEntry>;
      deleteManualDictionaryEntry: (id: string) => Promise<ManualDictionaryEntry[]>;
      getWhisperStatus: () => Promise<WhisperConfigStatus>;
      discoverRuntime: () => Promise<RuntimeDiscoveryResult>;
      refreshRuntime: () => Promise<RuntimeDiscoveryResult>;
      installRuntime: () => Promise<RuntimeInstallResult>;
      checkForAppUpdates: (options?: { silent?: boolean }) => Promise<AppUpdateInfo>;
      downloadAndInstallAppUpdate: () => Promise<string>;
      skipAppUpdateVersion: (version: string | null) => Promise<string | null>;
      setPendingPatchNotes: (patchNotes: PatchNotesRecord | null) => Promise<PatchNotesRecord | null>;
      clearPendingPatchNotes: () => Promise<null>;
      skipPatchNotesVersion: (version: string | null) => Promise<string | null>;
      setNeverShowPatchNotes: (value: boolean) => Promise<boolean>;
      openExternal: (url: string) => Promise<boolean>;
      transcribe: (sample: TrainingSample) => Promise<DictationResult>;
      trackTranscriptStats: (transcript: string) => Promise<UserStats>;
      syncAchievements: (unlocked: AchievementUnlockInput[]) => Promise<AchievementSyncResult>;
      saveTranscriptHistory: (history: string[], limit: number) => Promise<string[]>;
      saveNotes: (notes: string) => Promise<string>;
      saveSavedNotes: (savedNotes: string[]) => Promise<string[]>;
      pickFile: () => Promise<string | null>;
      pasteText: (text: string) => Promise<boolean>;
      prepareClipboardForSinglePaste: (text: string) => Promise<boolean>;
      showWindow: () => Promise<boolean>;
      getAppDiagnostics: () => Promise<AppDiagnostics>;
      updateHud: (state: HudState) => Promise<boolean>;
      startHudMoveMode: () => Promise<boolean>;
      stopHudMoveMode: () => Promise<AppSettings>;
      onPushToTalk: (listener: (event: PushToTalkEvent) => void) => () => void;
      onHudState: (listener: (state: HudState) => void) => () => void;
      onAutoDictionaryLearned: (listener: (terms: string[]) => void) => () => void;
      onAppUpdateState: (listener: (state: AppUpdateState) => void) => () => void;
      onSettingsChanged: (listener: (settings: AppSettings) => void) => () => void;
      onNavigate: (listener: (target: "settings") => void) => () => void;
      onTrayRestartEngine: (listener: () => void) => () => void;
    };
  }
}

export {};
