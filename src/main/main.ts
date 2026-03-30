import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  Tray,
  nativeImage,
  screen,
  shell
} from "electron";
import path from "node:path";
import { execFile } from "node:child_process";
import { uIOhook, UiohookKey, UiohookKeyboardEvent } from "uiohook-napi";
import {
  deleteManualDictionaryEntry,
  deleteVoiceProfile,
  readData,
  saveManualDictionaryEntry,
  saveNotes,
  saveSavedNotes,
  clearPendingPatchNotes,
  saveVoiceProfile,
  saveTranscriptHistory,
  setNeverShowPatchNotes,
  setPendingPatchNotes,
  setSkippedPatchNotesVersion,
  setSkippedAppUpdateVersion,
  syncAchievementUnlocks,
  updateSettings,
  updateStatsFromTranscript
} from "./storage";
import { discoverRuntime, installRuntime } from "./runtime";
import { getWhisperConfigStatus, transcribeLocally } from "./whisper";
import { checkForAppUpdates, downloadAppUpdate, subscribeToAppUpdateState } from "./updates";
import {
  AchievementUnlockInput,
  ActivationShortcut,
  AppThemeName,
  AppUpdateState,
  AppSettings,
  CustomThemeColors,
  HudState,
  AppDiagnostics,
  PasteTextResult,
  PatchNotesRecord,
  PushToTalkEvent,
  SaveVoiceProfileInput,
  ShortcutModifier,
  TrainingSample
} from "../shared/types";

const isDev = !app.isPackaged;

if (isDev) {
  app.setName("WhispARR Dev");
  app.setPath("userData", path.join(app.getPath("appData"), "WhispARR Dev"));
  app.setPath("sessionData", path.join(app.getPath("appData"), "WhispARR Dev", "session"));
}

const MODIFIER_KEY_CODES: Record<ShortcutModifier, number[]> = {
  ctrl: [UiohookKey.Ctrl, UiohookKey.CtrlRight],
  meta: [UiohookKey.Meta, UiohookKey.MetaRight],
  alt: [UiohookKey.Alt, UiohookKey.AltRight],
  shift: [UiohookKey.Shift, UiohookKey.ShiftRight]
};

const NON_MODIFIER_KEY_CODES: Record<string, number[]> = {
  Backspace: [UiohookKey.Backspace],
  Tab: [UiohookKey.Tab],
  Enter: [UiohookKey.Enter],
  Space: [UiohookKey.Space],
  Escape: [UiohookKey.Escape],
  ArrowUp: [UiohookKey.ArrowUp],
  ArrowDown: [UiohookKey.ArrowDown],
  ArrowLeft: [UiohookKey.ArrowLeft],
  ArrowRight: [UiohookKey.ArrowRight],
  Delete: [UiohookKey.Delete],
  Insert: [UiohookKey.Insert],
  Home: [UiohookKey.Home],
  End: [UiohookKey.End],
  PageUp: [UiohookKey.PageUp],
  PageDown: [UiohookKey.PageDown],
  Digit0: [UiohookKey[0]],
  Digit1: [UiohookKey[1]],
  Digit2: [UiohookKey[2]],
  Digit3: [UiohookKey[3]],
  Digit4: [UiohookKey[4]],
  Digit5: [UiohookKey[5]],
  Digit6: [UiohookKey[6]],
  Digit7: [UiohookKey[7]],
  Digit8: [UiohookKey[8]],
  Digit9: [UiohookKey[9]],
  KeyA: [UiohookKey.A],
  KeyB: [UiohookKey.B],
  KeyC: [UiohookKey.C],
  KeyD: [UiohookKey.D],
  KeyE: [UiohookKey.E],
  KeyF: [UiohookKey.F],
  KeyG: [UiohookKey.G],
  KeyH: [UiohookKey.H],
  KeyI: [UiohookKey.I],
  KeyJ: [UiohookKey.J],
  KeyK: [UiohookKey.K],
  KeyL: [UiohookKey.L],
  KeyM: [UiohookKey.M],
  KeyN: [UiohookKey.N],
  KeyO: [UiohookKey.O],
  KeyP: [UiohookKey.P],
  KeyQ: [UiohookKey.Q],
  KeyR: [UiohookKey.R],
  KeyS: [UiohookKey.S],
  KeyT: [UiohookKey.T],
  KeyU: [UiohookKey.U],
  KeyV: [UiohookKey.V],
  KeyW: [UiohookKey.W],
  KeyX: [UiohookKey.X],
  KeyY: [UiohookKey.Y],
  KeyZ: [UiohookKey.Z],
  F1: [UiohookKey.F1],
  F2: [UiohookKey.F2],
  F3: [UiohookKey.F3],
  F4: [UiohookKey.F4],
  F5: [UiohookKey.F5],
  F6: [UiohookKey.F6],
  F7: [UiohookKey.F7],
  F8: [UiohookKey.F8],
  F9: [UiohookKey.F9],
  F10: [UiohookKey.F10],
  F11: [UiohookKey.F11],
  F12: [UiohookKey.F12]
};

