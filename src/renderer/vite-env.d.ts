/// <reference types="vite/client" />

import {
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
      }) => Promise<ManualDictionaryEntry>;
      deleteManualDictionaryEntry: (id: string) => Promise<ManualDictionaryEntry[]>;
      getWhisperStatus: () => Promise<WhisperConfigStatus>;
      discoverRuntime: () => Promise<RuntimeDiscoveryResult>;
      installRuntime: () => Promise<RuntimeInstallResult>;
      transcribe: (sample: TrainingSample) => Promise<DictationResult>;
      trackTranscriptStats: (transcript: string) => Promise<UserStats>;
      saveTranscriptHistory: (history: string[], limit: number) => Promise<string[]>;
      saveNotes: (notes: string) => Promise<string>;
      pickFile: () => Promise<string | null>;
      pasteText: (text: string) => Promise<boolean>;
      showWindow: () => Promise<boolean>;
      updateHud: (state: HudState) => Promise<boolean>;
      onPushToTalk: (listener: (state: "start" | "stop") => void) => () => void;
      onHudState: (listener: (state: HudState) => void) => () => void;
    };
  }
}

export {};
