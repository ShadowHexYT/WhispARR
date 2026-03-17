import { contextBridge, ipcRenderer } from "electron";
import {
  AppDiagnostics,
  AppUpdateInfo,
  AppSettings,
  LocalData,
  ManualDictionaryEntry,
  RuntimeDiscoveryResult,
  RuntimeInstallResult,
  SaveVoiceProfileInput,
  TrainingSample,
  HudState,
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
    addedBySystem?: boolean;
  }) => ipcRenderer.invoke("dictionary:save", input) as Promise<ManualDictionaryEntry>,
  deleteManualDictionaryEntry: (id: string) =>
    ipcRenderer.invoke("dictionary:delete", id) as Promise<ManualDictionaryEntry[]>,
  getWhisperStatus: () => ipcRenderer.invoke("whisper:status"),
  discoverRuntime: () => ipcRenderer.invoke("runtime:discover") as Promise<RuntimeDiscoveryResult>,
  installRuntime: () => ipcRenderer.invoke("runtime:install") as Promise<RuntimeInstallResult>,
  checkForAppUpdates: () => ipcRenderer.invoke("app:update:check") as Promise<AppUpdateInfo>,
  downloadAndInstallAppUpdate: () =>
    ipcRenderer.invoke("app:update:download-and-install") as Promise<string>,
  transcribe: (sample: TrainingSample) => ipcRenderer.invoke("dictation:transcribe", sample),
  trackTranscriptStats: (transcript: string) =>
    ipcRenderer.invoke("stats:track-transcript", transcript) as Promise<UserStats>,
  saveTranscriptHistory: (history: string[], limit: number) =>
    ipcRenderer.invoke("history:save", history, limit) as Promise<string[]>,
  saveNotes: (notes: string) => ipcRenderer.invoke("notes:save", notes) as Promise<string>,
  saveSavedNotes: (savedNotes: string[]) =>
    ipcRenderer.invoke("notes:saved-list:save", savedNotes) as Promise<string[]>,
  pickFile: () => ipcRenderer.invoke("dialog:pick-file") as Promise<string | null>,
  pasteText: (text: string) => ipcRenderer.invoke("paste:text", text) as Promise<boolean>,
  showWindow: () => ipcRenderer.invoke("app:show-window") as Promise<boolean>,
  getAppDiagnostics: () => ipcRenderer.invoke("app:diagnostics") as Promise<AppDiagnostics>,
  updateHud: (state: HudState) => ipcRenderer.invoke("hud:update", state) as Promise<boolean>,
  startHudMoveMode: () => ipcRenderer.invoke("hud:move:start") as Promise<boolean>,
  stopHudMoveMode: () => ipcRenderer.invoke("hud:move:stop") as Promise<AppSettings>,
  onPushToTalk: (listener: (state: "start" | "stop") => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: "start" | "stop") => {
      listener(state);
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
  }
});