let mainWindow: BrowserWindow | null = null;
let hudWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let pushToTalkActive = false;
let isHudMoveMode = false;
let currentSettings = readData().settings;
let currentHudState: HudState = {
  visible: false,
  level: 0,
  label: "Ready",
  soundEnabled: !currentSettings.muteDictationSounds,
  soundVolume: Math.max(0, Math.min(1, currentSettings.appSoundVolume / 100)),
  hudScale: currentSettings.hudScale,
  moveMode: false
};
let lastHudSignature = JSON.stringify(currentHudState);
let lastHudDimensions = { width: 0, height: 0 };
let lastHudPosition = { x: Number.NaN, y: Number.NaN };
const pressedKeys = new Set<number>();
let pendingPasteTargetContext:
  | {
      windowHandle: string;
    }
  | null = null;
let managedClipboardSession:
  | {
      originalText: string;
      originalHadText: boolean;
      stagedText: string;
      mode: "auto" | "manual";
      cleanupTimeout: NodeJS.Timeout | null;
    }
  | null = null;
let hudPressToTalkActive = false;
let hudMoveModeSource: "manual" | "hotkey" | null = null;
let volumeDuckSession:
  | {
      originalVolume: number;
      loweredVolume: number;
    }
  | null = null;
let registeredActivationAccelerator: string | null = null;
let pushToTalkEventId = 0;
const HUD_BASE_WIDTH = 110;
const HUD_BASE_HEIGHT = 44;
const HUD_MARGIN = 6;

function broadcastAppUpdateState(state: AppUpdateState) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("app:update:state", state);
}

function broadcastSettingsChanged(settings: AppSettings) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("settings:changed", settings);
}

function sendToMainWindow(channel: string, payload?: unknown) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const deliver = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send(channel, payload);
  };

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", deliver);
    return;
  }

  deliver();
}

function getHudDimensions() {
  const scale = Math.max(60, Math.min(160, currentSettings.hudScale || 100)) / 100;
  return {
    width: Math.round(HUD_BASE_WIDTH * scale),
    height: Math.round(HUD_BASE_HEIGHT * scale)
  };
}

const windowsOverlayColors: Record<AppThemeName, string> = {
  aurora: "#061018",
  ember: "#190c0a",
  ocean: "#06131b",
  rose: "#180a14",
  sunset: "#1c1008",
  violet: "#140d24",
  forest: "#0b140d",
  gold: "#171306",
  arctic: "#0b1417",
  crimson: "#19080d",
  custom: "#061018"
};

