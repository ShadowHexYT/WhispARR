import { contextBridge, ipcRenderer } from "electron";
import {
  AchievementSyncResult,
  AchievementUnlockInput,
  AppDiagnostics,
  AppUpdateInfo,
  AppUpdateState,
  AppSettings,
  LocalData,
  ManualDictionaryEntry,
  PasteTextResult,
  PatchNotesRecord,
  RuntimeDiscoveryResult,
  RuntimeInstallResult,
  SaveVoiceProfileInput,
  TrainingSample,
  HudState,
  PushToTalkEvent,
  UserStats
} from "../shared/types";

contextBridge.exposeInMainWorld("wisprApi", {
  loadData: () => ipcRenderer.invoke("data:load") as Promise<LocalData>,
  updateSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke("settings:update", patch) as Promise<AppSettings>,
  saveVoiceProfile: (input: SaveVoiceProfileInput) =>
    ipcRenderer.invoke("voice-profile:save", input),
  deleteVoiceProfile: (id: string) =>
    ipcRenderer.invoke("voice-profile:delete", id),
  saveManualDictionaryEntry: (input: {
    id?: string;
    term: string;
    replacement?: string;
    entryTypeOverride?: "Abbreviation" | "Word" | "Phrase" | "Sentence";
    addedBySystem?: boolean;
  }) => ipcRenderer.invoke("dictionary:save", input) as Promise<ManualDictionaryEntry>,
  deleteManualDictionaryEntry: (id: string) =>
    ipcRenderer.invoke("dictionary:delete", id) as Promise<ManualDictionaryEntry[]>,
  getWhisperStatus: () => ipcRenderer.invoke("whisper:status"),
  discoverRuntime: () => ipcRenderer.invoke("runtime:discover") as Promise<RuntimeDiscoveryResult>,
  refreshRuntime: () => ipcRenderer.invoke("runtime:refresh") as Promise<RuntimeDiscoveryResult>,
  installRuntime: () => ipcRenderer.invoke("runtime:install") as Promise<RuntimeInstallResult>,
  checkForAppUpdates: (options?: { silent?: boolean }) =>
    ipcRenderer.invoke("app:update:check", options) as Promise<AppUpdateInfo>,
  downloadAndInstallAppUpdate: () =>
    ipcRenderer.invoke("app:update:download-and-install") as Promise<string>,
  skipAppUpdateVersion: (version: string | null) =>
    ipcRenderer.invoke("app:update:skip-version", version) as Promise<string | null>,
  setPendingPatchNotes: (patchNotes: PatchNotesRecord | null) =>
    ipcRenderer.invoke("patch-notes:set-pending", patchNotes) as Promise<PatchNotesRecord | null>,
  clearPendingPatchNotes: () =>
    ipcRenderer.invoke("patch-notes:clear-pending") as Promise<null>,
  skipPatchNotesVersion: (version: string | null) =>
    ipcRenderer.invoke("patch-notes:skip-version", version) as Promise<string | null>,
  setNeverShowPatchNotes: (value: boolean) =>
    ipcRenderer.invoke("patch-notes:set-never-show", value) as Promise<boolean>,
  openExternal: (url: string) =>
    ipcRenderer.invoke("app:open-external", url) as Promise<boolean>,
  transcribe: (sample: TrainingSample) => ipcRenderer.invoke("dictation:transcribe", sample),
  trackTranscriptStats: (transcript: string) =>
    ipcRenderer.invoke("stats:track-transcript", transcript) as Promise<UserStats>,
  syncAchievements: (unlocked: AchievementUnlockInput[]) =>
    ipcRenderer.invoke("achievements:sync", unlocked) as Promise<AchievementSyncResult>,
  saveTranscriptHistory: (history: string[], limit: number) =>
    ipcRenderer.invoke("history:save", history, limit) as Promise<string[]>,
  saveNotes: (notes: string) => ipcRenderer.invoke("notes:save", notes) as Promise<string>,
  saveSavedNotes: (savedNotes: string[]) =>
    ipcRenderer.invoke("notes:saved-list:save", savedNotes) as Promise<string[]>,
  pickFile: () => ipcRenderer.invoke("dialog:pick-file") as Promise<string | null>,
  pasteText: (text: string) => ipcRenderer.invoke("paste:text", text) as Promise<PasteTextResult>,
  prepareClipboardForSinglePaste: (text: string) =>
    ipcRenderer.invoke("clipboard:prepare-single-paste", text) as Promise<boolean>,
  showWindow: () => ipcRenderer.invoke("app:show-window") as Promise<boolean>,
  getAppDiagnostics: () => ipcRenderer.invoke("app:diagnostics") as Promise<AppDiagnostics>,
  updateHud: (state: HudState) => ipcRenderer.invoke("hud:update", state) as Promise<boolean>,
  startHudMoveMode: () => ipcRenderer.invoke("hud:move:start") as Promise<boolean>,
  stopHudMoveMode: () => ipcRenderer.invoke("hud:move:stop") as Promise<AppSettings>,
  startHudPressToTalk: () => ipcRenderer.invoke("hud:press-to-talk:start") as Promise<boolean>,
  stopHudPressToTalk: () => ipcRenderer.invoke("hud:press-to-talk:stop") as Promise<boolean>,
  onPushToTalk: (listener: (event: PushToTalkEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, event: PushToTalkEvent) => {
      listener(event);
    };
    ipcRenderer.on("ptt:event", wrapped);
    return () => {
      ipcRenderer.removeListener("ptt:event", wrapped);
    };
  },
  onHudState: (listener: (state: HudState) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: HudState) => {
      listener(state);
    };
    ipcRenderer.on("hud:state", wrapped);
    return () => {
      ipcRenderer.removeListener("hud:state", wrapped);
    };
  },
  onAppUpdateState: (listener: (state: AppUpdateState) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: AppUpdateState) => {
      listener(state);
    };
    ipcRenderer.on("app:update:state", wrapped);
    return () => {
      ipcRenderer.removeListener("app:update:state", wrapped);
    };
  },
  onSettingsChanged: (listener: (settings: AppSettings) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, settings: AppSettings) => {
      listener(settings);
    };
    ipcRenderer.on("settings:changed", wrapped);
    return () => {
      ipcRenderer.removeListener("settings:changed", wrapped);
    };
  },
  onNavigate: (listener: (target: "settings") => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, target: "settings") => {
      listener(target);
    };
    ipcRenderer.on("app:navigate", wrapped);
    return () => {
      ipcRenderer.removeListener("app:navigate", wrapped);
    };
  },
  onTrayRestartEngine: (listener: () => void) => {
    const wrapped = () => {
      listener();
    };
    ipcRenderer.on("tray:restart-engine", wrapped);
    return () => {
      ipcRenderer.removeListener("tray:restart-engine", wrapped);
    };
  }
});
