import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  Notification,
  Tray,
  nativeImage,
  screen,
  shell
} from "electron";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { uIOhook, UiohookKey, UiohookKeyboardEvent } from "uiohook-napi";
import {
  deleteManualDictionaryEntry,
  deleteVoiceProfile,
  readData,
  saveManualDictionaryEntry,
  saveNotes,
  saveSavedNotes,
  saveVoiceProfile,
  saveTranscriptHistory,
  syncAchievementUnlocks,
  updateSettings,
  updateStatsFromTranscript
} from "./storage";
import { discoverRuntime, installRuntime } from "./runtime";
import { getWhisperConfigStatus, transcribeLocally } from "./whisper";
import { checkForAppUpdates, downloadAppUpdate } from "./updates";
import {
  AchievementUnlockInput,
  ActivationShortcut,
  AppThemeName,
  AppSettings,
  CustomThemeColors,
  HudState,
  AppDiagnostics,
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
const pressedKeys = new Set<number>();
let clipboardLearningInterval: NodeJS.Timeout | null = null;
let clipboardLearningDeadline: NodeJS.Timeout | null = null;
let lastObservedClipboardText = "";
const HUD_BASE_WIDTH = 110;
const HUD_BASE_HEIGHT = 44;
const HUD_MARGIN = 6;

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
    ? path.join(app.getAppPath(), "assets", "WhispARR Image.png")
    : path.join(process.resourcesPath, "assets", "WhispARR Image.png");
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
  return nativeImage
    .createFromPath(getAppIconPath())
    .resize({ width: 20, height: 20 });
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
  }

  mainWindow?.setSkipTaskbar(false);
  mainWindow?.show();
  mainWindow?.focus();
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

  hudWindow.setIgnoreMouseEvents(!isHudMoveMode);
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
  syncHudWindowInteractivity();
  positionHudWindow();
  hudWindow.webContents.send("hud:state", currentHudState);

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
  updateHud(currentHudState);
  return currentSettings;
}

function sendPushToTalkEvent(state: "start" | "stop") {
  if (!mainWindow) {
    createWindow();
  }

  mainWindow?.webContents.send("ptt:event", state);
}

function updateLaunchOnLogin(settings: AppSettings) {
  app.setLoginItemSettings({
    openAtLogin: settings.launchOnLogin
  });
}

function clearClipboardLearningWatch() {
  if (clipboardLearningInterval) {
    clearInterval(clipboardLearningInterval);
    clipboardLearningInterval = null;
  }

  if (clipboardLearningDeadline) {
    clearTimeout(clipboardLearningDeadline);
    clipboardLearningDeadline = null;
  }

  lastObservedClipboardText = "";
}