function getWindowOverlayColor(theme: AppThemeName, customTheme: CustomThemeColors) {
  if (theme !== "custom") {
    return windowsOverlayColors[theme];
  }

  const normalized = customTheme.tertiary.replace("#", "");
  const safe = normalized.length === 3
    ? normalized
        .split("")
        .map((part) => part + part)
        .join("")
    : normalized;

  const int = Number.parseInt(safe, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const blend = (value: number, target: number, amount: number) =>
    Math.round(value + (target - value) * amount);

  const nr = blend(r, 6, 0.82);
  const ng = blend(g, 16, 0.82);
  const nb = blend(b, 24, 0.82);

  return `#${[nr, ng, nb].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function getAppIconPath() {
  return isDev
    ? path.join(app.getAppPath(), "assets", "WhispARR new logo.png")
    : path.join(process.resourcesPath, "assets", "WhispARR new logo.png");
}

function createZoomedIcon(zoom: number, size: number) {
  const image = nativeImage.createFromPath(getAppIconPath());
  const { width, height } = image.getSize();
  const cropSize = Math.max(1, Math.round(Math.min(width, height) / zoom));
  const x = Math.max(0, Math.floor((width - cropSize) / 2));
  const y = Math.max(0, Math.floor((height - cropSize) / 2));

  return image
    .crop({ x, y, width: cropSize, height: cropSize })
    .resize({ width: size, height: size });
}

function getAppDiagnostics(): AppDiagnostics {
  return {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    exePath: app.getPath("exe"),
    userDataPath: app.getPath("userData"),
    appPath: app.getAppPath()
  };
}

function createTrayIcon() {
  return createZoomedIcon(1.44, 24);
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
  }

  mainWindow?.setSkipTaskbar(false);
  mainWindow?.show();
  mainWindow?.focus();
}

function showMainWindowSettings() {
  showMainWindow();
  sendToMainWindow("app:navigate", "settings");
}

function hideMainWindowToTray() {
  mainWindow?.hide();
  mainWindow?.setSkipTaskbar(true);
}

function clampHudPosition(position: { x: number; y: number }, bounds: Electron.Rectangle) {
  const { width, height } = getHudDimensions();
  return {
    x: Math.min(Math.max(position.x, bounds.x), bounds.x + bounds.width - width),
    y: Math.min(Math.max(position.y, bounds.y), bounds.y + bounds.height - height)
  };
}

function getDefaultHudPosition(bounds: Electron.Rectangle) {
  const { width, height } = getHudDimensions();
  return {
    x: bounds.x + Math.round((bounds.width - width) / 2),
    y: bounds.y + bounds.height - height - HUD_MARGIN
  };
}

function getHudPosition() {
  const display = screen.getPrimaryDisplay();
  const bounds = display.workArea;
  const saved = currentSettings.hudPosition;
  return saved ? clampHudPosition(saved, bounds) : getDefaultHudPosition(bounds);
}

function positionHudWindow() {
  if (!hudWindow) {
    return;
  }

  const { width, height } = getHudDimensions();
  const position = getHudPosition();
  if (
    lastHudDimensions.width === width &&
    lastHudDimensions.height === height &&
    lastHudPosition.x === position.x &&
    lastHudPosition.y === position.y
  ) {
    return;
  }

  lastHudDimensions = { width, height };
  lastHudPosition = position;
  hudWindow.setBounds({
    width,
    height,
    x: position.x,
    y: position.y
  });
}

function createHudWindow() {
  if (hudWindow) {
    return hudWindow;
  }

  const { width, height } = getHudDimensions();
  hudWindow = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hudWindow.setIgnoreMouseEvents(true);
  positionHudWindow();

  if (isDev) {
    void hudWindow.loadURL("http://localhost:5173/hud.html");
  } else {
    void hudWindow.loadFile(path.join(__dirname, "../../dist/hud.html"));
  }

  return hudWindow;
}

function syncHudWindowInteractivity() {
  if (!hudWindow) {
    return;
  }

  const hudShouldCapturePointer = isHudMoveMode || currentSettings.alwaysShowPill;
  hudWindow.setIgnoreMouseEvents(!hudShouldCapturePointer);
  hudWindow.setFocusable(isHudMoveMode);
  hudWindow.setMovable(isHudMoveMode);
}

function getHudPayload(overrides: Partial<HudState> = {}) {
  return {
    ...currentHudState,
    ...overrides,
    moveMode: isHudMoveMode
  };
}

function updateHud(state: HudState) {
  if (!hudWindow) {
    createHudWindow();
  }

  if (!hudWindow) {
    return;
  }

  currentHudState = getHudPayload(state);
  const nextSignature = JSON.stringify(currentHudState);
  const shouldSyncPayload = nextSignature !== lastHudSignature;
  lastHudSignature = nextSignature;
  syncHudWindowInteractivity();
  positionHudWindow();
  if (shouldSyncPayload) {
    hudWindow.webContents.send("hud:state", currentHudState);
  }

  const shouldShow = currentHudState.visible || currentSettings.alwaysShowPill || isHudMoveMode;

  if (shouldShow) {
    if (isHudMoveMode) {
      hudWindow.show();
      hudWindow.focus();
    } else {
      hudWindow.showInactive();
    }
  } else {
    hudWindow.hide();
  }
}

function startHudMoveMode() {
  hudMoveModeSource = "manual";
  isHudMoveMode = true;
  updateHud(currentHudState);
}

function stopHudMoveMode() {
  if (hudWindow) {
    const bounds = screen.getPrimaryDisplay().workArea;
    const nextPosition = clampHudPosition(hudWindow.getBounds(), bounds);
    currentSettings = updateSettings({
      hudPosition: {
        x: nextPosition.x,
        y: nextPosition.y
      }
    });
  }

  isHudMoveMode = false;
  hudMoveModeSource = null;
  lastHudDimensions = { width: 0, height: 0 };
  updateHud(currentHudState);
  return currentSettings;
}

function startHudMoveModeFromHotkey() {
  if (isHudMoveMode) {
    return false;
  }

  hudMoveModeSource = "hotkey";
  isHudMoveMode = true;
  updateHud(currentHudState);
  return true;
}

function stopHudMoveModeFromHotkey() {
  if (!isHudMoveMode || hudMoveModeSource !== "hotkey") {
    return false;
  }

  stopHudMoveMode();
  return true;
}

function sendPushToTalkEvent(state: "start" | "stop") {
  if (!mainWindow) {
    createWindow();
  }

  if (state === "start") {
    void capturePasteTargetContext();
  }

  const event: PushToTalkEvent = {
    id: ++pushToTalkEventId,
    state
  };
  mainWindow?.webContents.send("ptt:event", event);
}

function beginPushToTalkSession() {
  if (pushToTalkActive) {
    return false;
  }

  pushToTalkActive = true;
  void duckVolumeForDictationIfNeeded();
  updateHud({
    visible: true,
    level: 0,
    label: "Listening",
    soundEnabled: !currentSettings.muteDictationSounds,
    soundVolume: Math.max(0, Math.min(1, currentSettings.appSoundVolume / 100)),
    hudScale: currentSettings.hudScale
  });
  sendPushToTalkEvent("start");
  return true;
}

function endPushToTalkSession() {
  if (!pushToTalkActive) {
    return false;
  }

  pushToTalkActive = false;
  void restoreVolumeAfterDictationIfNeeded();
  updateHud({
    visible: false,
    level: 0,
    label: "Ready",
    soundEnabled: !currentSettings.muteDictationSounds,
    soundVolume: Math.max(0, Math.min(1, currentSettings.appSoundVolume / 100)),
    hudScale: currentSettings.hudScale
  });
  sendPushToTalkEvent("stop");
  return true;
}

function beginHudPressToTalk() {
  if (!currentSettings.alwaysShowPill || isHudMoveMode || pushToTalkActive) {
    return false;
  }

  hudPressToTalkActive = true;
  return beginPushToTalkSession();
}

function endHudPressToTalk() {
  if (!hudPressToTalkActive) {
    return false;
  }

  hudPressToTalkActive = false;
  return endPushToTalkSession();
}

function updateLaunchOnLogin(settings: AppSettings) {
  app.setLoginItemSettings({
    openAtLogin: settings.launchOnLogin
  });
}

function getWindowsVolumeScript(action: "get" | "set") {
  return `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"), ComImport]
public class MMDeviceEnumeratorComObject {}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int NotImpl1();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr pNotify);
  int UnregisterControlChangeNotify(IntPtr pNotify);
  int GetChannelCount(out uint pnChannelCount);
  int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
  int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
  int GetMasterVolumeLevel(out float pfLevelDB);
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
  int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
  int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
  int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
  int GetMute(out bool pbMute);
  int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
  int VolumeStepUp(ref Guid pguidEventContext);
  int VolumeStepDown(ref Guid pguidEventContext);
  int QueryHardwareSupport(out uint pdwHardwareSupportMask);
  int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
}

