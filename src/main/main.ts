import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  screen
} from "electron";
import path from "node:path";
import { uIOhook, UiohookKey, UiohookKeyboardEvent } from "uiohook-napi";
import {
  deleteManualDictionaryEntry,
  deleteVoiceProfile,
  readData,
  saveManualDictionaryEntry,
  saveVoiceProfile,
  saveTranscriptHistory,
  updateSettings,
  updateStatsFromTranscript
} from "./storage";
import { discoverRuntime, installRuntime } from "./runtime";
import { getWhisperConfigStatus, transcribeLocally } from "./whisper";
import {
  ActivationShortcut,
  AppSettings,
  HudState,
  SaveVoiceProfileInput,
  ShortcutModifier,
  TrainingSample
} from "../shared/types";

const isDev = !app.isPackaged;

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
let currentSettings = readData().settings;
const pressedKeys = new Set<number>();

function getAppIconPath() {
  return isDev
    ? path.join(app.getAppPath(), "assets", "WhispARR Image.png")
    : path.join(process.resourcesPath, "assets", "WhispARR Image.png");
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

function positionHudWindow() {
  if (!hudWindow) {
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { width, height, x, y } = display.workArea;
  const hudWidth = 168;
  const hudHeight = 76;
  hudWindow.setBounds({
    width: hudWidth,
    height: hudHeight,
    x: x + Math.round((width - hudWidth) / 2),
    y: y + height - hudHeight - 6
  });
}

function createHudWindow() {
  if (hudWindow) {
    return hudWindow;
  }

  hudWindow = new BrowserWindow({
    width: 168,
    height: 76,
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

function updateHud(state: HudState) {
  if (!hudWindow) {
    createHudWindow();
  }

  if (!hudWindow) {
    return;
  }

  positionHudWindow();
  hudWindow.webContents.send("hud:state", state);

  if (state.visible) {
    hudWindow.showInactive();
  } else {
    hudWindow.hide();
  }
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

function createWindow() {
  if (mainWindow) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#08131a",
    title: "WhispARR",
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

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
    updateHud({ visible: true, level: 0, label: "Listening" });
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
    updateHud({ visible: false, level: 0, label: "Listening" });
    sendPushToTalkEvent("stop");
  });

  uIOhook.start();
}

function getPasteModifier() {
  return process.platform === "darwin" ? UiohookKey.Meta : UiohookKey.Ctrl;
}

async function pasteText(text: string) {
  clipboard.writeText(text);
  await new Promise((resolve) => setTimeout(resolve, 80));
  uIOhook.keyTap(UiohookKey.V, [getPasteModifier()]);
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
    updateLaunchOnLogin(next);
    return next;
  });
  ipcMain.handle("voice-profile:save", (_event, input: SaveVoiceProfileInput) => saveVoiceProfile(input));
  ipcMain.handle("voice-profile:delete", (_event, id: string) => deleteVoiceProfile(id));
  ipcMain.handle("dictionary:save", (_event, input: { id?: string; spoken: string; replacement: string }) =>
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
  ipcMain.handle("history:save", (_event, history: string[], limit: number) => {
    return saveTranscriptHistory(history, limit);
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
  ipcMain.handle("app:show-window", () => {
    showMainWindow();
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
  pressedKeys.clear();
  uIOhook.stop();
});

app.on("window-all-closed", () => {});