function normalizeWordForLearning(word: string) {
  return word.toLowerCase().replace(/[^a-z0-9'-]+/g, "");
}

function levenshteinDistance(left: string, right: string) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    dp[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    dp[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      dp[row][col] = Math.min(
        dp[row - 1][col] + 1,
        dp[row][col - 1] + 1,
        dp[row - 1][col - 1] + cost
      );
    }
  }

  return dp[left.length][right.length];
}

function shouldLearnCorrectedWord(originalWord: string, correctedWord: string) {
  const normalizedOriginal = normalizeWordForLearning(originalWord);
  const normalizedCorrected = normalizeWordForLearning(correctedWord);

  if (
    !normalizedOriginal ||
    !normalizedCorrected ||
    normalizedOriginal === normalizedCorrected ||
    normalizedCorrected.length < 3
  ) {
    return false;
  }

  const distance = levenshteinDistance(normalizedOriginal, normalizedCorrected);
  const maxLength = Math.max(normalizedOriginal.length, normalizedCorrected.length);
  const allowedDistance = Math.max(1, Math.min(3, Math.floor(maxLength * 0.34)));
  const sameFirstLetter = normalizedOriginal[0] === normalizedCorrected[0];
  const similarLength = Math.abs(normalizedOriginal.length - normalizedCorrected.length) <= 3;

  return distance <= allowedDistance && (sameFirstLetter || distance <= 1) && similarLength;
}

function getLearnableWords(originalTranscript: string, correctedTranscript: string) {
  const originalWords = originalTranscript.match(/[A-Za-z0-9'-]+/g) ?? [];
  const correctedWords = correctedTranscript.match(/[A-Za-z0-9'-]+/g) ?? [];

  if (originalWords.length === 0 || correctedWords.length === 0) {
    return [];
  }

  const learnableTerms = new Set<string>();
  const comparisons = correctedWords.length;

  for (let index = 0; index < comparisons; index += 1) {
    const correctedWord = correctedWords[index] ?? "";
    let bestOriginalWord = "";
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let offset = -2; offset <= 2; offset += 1) {
      const originalWord = originalWords[index + offset] ?? "";
      const normalizedOriginal = normalizeWordForLearning(originalWord);
      const normalizedCorrected = normalizeWordForLearning(correctedWord);
      if (!normalizedOriginal || !normalizedCorrected) {
        continue;
      }

      const distance = levenshteinDistance(normalizedOriginal, normalizedCorrected);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestOriginalWord = originalWord;
      }
    }

    if (bestOriginalWord && shouldLearnCorrectedWord(bestOriginalWord, correctedWord)) {
      learnableTerms.add(correctedWord);
    }
  }

  return [...learnableTerms];
}

function maybeLearnDictionaryFromClipboard(sourceTranscript: string, correctedClipboardText: string) {
  const learnableTerms = getLearnableWords(sourceTranscript, correctedClipboardText);
  if (learnableTerms.length === 0) {
    return [];
  }

  const data = readData();
  const knownTerms = new Set(data.manualDictionary.map((entry) => entry.term.toLowerCase()));
  const savedTerms: string[] = [];

  for (const term of learnableTerms) {
    if (knownTerms.has(term.toLowerCase())) {
      continue;
    }

    saveManualDictionaryEntry({ term, addedBySystem: true });
    knownTerms.add(term.toLowerCase());
    savedTerms.push(term);
  }

  return savedTerms;
}

function startClipboardLearningWatch(sourceTranscript: string) {
  clearClipboardLearningWatch();

  if (!currentSettings.autoLearnDictionary || !sourceTranscript.trim()) {
    return;
  }

  lastObservedClipboardText = clipboard.readText();

  clipboardLearningInterval = setInterval(() => {
    const nextClipboardText = clipboard.readText();
    if (!nextClipboardText || nextClipboardText === lastObservedClipboardText) {
      return;
    }

    lastObservedClipboardText = nextClipboardText;

    if (nextClipboardText.trim() === sourceTranscript.trim()) {
      return;
    }

    const savedTerms = maybeLearnDictionaryFromClipboard(sourceTranscript, nextClipboardText);
    if (savedTerms.length > 0) {
      mainWindow?.webContents.send("dictionary:auto-learned", savedTerms);
      if (Notification.isSupported()) {
        const body = savedTerms.length === 1
          ? `Added "${savedTerms[0]}" to your dictionary.`
          : `Added ${savedTerms.length} corrected terms to your dictionary.`;
        new Notification({
          title: "WhispARR Dictionary Updated",
          body,
          icon: getAppIconPath(),
          silent: false
        }).show();
      }
    }
    clearClipboardLearningWatch();
  }, 1000);

  clipboardLearningDeadline = setTimeout(() => {
    clearClipboardLearningWatch();
  }, 45000);
}

function pauseActiveMediaSessions() {
  if (process.platform !== "win32") {
    return;
  }

  const script = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
[void][System.WindowsRuntimeSystemExtensions, System.Runtime.WindowsRuntime, ContentType=WindowsRuntime]
function Await($operation) {
  return [System.WindowsRuntimeSystemExtensions]::AsTask($operation).GetAwaiter().GetResult()
}
$manager = Await([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync())
foreach ($session in $manager.GetSessions()) {
  try {
    $appId = ""
    try {
      $appId = [string]$session.SourceAppUserModelId
    } catch {
      $appId = ""
    }
    if ($appId -match "discord") {
      continue
    }

    $playbackInfo = $session.GetPlaybackInfo()
    if (
      $playbackInfo -and
      $playbackInfo.PlaybackStatus -eq
        [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing
    ) {
      $controls = $playbackInfo.Controls
      if ($controls -and $controls.IsPauseEnabled) {
        [void](Await($session.TryPauseAsync()))
      }
    }
  } catch {
  }
}
`;

  execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    () => {}
  );
}

function pauseMediaForDictationIfNeeded() {
  if (!currentSettings.muteMusicWhileDictating) {
    return;
  }

  pauseActiveMediaSessions();
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
    icon: getAppIconPath(),
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

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("WhispARR");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open WhispARR",
        click: () => showMainWindow()
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

function registerGlobalPushToTalk() {
  uIOhook.on("keydown", (event) => {
    pressedKeys.add(event.keycode);

    if (pushToTalkActive || !doesShortcutMatch(currentSettings.activationShortcut, event.keycode)) {
      return;
    }

    pushToTalkActive = true;
    pauseMediaForDictationIfNeeded();
    updateHud({
      visible: true,
      level: 0,
      label: "Listening",
      soundEnabled: !currentSettings.muteDictationSounds,
      soundVolume: Math.max(0, Math.min(1, currentSettings.appSoundVolume / 100)),
      hudScale: currentSettings.hudScale
    });
    sendPushToTalkEvent("start");
  });

  uIOhook.on("keyup", (event) => {
    const shouldStop =
      pushToTalkActive && isKeyPartOfShortcut(currentSettings.activationShortcut, event.keycode);

    pressedKeys.delete(event.keycode);

    if (!shouldStop) {
      return;
    }

    pushToTalkActive = false;
    updateHud({
      visible: false,
      level: 0,
      label: "Listening",
      soundEnabled: !currentSettings.muteDictationSounds,
      soundVolume: Math.max(0, Math.min(1, currentSettings.appSoundVolume / 100)),
      hudScale: currentSettings.hudScale
    });
    sendPushToTalkEvent("stop");
  });

  uIOhook.start();
}

function getPasteModifier() {
  return process.platform === "darwin" ? UiohookKey.Meta : UiohookKey.Ctrl;
}

async function pasteText(text: string) {
  clipboard.writeText(text);
  await new Promise((resolve) => setTimeout(resolve, 20));
  uIOhook.keyTap(UiohookKey.V, [getPasteModifier()]);
  startClipboardLearningWatch(text);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on("second-instance", () => {
  showMainWindow();
});

app.whenReady().then(() => {
  currentSettings = readData().settings;
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
    const next = updateSettings(patch);
    currentSettings = next;
    if (!next.autoLearnDictionary) {
      clearClipboardLearningWatch();
    }
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
    return next;
  });
  ipcMain.handle("voice-profile:save", (_event, input: SaveVoiceProfileInput) => saveVoiceProfile(input));
  ipcMain.handle("voice-profile:delete", (_event, id: string) => deleteVoiceProfile(id));
  ipcMain.handle("dictionary:save", (_event, input: { id?: string; term: string; addedBySystem?: boolean }) =>
    saveManualDictionaryEntry(input)
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
  ipcMain.handle("app:update:check", async () => {
    return checkForAppUpdates();
  });
  ipcMain.handle("app:update:download-and-install", async () => {
    const result = await downloadAppUpdate();
    if (!result.filePath) {
      return result.message;
    }

    if (process.platform === "win32") {
      const installer = spawn(result.filePath, [], {
        detached: true,
        stdio: "ignore",
        windowsHide: false
      });
      installer.unref();
      app.quit();
      return "Update installer launched.";
    }

    await shell.openPath(result.filePath);
    return `Downloaded update to ${result.filePath}. Open the installer to continue.`;
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
    await pasteText(text);
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
  ipcMain.handle("app:show-window", () => {
    showMainWindow();
    return true;
  });
  ipcMain.handle("app:diagnostics", () => {
    return getAppDiagnostics();
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
  clearClipboardLearningWatch();
  pressedKeys.clear();
  uIOhook.stop();
});

app.on("window-all-closed", () => {});