public static class WhispARRSystemVolume {
  public static IAudioEndpointVolume GetEndpointVolume() {
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice device;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
    object endpointVolume;
    var iid = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out endpointVolume));
    return (IAudioEndpointVolume)endpointVolume;
  }
}
"@
$volume = [WhispARRSystemVolume]::GetEndpointVolume()
${action === "get"
  ? `
[float]$level = 0
[void]$volume.GetMasterVolumeLevelScalar([ref]$level)
[Math]::Round($level * 100)
`
  : `
$target = [Math]::Max(0, [Math]::Min(100, [int]$env:WHISPARR_TARGET_VOLUME))
$context = [Guid]::Empty
[void]$volume.SetMasterVolumeLevelScalar($target / 100.0, [ref]$context)
Write-Output $target
`}
`;
}

async function getSystemOutputVolume() {
  if (process.platform !== "win32") {
    return null;
  }

  try {
    const value = await runPowerShell(getWindowsVolumeScript("get"));
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
  } catch {
    return null;
  }
}

async function setSystemOutputVolume(volume: number) {
  if (process.platform !== "win32") {
    return false;
  }

  try {
    await runPowerShell(getWindowsVolumeScript("set"), {
      WHISPARR_TARGET_VOLUME: String(Math.max(0, Math.min(100, Math.round(volume))))
    });
    return true;
  } catch {
    return false;
  }
}

async function duckVolumeForDictationIfNeeded() {
  if (!currentSettings.lowerVolumeOnTranscription || volumeDuckSession || process.platform !== "win32") {
    return;
  }

  const originalVolume = await getSystemOutputVolume();
  if (originalVolume === null) {
    return;
  }

  const loweredVolume = Math.max(
    0,
    Math.min(100, Math.round(currentSettings.transcriptionReducedVolume))
  );

  if (await setSystemOutputVolume(loweredVolume)) {
    volumeDuckSession = {
      originalVolume,
      loweredVolume
    };
  }
}

async function restoreVolumeAfterDictationIfNeeded() {
  if (!volumeDuckSession || process.platform !== "win32") {
    return;
  }

  const session = volumeDuckSession;
  volumeDuckSession = null;
  const currentVolume = await getSystemOutputVolume();

  if (currentVolume !== null && currentVolume !== session.loweredVolume) {
    return;
  }

  await setSystemOutputVolume(session.originalVolume);
}

function runPowerShell(script: string, envOverrides: Record<string, string> = {}) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        env: {
          ...process.env,
          ...envOverrides
        }
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout.trim());
      }
    );
  });
}

async function writeClipboardText(text: string, options?: { allowHistory?: boolean }) {
  const allowHistory = options?.allowHistory ?? true;

  if (process.platform !== "win32") {
    clipboard.writeText(text);
    return;
  }

  try {
    await runPowerShell(
      `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.ApplicationModel.DataTransfer.Clipboard, Windows.ApplicationModel.DataTransfer, ContentType=WindowsRuntime]
$text = $env:WHISPARR_CLIPBOARD_TEXT
$allowHistory = $env:WHISPARR_ALLOW_CLIPBOARD_HISTORY -eq "1"
$package = New-Object Windows.ApplicationModel.DataTransfer.DataPackage
$package.SetText($text)
$options = New-Object Windows.ApplicationModel.DataTransfer.ClipboardContentOptions
$options.IsAllowedInHistory = $allowHistory
[Windows.ApplicationModel.DataTransfer.Clipboard]::SetContentWithOptions($package, $options)
[Windows.ApplicationModel.DataTransfer.Clipboard]::Flush()
`,
      {
        WHISPARR_CLIPBOARD_TEXT: text,
        WHISPARR_ALLOW_CLIPBOARD_HISTORY: allowHistory ? "1" : "0"
      }
    );
  } catch {
    clipboard.writeText(text);
  }
}

async function capturePasteTargetContext() {
  if (process.platform !== "win32") {
    pendingPasteTargetContext = null;
    return;
  }

  try {
    const windowHandle = await getForegroundWindowHandle();
    pendingPasteTargetContext = windowHandle ? { windowHandle } : null;
  } catch {
    pendingPasteTargetContext = null;
  }
}

async function getForegroundWindowHandle() {
  if (process.platform !== "win32") {
    return null;
  }

  const windowHandle = await runPowerShell(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WhispARRForegroundWindow {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
}
"@
$handle = [WhispARRForegroundWindow]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) {
  ""
} else {
  $handle.ToInt64().ToString()
}
`);

  return windowHandle || null;
}

async function canAutoPasteToCapturedTarget() {
  if (!pendingPasteTargetContext) {
    return process.platform !== "win32";
  }

  if (process.platform !== "win32") {
    return true;
  }

  try {
    const activeWindowHandle = await getForegroundWindowHandle();
    return activeWindowHandle === pendingPasteTargetContext.windowHandle;
  } catch {
    return false;
  }
}

function createWindow() {
  if (mainWindow) {
    return mainWindow;
  }

  const windowsChromeOptions =
    process.platform === "win32"
      ? {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: {
            color: getWindowOverlayColor(currentSettings.appTheme, currentSettings.customTheme),
            symbolColor: "#effcf7",
            height: 32
          }
        }
      : {};

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#08131a",
    title: "WhispARR",
    icon: createZoomedIcon(1.7, 256),
    autoHideMenuBar: true,
    ...windowsChromeOptions,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideMainWindowToTray();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev) {
    void mainWindow.loadURL("http://localhost:5173");
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  return mainWindow;
}

function syncWindowTheme(settings: AppSettings) {
  if (process.platform !== "win32" || !mainWindow) {
    return;
  }

  mainWindow.setTitleBarOverlay({
    color: getWindowOverlayColor(settings.appTheme, settings.customTheme),
    symbolColor: "#effcf7",
    height: 32
  });
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show WhispARR",
        click: () => showMainWindow()
      },
      {
        label: "Settings",
        click: () => showMainWindowSettings()
      },
      {
        label: "Restart Engine",
        click: () => {
          sendToMainWindow("tray:restart-engine");
        }
      },
      {
        label: "Always Show Pill",
        type: "checkbox",
        checked: currentSettings.alwaysShowPill,
        click: () => {
          applySettingsPatch({ alwaysShowPill: !currentSettings.alwaysShowPill });
        }
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function applySettingsPatch(patch: Partial<AppSettings>) {
  const next = updateSettings(patch);
  currentSettings = next;
  syncActivationGlobalShortcut();
  updateLaunchOnLogin(next);
  syncWindowTheme(next);
  updateHud({
    visible: currentHudState.visible || pushToTalkActive || next.alwaysShowPill,
    level: 0,
    label: pushToTalkActive ? "Listening" : "Ready",
    soundEnabled: !next.muteDictationSounds,
    soundVolume: Math.max(0, Math.min(1, next.appSoundVolume / 100)),
    hudScale: next.hudScale,
    moveMode: isHudMoveMode
  });
  refreshTrayMenu();
  broadcastSettingsChanged(next);
  return next;
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("WhispARR");
  refreshTrayMenu();
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow());
}

function isModifierPressed(modifier: ShortcutModifier) {
  return MODIFIER_KEY_CODES[modifier].some((keycode) => pressedKeys.has(keycode));
}

function doesShortcutMatch(shortcut: ActivationShortcut, triggerKeycode: number) {
  if (shortcut.modifiers.length === 0 && !shortcut.key) {
    return false;
  }

  const modifiersReady = shortcut.modifiers.every((modifier) => isModifierPressed(modifier));
  if (!modifiersReady) {
    return false;
  }

  if (!shortcut.key) {
    return shortcut.modifiers.some((modifier) =>
      MODIFIER_KEY_CODES[modifier].includes(triggerKeycode)
    );
  }

  return (NON_MODIFIER_KEY_CODES[shortcut.key] ?? []).includes(triggerKeycode);
}

function isKeyPartOfShortcut(shortcut: ActivationShortcut, keycode: number) {
  if (shortcut.modifiers.some((modifier) => MODIFIER_KEY_CODES[modifier].includes(keycode))) {
    return true;
  }

  return shortcut.key ? (NON_MODIFIER_KEY_CODES[shortcut.key] ?? []).includes(keycode) : false;
}

function shortcutKeyToAccelerator(key: string | null) {
  if (!key) {
    return null;
  }

  if (/^Key[A-Z]$/.test(key)) {
    return key.slice(3);
  }

  if (/^Digit[0-9]$/.test(key)) {
    return key.slice(5);
  }

  return key;
}

function shortcutToAccelerator(shortcut: ActivationShortcut) {
  const key = shortcutKeyToAccelerator(shortcut.key);
  if (!key) {
    return null;
  }

  const modifiers = shortcut.modifiers.map((modifier) => {
    switch (modifier) {
      case "ctrl":
        return "Control";
      case "alt":
        return "Alt";
      case "shift":
        return "Shift";
      case "meta":
        return process.platform === "darwin" ? "Command" : "Super";
      default:
        return null;
    }
  }).filter((value) => value !== null);

  return [...modifiers, key].join("+");
}

function syncActivationGlobalShortcut() {
  if (registeredActivationAccelerator) {
    globalShortcut.unregister(registeredActivationAccelerator);
    registeredActivationAccelerator = null;
  }

  const accelerator = shortcutToAccelerator(currentSettings.activationShortcut);
  if (!accelerator) {
    return;
  }

  const registered = globalShortcut.register(accelerator, () => {
    beginPushToTalkSession();
  });

  if (registered) {
    registeredActivationAccelerator = accelerator;
  }
}

function registerGlobalPushToTalk() {
  uIOhook.on("keydown", (event) => {
    pressedKeys.add(event.keycode);

    if (!pushToTalkActive && !hudPressToTalkActive && isHudDragHotkeyPressed()) {
      startHudMoveModeFromHotkey();
    }

    const isManualManagedPaste =
      managedClipboardSession?.mode === "manual" &&
      event.keycode === UiohookKey.V &&
      pressedKeys.has(getPasteModifier());
    if (isManualManagedPaste) {
      const stagedText = managedClipboardSession?.stagedText;
      setTimeout(() => {
        restoreManagedClipboardIfNeeded(stagedText);
      }, 250);
    }

    if (registeredActivationAccelerator) {
      return;
    }

    if (pushToTalkActive || isHudMoveMode || !doesShortcutMatch(currentSettings.activationShortcut, event.keycode)) {
      return;
    }

    beginPushToTalkSession();
  });

  uIOhook.on("keyup", (event) => {
    const shouldStop =
      pushToTalkActive && isKeyPartOfShortcut(currentSettings.activationShortcut, event.keycode);

    pressedKeys.delete(event.keycode);

    if (hudMoveModeSource === "hotkey" && !isHudDragHotkeyPressed()) {
      stopHudMoveModeFromHotkey();
    }

    if (!shouldStop) {
      return;
    }

    endPushToTalkSession();
  });

  syncActivationGlobalShortcut();
  uIOhook.start();
}

function getPasteModifier() {
  return process.platform === "darwin" ? UiohookKey.Meta : UiohookKey.Ctrl;
}

function isHudDragHotkeyPressed() {
  return (
    currentSettings.enableHudDragHotkey &&
    currentSettings.alwaysShowPill &&
    isModifierPressed("ctrl") &&
    isModifierPressed("alt")
  );
}

function clearManagedClipboardSession() {
  if (managedClipboardSession?.cleanupTimeout) {
    clearTimeout(managedClipboardSession.cleanupTimeout);
  }
  managedClipboardSession = null;
}

function shouldPersistClipboardEntry() {
  return currentSettings.saveDictationToClipboardHistory;
}

function restoreManagedClipboardIfNeeded(expectedText?: string) {
  if (!managedClipboardSession) {
    return false;
  }

  const currentClipboardText = clipboard.readText();
  if (expectedText && currentClipboardText !== expectedText) {
    clearManagedClipboardSession();
    return false;
  }

  if (!expectedText && currentClipboardText !== managedClipboardSession.stagedText) {
    clearManagedClipboardSession();
    return false;
  }

  if (managedClipboardSession.originalHadText) {
    void writeClipboardText(managedClipboardSession.originalText, { allowHistory: false });
  } else {
    clipboard.clear();
  }
  clearManagedClipboardSession();
  return true;
}

async function stageClipboardText(text: string, mode: "auto" | "manual") {
  clearManagedClipboardSession();

  if (shouldPersistClipboardEntry()) {
    await writeClipboardText(text, { allowHistory: true });
    return;
  }

  const originalText = clipboard.readText();
  managedClipboardSession = {
    originalText,
    originalHadText: originalText.length > 0,
    stagedText: text,
    mode,
    cleanupTimeout: null
  };
  await writeClipboardText(text, {
    allowHistory: currentSettings.saveDictationToClipboardHistory
  });
}

async function pasteText(text: string): Promise<PasteTextResult> {
  const canAutoPaste = await canAutoPasteToCapturedTarget();
  pendingPasteTargetContext = null;
  if (!canAutoPaste) {
    await prepareClipboardForSinglePaste(text);
    return {
      autoPasted: false,
      manualPasteReady: true
    };
  }

  await stageClipboardText(text, "auto");
  await new Promise((resolve) => setTimeout(resolve, 20));
  uIOhook.keyTap(UiohookKey.V, [getPasteModifier()]);
  if (managedClipboardSession && !shouldPersistClipboardEntry()) {
    managedClipboardSession.cleanupTimeout = setTimeout(() => {
      restoreManagedClipboardIfNeeded(text);
    }, 250);
  }
  return {
    autoPasted: true,
    manualPasteReady: false
  };
}

async function prepareClipboardForSinglePaste(text: string) {
  await stageClipboardText(text, "manual");

  if (managedClipboardSession && !shouldPersistClipboardEntry()) {
    managedClipboardSession.cleanupTimeout = setTimeout(() => {
      restoreManagedClipboardIfNeeded(text);
    }, 20000);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on("second-instance", () => {
  showMainWindow();
});

app.whenReady().then(() => {
  currentSettings = readData().settings;
  subscribeToAppUpdateState((state) => {
    broadcastAppUpdateState(state);
  });
  const runtime = discoverRuntime();
  if ((!currentSettings.whisperBinaryPath || !currentSettings.whisperModelPath) && runtime.selected) {
    currentSettings = updateSettings({
      whisperBinaryPath: runtime.selected.binaryPath,
      whisperModelPath: runtime.selected.modelPath
    });
  }
  updateLaunchOnLogin(currentSettings);

  ipcMain.handle("data:load", () => readData());
  ipcMain.handle("settings:update", (_event, patch: Partial<AppSettings>) => {
    return applySettingsPatch(patch);
  });
  ipcMain.handle("voice-profile:save", (_event, input: SaveVoiceProfileInput) => saveVoiceProfile(input));
  ipcMain.handle("voice-profile:delete", (_event, id: string) => deleteVoiceProfile(id));
  ipcMain.handle(
    "dictionary:save",
    (
      _event,
      input: {
        id?: string;
        term: string;
        replacement?: string;
        entryTypeOverride?: "Abbreviation" | "Word" | "Phrase" | "Sentence";
        addedBySystem?: boolean;
      }
    ) => saveManualDictionaryEntry(input)
  );
  ipcMain.handle("dictionary:delete", (_event, id: string) => deleteManualDictionaryEntry(id));
  ipcMain.handle("whisper:status", () => getWhisperConfigStatus(readData().settings));
  ipcMain.handle("runtime:discover", () => {
    const runtimeResult = discoverRuntime();
    if (runtimeResult.selected) {
      currentSettings = updateSettings({
        whisperBinaryPath: runtimeResult.selected.binaryPath,
        whisperModelPath: runtimeResult.selected.modelPath
      });
    }
    return runtimeResult;
  });
  ipcMain.handle("runtime:refresh", () => {
    const runtimeResult = discoverRuntime();
    const nextPatch: Partial<AppSettings> = runtimeResult.selected
      ? {
          whisperBinaryPath: runtimeResult.selected.binaryPath,
          whisperModelPath: runtimeResult.selected.modelPath
        }
      : {
          whisperBinaryPath: currentSettings.whisperBinaryPath,
          whisperModelPath: currentSettings.whisperModelPath
        };

    currentSettings = updateSettings(nextPatch);
    updateHud({
      visible: currentHudState.visible || pushToTalkActive || currentSettings.alwaysShowPill,
      level: 0,
      label: pushToTalkActive ? "Listening" : "Ready",
      soundEnabled: !currentSettings.muteDictationSounds,
      soundVolume: Math.max(0, Math.min(1, currentSettings.appSoundVolume / 100)),
      hudScale: currentSettings.hudScale,
      moveMode: isHudMoveMode
    });
    return runtimeResult;
  });
  ipcMain.handle("runtime:install", async () => {
    const installResult = await installRuntime();
    if (installResult.discovery.selected) {
      currentSettings = updateSettings({
        whisperBinaryPath: installResult.discovery.selected.binaryPath,
        whisperModelPath: installResult.discovery.selected.modelPath
      });
    }
    return installResult;
  });
  ipcMain.handle("app:update:check", async (_event, options?: { silent?: boolean }) => {
    return checkForAppUpdates(options);
  });
  ipcMain.handle("app:update:download-and-install", async () => {
    const result = await downloadAppUpdate();
    return result.message;
  });
  ipcMain.handle("app:update:skip-version", (_event, version: string | null) => {
    return setSkippedAppUpdateVersion(version);
  });
  ipcMain.handle("patch-notes:set-pending", (_event, patchNotes: PatchNotesRecord | null) => {
    return setPendingPatchNotes(patchNotes);
  });
  ipcMain.handle("patch-notes:clear-pending", () => {
    return clearPendingPatchNotes();
  });
  ipcMain.handle("patch-notes:skip-version", (_event, version: string | null) => {
    return setSkippedPatchNotesVersion(version);
  });
  ipcMain.handle("patch-notes:set-never-show", (_event, value: boolean) => {
    return setNeverShowPatchNotes(value);
  });
  ipcMain.handle("dictation:transcribe", async (_event, sample: TrainingSample) => {
    const data = readData();
    return transcribeLocally({
      ...sample,
      settings: data.settings,
      manualDictionary: data.manualDictionary
    });
  });
  ipcMain.handle("stats:track-transcript", (_event, transcript: string) => {
    return updateStatsFromTranscript(transcript);
  });
  ipcMain.handle("achievements:sync", (_event, unlocked: AchievementUnlockInput[]) => {
    return syncAchievementUnlocks(unlocked);
  });
  ipcMain.handle("history:save", (_event, history: string[], limit: number) => {
    return saveTranscriptHistory(history, limit);
  });
  ipcMain.handle("notes:save", (_event, notes: string) => {
    return saveNotes(notes);
  });
  ipcMain.handle("notes:saved-list:save", (_event, savedNotes: string[]) => {
    return saveSavedNotes(savedNotes);
  });
  ipcMain.handle("dialog:pick-file", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("paste:text", async (_event, text: string) => {
    return pasteText(text);
  });
  ipcMain.handle("clipboard:prepare-single-paste", async (_event, text: string) => {
    await prepareClipboardForSinglePaste(text);
    return true;
  });
  ipcMain.handle("hud:update", (_event, state: HudState) => {
    updateHud(state);
    return true;
  });
  ipcMain.handle("hud:move:start", () => {
    startHudMoveMode();
    return true;
  });
  ipcMain.handle("hud:move:stop", () => {
    return stopHudMoveMode();
  });
  ipcMain.handle("hud:press-to-talk:start", () => {
    return beginHudPressToTalk();
  });
  ipcMain.handle("hud:press-to-talk:stop", () => {
    return endHudPressToTalk();
  });
  ipcMain.handle("app:show-window", () => {
    showMainWindow();
    return true;
  });
  ipcMain.handle("app:diagnostics", () => {
    return getAppDiagnostics();
  });
  ipcMain.handle("app:open-external", async (_event, url: string) => {
    await shell.openExternal(url);
    return true;
  });

  createWindow();
  createHudWindow();
  createTray();
  registerGlobalPushToTalk();

  app.on("activate", () => {
    showMainWindow();
  });
  screen.on("display-metrics-changed", () => {
    positionHudWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  if (volumeDuckSession) {
    void setSystemOutputVolume(volumeDuckSession.originalVolume);
    volumeDuckSession = null;
  }
  pressedKeys.clear();
  globalShortcut.unregisterAll();
  uIOhook.stop();
});

app.on("window-all-closed", () => {});
