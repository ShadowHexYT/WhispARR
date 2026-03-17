import { useEffect, useMemo, useRef, useState } from "react";
import { computeVoiceEmbedding, hasAudibleSpeech, scoreVoiceMatch } from "./lib/audio";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import {
  ActivationShortcut,
  AppSettings,
  AppThemeName,
  CustomThemeColors,
  DictationResult,
  ManualDictionaryEntry,
  RuntimeDiscoveryResult,
  RuntimeInstallResult,
  ShortcutModifier,
  UserStats,
  VoiceProfile,
  WhisperConfigStatus
} from "../shared/types";

type TabKey = "dictation" | "profiles" | "stats" | "settings" | "help";
type MicDevice = { deviceId: string; label: string };
const levelUpSoundUrl = new URL("../../assets/lvl_up.mp3", import.meta.url).href;
const appIconUrl = new URL("../../assets/WhispARR Image.png", import.meta.url).href;

const defaultShortcut: ActivationShortcut = {
  modifiers: ["meta", "ctrl"],
  key: null
};

const defaultSettings: AppSettings = {
  selectedMicId: null,
  whisperBinaryPath: "",
  whisperModelPath: "",
  transcriptHistoryLimit: 3,
  autoVerifySpeaker: false,
  activeProfileId: null,
  autoPaste: true,
  launchOnLogin: false,
  activationShortcut: defaultShortcut,
  appTheme: "aurora",
  customTheme: {
    primary: "#5ef0ba",
    secondary: "#54d8ff",
    tertiary: "#ff77c8"
  }
};

type ThemeDefinition = {
  id: AppThemeName;
  name: string;
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  danger: string;
  panel: string;
  line: string;
  bodyBackground: string;
  appShellBackground: string;
  sidebarBackground: string;
  heroBackground: string;
  statusBackground: string;
  buttonTop: string;
  buttonBottom: string;
  buttonBorder: string;
  progressTrack: string;
};

const themes: ThemeDefinition[] = [
  {
    id: "aurora",
    name: "Aurora",
    accent: "#5ef0ba",
    accentSoft: "#8bf3ce",
    text: "#effcf7",
    muted: "#9fc4bc",
    danger: "#ff8e76",
    panel: "rgba(9, 27, 36, 0.88)",
    line: "rgba(143, 205, 187, 0.18)",
    bodyBackground:
      "radial-gradient(circle at top left, rgba(94, 240, 186, 0.14), transparent 30%), radial-gradient(circle at bottom right, rgba(33, 125, 160, 0.2), transparent 28%), linear-gradient(135deg, #050b0f, #0a1820 42%, #07131a)",
    appShellBackground:
      "radial-gradient(circle at top left, rgba(94, 240, 186, 0.08), transparent 24%), linear-gradient(180deg, rgba(6, 16, 22, 0.9), rgba(6, 16, 22, 0.18) 72px, transparent 120px)",
    sidebarBackground:
      "linear-gradient(180deg, rgba(4, 12, 16, 0.78), rgba(4, 12, 16, 0.64))",
    heroBackground:
      "linear-gradient(135deg, rgba(16, 38, 50, 0.95), rgba(5, 17, 23, 0.92))",
    statusBackground: "rgba(255, 255, 255, 0.04)",
    buttonTop: "rgba(255, 255, 255, 0.045)",
    buttonBottom: "rgba(255, 255, 255, 0.03)",
    buttonBorder: "rgba(255, 255, 255, 0.05)",
    progressTrack: "rgba(255, 255, 255, 0.08)"
  },
  {
    id: "ember",
    name: "Ember",
    accent: "#ff8a5b",
    accentSoft: "#ffb37d",
    text: "#fff5ee",
    muted: "#e0b8a6",
    danger: "#ff6a76",
    panel: "rgba(41, 18, 13, 0.86)",
    line: "rgba(255, 148, 104, 0.18)",
    bodyBackground:
      "radial-gradient(circle at top left, rgba(255, 138, 91, 0.2), transparent 30%), radial-gradient(circle at bottom right, rgba(255, 83, 83, 0.16), transparent 28%), linear-gradient(135deg, #120807, #24110d 40%, #1a0d0b)",
    appShellBackground:
      "radial-gradient(circle at top left, rgba(255, 138, 91, 0.1), transparent 24%), linear-gradient(180deg, rgba(25, 12, 10, 0.92), rgba(25, 12, 10, 0.22) 72px, transparent 120px)",
    sidebarBackground:
      "linear-gradient(180deg, rgba(24, 10, 8, 0.8), rgba(24, 10, 8, 0.66))",
    heroBackground:
      "linear-gradient(135deg, rgba(58, 25, 18, 0.96), rgba(27, 12, 10, 0.92))",
    statusBackground: "rgba(255, 255, 255, 0.035)",
    buttonTop: "rgba(255, 218, 203, 0.065)",
    buttonBottom: "rgba(255, 218, 203, 0.03)",
    buttonBorder: "rgba(255, 173, 136, 0.08)",
    progressTrack: "rgba(255, 227, 215, 0.09)"
  },
  {
    id: "ocean",
    name: "Ocean",
    accent: "#54d8ff",
    accentSoft: "#91ebff",
    text: "#eefcff",
    muted: "#9fc6d4",
    danger: "#ff8f8f",
    panel: "rgba(8, 29, 40, 0.88)",
    line: "rgba(116, 205, 235, 0.18)",
    bodyBackground:
      "radial-gradient(circle at top left, rgba(84, 216, 255, 0.16), transparent 30%), radial-gradient(circle at bottom right, rgba(43, 111, 255, 0.18), transparent 28%), linear-gradient(135deg, #041017, #082230 42%, #071824)",
    appShellBackground:
      "radial-gradient(circle at top left, rgba(84, 216, 255, 0.1), transparent 24%), linear-gradient(180deg, rgba(5, 18, 27, 0.92), rgba(5, 18, 27, 0.18) 72px, transparent 120px)",
    sidebarBackground:
      "linear-gradient(180deg, rgba(4, 14, 21, 0.8), rgba(4, 14, 21, 0.66))",
    heroBackground:
      "linear-gradient(135deg, rgba(13, 40, 56, 0.95), rgba(5, 18, 27, 0.92))",
    statusBackground: "rgba(255, 255, 255, 0.035)",
    buttonTop: "rgba(231, 248, 255, 0.055)",
    buttonBottom: "rgba(231, 248, 255, 0.03)",
    buttonBorder: "rgba(116, 205, 235, 0.08)",
    progressTrack: "rgba(232, 249, 255, 0.08)"
  },
  {
    id: "rose",
    name: "Rose",
    accent: "#ff77c8",
    accentSoft: "#ff9bdd",
    text: "#fff1f8",
    muted: "#d9afc4",
    danger: "#ff8b8b",
    panel: "rgba(39, 16, 31, 0.88)",
    line: "rgba(255, 148, 206, 0.18)",
    bodyBackground:
      "radial-gradient(circle at top left, rgba(255, 119, 200, 0.16), transparent 30%), radial-gradient(circle at bottom right, rgba(191, 104, 255, 0.14), transparent 28%), linear-gradient(135deg, #10070d, #22101d 42%, #170913)",
    appShellBackground:
      "radial-gradient(circle at top left, rgba(255, 119, 200, 0.1), transparent 24%), linear-gradient(180deg, rgba(25, 11, 21, 0.92), rgba(25, 11, 21, 0.18) 72px, transparent 120px)",
    sidebarBackground:
      "linear-gradient(180deg, rgba(23, 9, 19, 0.8), rgba(23, 9, 19, 0.66))",
    heroBackground:
      "linear-gradient(135deg, rgba(53, 20, 42, 0.95), rgba(24, 10, 20, 0.92))",
    statusBackground: "rgba(255, 255, 255, 0.035)",
    buttonTop: "rgba(255, 239, 247, 0.055)",
    buttonBottom: "rgba(255, 239, 247, 0.03)",
    buttonBorder: "rgba(255, 148, 206, 0.08)",
    progressTrack: "rgba(255, 239, 247, 0.08)"
  },
  {
    id: "sunset",
    name: "Sunset",
    accent: "#ffb04d",
    accentSoft: "#ffd27d",
    text: "#fff7eb",
    muted: "#dbc3a2",
    danger: "#ff8972",
    panel: "rgba(45, 27, 11, 0.87)",
    line: "rgba(255, 191, 113, 0.18)",
    bodyBackground:
      "radial-gradient(circle at top left, rgba(255, 176, 77, 0.18), transparent 30%), radial-gradient(circle at bottom right, rgba(255, 104, 84, 0.16), transparent 28%), linear-gradient(135deg, #120b05, #2a1709 42%, #1a0d06)",
    appShellBackground:
      "radial-gradient(circle at top left, rgba(255, 176, 77, 0.1), transparent 24%), linear-gradient(180deg, rgba(28, 16, 8, 0.92), rgba(28, 16, 8, 0.18) 72px, transparent 120px)",
    sidebarBackground:
      "linear-gradient(180deg, rgba(26, 14, 6, 0.8), rgba(26, 14, 6, 0.66))",
    heroBackground:
      "linear-gradient(135deg, rgba(58, 33, 12, 0.95), rgba(29, 16, 7, 0.92))",
    statusBackground: "rgba(255, 255, 255, 0.035)",
    buttonTop: "rgba(255, 245, 226, 0.055)",
    buttonBottom: "rgba(255, 245, 226, 0.03)",
    buttonBorder: "rgba(255, 191, 113, 0.08)",
    progressTrack: "rgba(255, 244, 226, 0.08)"
  },
  {
    id: "violet",
    name: "Violet",
    accent: "#a77cff",
    accentSoft: "#c4a6ff",
    text: "#f6f1ff",
    muted: "#c0b3de",
    danger: "#ff93aa",
    panel: "rgba(28, 18, 44, 0.88)",
    line: "rgba(178, 148, 255, 0.18)",
    bodyBackground:
      "radial-gradient(circle at top left, rgba(167, 124, 255, 0.18), transparent 30%), radial-gradient(circle at bottom right, rgba(98, 84, 255, 0.16), transparent 28%), linear-gradient(135deg, #0e0918, #1c1230 42%, #140d24)",
    appShellBackground:
      "radial-gradient(circle at top left, rgba(167, 124, 255, 0.1), transparent 24%), linear-gradient(180deg, rgba(19, 12, 34, 0.92), rgba(19, 12, 34, 0.18) 72px, transparent 120px)",
    sidebarBackground:
      "linear-gradient(180deg, rgba(17, 10, 29, 0.8), rgba(17, 10, 29, 0.66))",
    heroBackground:
      "linear-gradient(135deg, rgba(38, 24, 66, 0.95), rgba(18, 10, 33, 0.92))",
    statusBackground: "rgba(255, 255, 255, 0.035)",
    buttonTop: "rgba(244, 239, 255, 0.055)",
    buttonBottom: "rgba(244, 239, 255, 0.03)",
    buttonBorder: "rgba(178, 148, 255, 0.08)",
    progressTrack: "rgba(243, 239, 255, 0.08)"
  },
  {
    id: "forest",
    name: "Forest",
    accent: "#6ee58d",
    accentSoft: "#a0f0b1",
    text: "#effcf1",
    muted: "#aac8af",
    danger: "#ff9a84",
    panel: "rgba(16, 31, 20, 0.88)",
    line: "rgba(143, 220, 159, 0.18)",
    bodyBackground:
      "radial-gradient(circle at top left, rgba(110, 229, 141, 0.16), transparent 30%), radial-gradient(circle at bottom right, rgba(57, 154, 87, 0.16), transparent 28%), linear-gradient(135deg, #071009, #122216 42%, #0b160e)",
    appShellBackground:
      "radial-gradient(circle at top left, rgba(110, 229, 141, 0.1), transparent 24%), linear-gradient(180deg, rgba(11, 20, 13, 0.92), rgba(11, 20, 13, 0.18) 72px, transparent 120px)",
    sidebarBackground:
      "linear-gradient(180deg, rgba(9, 17, 11, 0.8), rgba(9, 17, 11, 0.66))",
    heroBackground:
      "linear-gradient(135deg, rgba(20, 42, 24, 0.95), rgba(9, 18, 12, 0.92))",
    statusBackground: "rgba(255, 255, 255, 0.035)",
    buttonTop: "rgba(240, 255, 241, 0.055)",
    buttonBottom: "rgba(240, 255, 241, 0.03)",
    buttonBorder: "rgba(143, 220, 159, 0.08)",
    progressTrack: "rgba(240, 255, 241, 0.08)"
  },
  {
    id: "gold",
    name: "Gold",
    accent: "#f4cf57",
    accentSoft: "#ffe088",
    text: "#fffbe9",
    muted: "#d9cfaa",
    danger: "#ff8c77",
    panel: "rgba(41, 34, 12, 0.88)",
    line: "rgba(244, 215, 117, 0.18)",
    bodyBackground:
      "radial-gradient(circle at top left, rgba(244, 207, 87, 0.18), transparent 30%), radial-gradient(circle at bottom right, rgba(163, 124, 40, 0.14), transparent 28%), linear-gradient(135deg, #121004, #2a220a 42%, #171205)",
    appShellBackground:
      "radial-gradient(circle at top left, rgba(244, 207, 87, 0.1), transparent 24%), linear-gradient(180deg, rgba(23, 19, 7, 0.92), rgba(23, 19, 7, 0.18) 72px, transparent 120px)",
    sidebarBackground:
      "linear-gradient(180deg, rgba(20, 17, 6, 0.8), rgba(20, 17, 6, 0.66))",
    heroBackground:
      "linear-gradient(135deg, rgba(49, 41, 12, 0.95), rgba(22, 18, 6, 0.92))",
    statusBackground: "rgba(255, 255, 255, 0.035)",
    buttonTop: "rgba(255, 251, 233, 0.055)",
    buttonBottom: "rgba(255, 251, 233, 0.03)",
    buttonBorder: "rgba(244, 215, 117, 0.08)",
    progressTrack: "rgba(255, 251, 233, 0.08)"
  },
  {
    id: "arctic",
    name: "Arctic",
    accent: "#7df0ff",
    accentSoft: "#b2f8ff",
    text: "#f3feff",
    muted: "#aecbd0",
    danger: "#ff8b9c",
    panel: "rgba(15, 30, 34, 0.86)",
    line: "rgba(158, 232, 242, 0.18)",
    bodyBackground:
      "radial-gradient(circle at top left, rgba(125, 240, 255, 0.16), transparent 30%), radial-gradient(circle at bottom right, rgba(160, 196, 255, 0.14), transparent 28%), linear-gradient(135deg, #071114, #122228 42%, #0c171b)",
    appShellBackground:
      "radial-gradient(circle at top left, rgba(125, 240, 255, 0.1), transparent 24%), linear-gradient(180deg, rgba(10, 19, 22, 0.92), rgba(10, 19, 22, 0.18) 72px, transparent 120px)",
    sidebarBackground:
      "linear-gradient(180deg, rgba(8, 16, 18, 0.8), rgba(8, 16, 18, 0.66))",
    heroBackground:
      "linear-gradient(135deg, rgba(20, 43, 47, 0.95), rgba(10, 19, 22, 0.92))",
    statusBackground: "rgba(255, 255, 255, 0.035)",
    buttonTop: "rgba(243, 254, 255, 0.055)",
    buttonBottom: "rgba(243, 254, 255, 0.03)",
    buttonBorder: "rgba(158, 232, 242, 0.08)",
    progressTrack: "rgba(243, 254, 255, 0.08)"
  },
  {
    id: "crimson",
    name: "Crimson",
    accent: "#ff5d7a",
    accentSoft: "#ff8fa1",
    text: "#fff1f4",
    muted: "#d8aeb7",
    danger: "#ffb173",
    panel: "rgba(39, 12, 20, 0.88)",
    line: "rgba(255, 125, 149, 0.18)",
    bodyBackground:
      "radial-gradient(circle at top left, rgba(255, 93, 122, 0.18), transparent 30%), radial-gradient(circle at bottom right, rgba(255, 152, 86, 0.14), transparent 28%), linear-gradient(135deg, #14060a, #2a0b14 42%, #18070d)",
    appShellBackground:
      "radial-gradient(circle at top left, rgba(255, 93, 122, 0.1), transparent 24%), linear-gradient(180deg, rgba(25, 8, 12, 0.92), rgba(25, 8, 12, 0.18) 72px, transparent 120px)",
    sidebarBackground:
      "linear-gradient(180deg, rgba(22, 7, 11, 0.8), rgba(22, 7, 11, 0.66))",
    heroBackground:
      "linear-gradient(135deg, rgba(54, 16, 27, 0.95), rgba(24, 8, 12, 0.92))",
    statusBackground: "rgba(255, 255, 255, 0.035)",
    buttonTop: "rgba(255, 241, 244, 0.055)",
    buttonBottom: "rgba(255, 241, 244, 0.03)",
    buttonBorder: "rgba(255, 125, 149, 0.08)",
    progressTrack: "rgba(255, 241, 244, 0.08)"
  }
];

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const safe = normalized.length === 3
    ? normalized
        .split("")
        .map((part) => part + part)
        .join("")
    : normalized;

  const int = Number.parseInt(safe, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255
  };
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHex(first: string, second: string, amount = 0.5) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const mix = (left: number, right: number) => Math.round(left + (right - left) * amount);
  return `#${[mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function buildCustomTheme(colors: CustomThemeColors): ThemeDefinition {
  const accent = colors.primary;
  const accentSoft = mixHex(colors.primary, colors.secondary, 0.5);
  const tertiarySoft = mixHex(colors.tertiary, "#ffffff", 0.22);
  const text = mixHex("#ffffff", colors.secondary, 0.08);
  const muted = mixHex("#8eaab0", colors.secondary, 0.28);
  const panelBase = mixHex("#08131a", colors.tertiary, 0.14);
  const heroStart = mixHex("#0f2531", colors.primary, 0.22);
  const heroEnd = mixHex("#09161d", colors.secondary, 0.16);

  return {
    id: "custom",
    name: "Custom",
    accent,
    accentSoft,
    text,
    muted,
    danger: mixHex("#ff8e76", colors.tertiary, 0.25),
    panel: rgba(panelBase, 0.88),
    line: rgba(accentSoft, 0.2),
    bodyBackground:
      `radial-gradient(circle at top left, ${rgba(accent, 0.16)}, transparent 30%), radial-gradient(circle at bottom right, ${rgba(colors.secondary, 0.18)}, transparent 28%), linear-gradient(135deg, ${mixHex("#050b0f", colors.tertiary, 0.12)}, ${mixHex("#0a1820", colors.primary, 0.14)} 42%, ${mixHex("#07131a", colors.secondary, 0.14)})`,
    appShellBackground:
      `radial-gradient(circle at top left, ${rgba(accent, 0.1)}, transparent 24%), linear-gradient(180deg, ${rgba(mixHex("#061018", colors.tertiary, 0.12), 0.92)}, ${rgba(mixHex("#061018", colors.secondary, 0.08), 0.18)} 72px, transparent 120px)`,
    sidebarBackground:
      `linear-gradient(180deg, ${rgba(mixHex("#040c10", colors.tertiary, 0.12), 0.8)}, ${rgba(mixHex("#040c10", colors.primary, 0.08), 0.66)})`,
    heroBackground:
      `linear-gradient(135deg, ${rgba(heroStart, 0.95)}, ${rgba(heroEnd, 0.92)})`,
    statusBackground: rgba(tertiarySoft, 0.08),
    buttonTop: rgba(tertiarySoft, 0.07),
    buttonBottom: rgba(tertiarySoft, 0.03),
    buttonBorder: rgba(accentSoft, 0.1),
    progressTrack: rgba(text, 0.09)
  };
}

const themeMap: Record<AppThemeName, ThemeDefinition> = Object.fromEntries(
  themes.map((theme) => [theme.id, theme])
) as Record<AppThemeName, ThemeDefinition>;

const defaultStats: UserStats = {
  totalWords: 0,
  totalXp: 0,
  currentLevel: 1,
  currentStreakDays: 0,
  lastUsedOn: null
};

const modifierOrder: ShortcutModifier[] = ["meta", "ctrl", "alt", "shift"];
const modifierLabels: Record<ShortcutModifier, string> = {
  meta: "Windows",
  ctrl: "Control",
  alt: "Alt",
  shift: "Shift"
};

const trainingParagraph =
  "Hello, this is my voice training sample for WhispARR. I speak clearly and naturally so the app can recognize my voice, pacing, and pronunciation. Today I am reading a short paragraph with numbers like twenty three and names like Chicago, Windows, and macOS to give the model a better sense of how I sound in everyday use.";

function isModifierCode(code: string) {
  return ["ControlLeft", "ControlRight", "MetaLeft", "MetaRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight"].includes(code);
}

function humanizeKey(code: string) {
  if (code.startsWith("Key")) {
    return code.slice(3);
  }

  if (code.startsWith("Digit")) {
    return code.slice(5);
  }

  return code
    .replace(/Left|Right/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

function shortcutToLabel(shortcut: ActivationShortcut) {
  const parts = modifierOrder
    .filter((modifier) => shortcut.modifiers.includes(modifier))
    .map((modifier) => modifierLabels[modifier]);

  if (shortcut.key) {
    parts.push(humanizeKey(shortcut.key));
  }

  return parts.length > 0 ? parts.join(" + ") : "Not set";
}

function shortcutFromKeyboardEvent(event: KeyboardEvent): ActivationShortcut {
  const modifiers = modifierOrder.filter((modifier) => {
    if (modifier === "meta") {
      return event.metaKey;
    }
    if (modifier === "ctrl") {
      return event.ctrlKey;
    }
    if (modifier === "alt") {
      return event.altKey;
    }
    return event.shiftKey;
  });

  return {
    modifiers,
    key: isModifierCode(event.code) ? null : event.code
  };
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("dictation");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [manualDictionary, setManualDictionary] = useState<ManualDictionaryEntry[]>([]);
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [profileName, setProfileName] = useState("");
  const [dictionarySpoken, setDictionarySpoken] = useState("");
  const [dictionaryReplacement, setDictionaryReplacement] = useState("");
  const [status, setStatus] = useState("Loading local workspace...");
  const [transcriptHistory, setTranscriptHistory] = useState<string[]>([]);
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [lastResult, setLastResult] = useState<DictationResult | null>(null);
  const [whisperStatus, setWhisperStatus] = useState<WhisperConfigStatus>({
    binaryExists: false,
    modelExists: false
  });
  const [runtimeDiscovery, setRuntimeDiscovery] = useState<RuntimeDiscoveryResult | null>(null);
  const [runtimeInstallMessage, setRuntimeInstallMessage] = useState("");
  const [isInstallingRuntime, setIsInstallingRuntime] = useState(false);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const [isCapturingShortcut, setIsCapturingShortcut] = useState(false);
  const [draftShortcut, setDraftShortcut] = useState<ActivationShortcut | null>(null);
  const [isTrainingProfile, setIsTrainingProfile] = useState(false);
  const transcriptHistoryRef = useRef<string[]>([]);
  const hasLoadedInitialDataRef = useRef(false);
  const previousLevelRef = useRef(defaultStats.currentLevel);
  const levelUpAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeProfileRef = useRef<VoiceProfile | null>(null);
  const settingsRef = useRef<AppSettings>(defaultSettings);
  const recorder = useAudioRecorder(settings.selectedMicId);
  const recorderRef = useRef(recorder);
  const isRecordingRef = useRef(false);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === settings.activeProfileId) ?? null,
    [profiles, settings.activeProfileId]
  );
  const currentTheme = useMemo(
    () => (settings.appTheme === "custom"
      ? buildCustomTheme(settings.customTheme)
      : themeMap[settings.appTheme] ?? themeMap.aurora),
    [settings.appTheme, settings.customTheme]
  );
  const transcriptHistoryOptions = [3, 5, 10, 20];

  useEffect(() => {
    recorderRef.current = recorder;
  }, [recorder]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.style.setProperty("--panel", currentTheme.panel);
    root.style.setProperty("--line", currentTheme.line);
    root.style.setProperty("--text", currentTheme.text);
    root.style.setProperty("--muted", currentTheme.muted);
    root.style.setProperty("--accent", currentTheme.accent);
    root.style.setProperty("--accent-soft", currentTheme.accentSoft);
    root.style.setProperty("--danger", currentTheme.danger);
    root.style.setProperty("--body-background", currentTheme.bodyBackground);
    root.style.setProperty("--app-shell-background", currentTheme.appShellBackground);
    root.style.setProperty("--sidebar-background", currentTheme.sidebarBackground);
    root.style.setProperty("--hero-background", currentTheme.heroBackground);
    root.style.setProperty("--status-background", currentTheme.statusBackground);
    root.style.setProperty("--button-top", currentTheme.buttonTop);
    root.style.setProperty("--button-bottom", currentTheme.buttonBottom);
    root.style.setProperty("--button-border", currentTheme.buttonBorder);
    root.style.setProperty("--progress-track", currentTheme.progressTrack);
    body.style.background = currentTheme.bodyBackground;
  }, [currentTheme]);

  useEffect(() => {
    levelUpAudioRef.current = new Audio(levelUpSoundUrl);
    levelUpAudioRef.current.volume = 0.85;

    return () => {
      levelUpAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    transcriptHistoryRef.current = transcriptHistory;
  }, [transcriptHistory]);

  useEffect(() => {
    activeProfileRef.current = activeProfile;
  }, [activeProfile]);

  useEffect(() => {
    if (!hasLoadedInitialDataRef.current) {
      return;
    }

    const trimmedHistory = transcriptHistoryRef.current.slice(0, settings.transcriptHistoryLimit);
    transcriptHistoryRef.current = trimmedHistory;
    setTranscriptHistory(trimmedHistory);
    void window.wisprApi.saveTranscriptHistory(trimmedHistory, settings.transcriptHistoryLimit);
  }, [settings.transcriptHistoryLimit]);

  useEffect(() => {
    const visible = recorder.state === "recording";
    void window.wisprApi.updateHud({
      visible,
      level: visible ? recorder.level : 0,
      label: "Listening"
    });
  }, [recorder.level, recorder.state]);

  useEffect(() => {
    if (!hasLoadedInitialDataRef.current) {
      previousLevelRef.current = stats.currentLevel;
      return;
    }

    if (stats.currentLevel > previousLevelRef.current) {
      const audio = levelUpAudioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    }

    previousLevelRef.current = stats.currentLevel;
  }, [stats.currentLevel]);

  useEffect(() => {
    void loadInitialData();
    void refreshDevices();

    const unsubscribe = window.wisprApi.onPushToTalk((state) => {
      if (state === "start") {
        void beginGlobalDictation();
      } else {
        void finishGlobalDictation();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isCapturingShortcut) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();

      if (event.code === "Escape") {
        setIsCapturingShortcut(false);
        setDraftShortcut(null);
        return;
      }

      const nextShortcut = shortcutFromKeyboardEvent(event);
      if (nextShortcut.modifiers.length === 0 && !nextShortcut.key) {
        return;
      }

      setDraftShortcut(nextShortcut);
      setIsCapturingShortcut(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCapturingShortcut]);

  async function loadInitialData() {
    const runtimeResult = await window.wisprApi.discoverRuntime();
    const data = await window.wisprApi.loadData();
    setSettings(data.settings);
    setProfiles(data.voiceProfiles);
    setManualDictionary(data.manualDictionary);
    setStats(data.stats);
    setTranscriptHistory(data.transcriptHistory.slice(0, data.settings.transcriptHistoryLimit));
    setWhisperStatus(await window.wisprApi.getWhisperStatus());
    setRuntimeDiscovery(runtimeResult);
    hasLoadedInitialDataRef.current = true;
    setStatus(`Hold ${shortcutToLabel(data.settings.activationShortcut)} anywhere to dictate.`);
  }

  async function refreshDevices() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    const items = await navigator.mediaDevices.enumerateDevices();
    setDevices(
      items
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`
        }))
    );
  }

  async function refreshLocalData() {
    const runtimeResult = await window.wisprApi.discoverRuntime();
    const data = await window.wisprApi.loadData();
    setSettings(data.settings);
    setProfiles(data.voiceProfiles);
    setManualDictionary(data.manualDictionary);
    setStats(data.stats);
    setTranscriptHistory(data.transcriptHistory.slice(0, data.settings.transcriptHistoryLimit));
    setWhisperStatus(await window.wisprApi.getWhisperStatus());
    setRuntimeDiscovery(runtimeResult);
    hasLoadedInitialDataRef.current = true;
  }

  function getXpForNextLevel(level: number) {
    if (level === 1) {
      return 1000;
    }

    return 500;
  }

  function getLevelThreshold(level: number) {
    if (level <= 1) {
      return 0;
    }

    return 1000 + (level - 2) * 500;
  }

  function getXpIntoCurrentLevel(totalXp: number, level: number) {
    return totalXp - getLevelThreshold(level);
  }

  function getNextLevelThreshold(level: number) {
    return getLevelThreshold(level + 1);
  }

  async function patchSettings(patch: Partial<AppSettings>) {
    const next = await window.wisprApi.updateSettings(patch);
    setSettings(next);
    if ("whisperBinaryPath" in patch || "whisperModelPath" in patch) {
      setWhisperStatus(await window.wisprApi.getWhisperStatus());
    }
  }

  async function chooseFile(key: "whisperBinaryPath" | "whisperModelPath") {
    const filePath = await window.wisprApi.pickFile();
    if (filePath) {
      await patchSettings({ [key]: filePath } as Partial<AppSettings>);
    }
  }

  async function saveShortcut(shortcut: ActivationShortcut) {
    await patchSettings({ activationShortcut: shortcut });
    setDraftShortcut(null);
    setStatus(`Activation shortcut updated to ${shortcutToLabel(shortcut)}.`);
  }

  async function autoConfigureRuntime() {
    const result = await window.wisprApi.discoverRuntime();
    setRuntimeDiscovery(result);
    await refreshLocalData();

    if (result.selected) {
      setStatus(`Configured local runtime from ${result.selected.source}.`);
    } else {
      setStatus("No bundled or local runtime was found yet.");
    }
  }

  async function installEverything() {
    setIsInstallingRuntime(true);
    setRuntimeInstallMessage("Installing local runtime and model...");

    try {
      const result: RuntimeInstallResult = await window.wisprApi.installRuntime();
      setRuntimeDiscovery(result.discovery);
      setRuntimeInstallMessage(result.message);
      await refreshLocalData();
      setStatus("Local speech engine is installed. Next steps are shortcut setup and voice training.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Runtime installation failed.";
      setRuntimeInstallMessage(message);
      setStatus(message);
    } finally {
      setIsInstallingRuntime(false);
    }
  }

  async function beginGlobalDictation() {
    if (isRecordingRef.current) {
      return;
    }

    isRecordingRef.current = true;
    setIsPushToTalkActive(true);
    await recorderRef.current.start();
    setStatus(`Listening... release ${shortcutToLabel(settingsRef.current.activationShortcut)} to transcribe.`);
  }

  async function finalizeDictation(options: { pasteResult: boolean }) {
    const sample = await recorderRef.current.stop();

    if (!hasAudibleSpeech(sample.pcm)) {
      setStatus("No speech detected. Nothing was saved or pasted.");
      recorderRef.current.reset();
      return;
    }

    const embedding = computeVoiceEmbedding(sample.pcm, sample.sampleRate);
    const profile = activeProfileRef.current;
    const currentSettings = settingsRef.current;

    if (currentSettings.autoVerifySpeaker && profile) {
      const score = scoreVoiceMatch(profile.averageEmbedding, embedding);
      if (score < 0.72) {
        setStatus(`Speaker mismatch detected. Confidence ${score}. Transcription stayed local and was skipped.`);
        setLastResult({
          transcript: "",
          elapsedMs: 0,
          speakerScore: score
        });
        recorderRef.current.reset();
        return;
      }
    }

    setStatus("Running local transcription...");
    try {
      const result = await window.wisprApi.transcribe({
        pcm: Array.from(sample.pcm),
        sampleRate: sample.sampleRate
      });
      const speakerScore = profile
        ? scoreVoiceMatch(profile.averageEmbedding, embedding)
        : undefined;
      const enrichedResult = {
        ...result,
        speakerScore
      };

      if (result.transcript.trim()) {
        const nextHistory = [result.transcript.trim(), ...transcriptHistoryRef.current].slice(
          0,
          settingsRef.current.transcriptHistoryLimit
        );
        transcriptHistoryRef.current = nextHistory;
        setTranscriptHistory(nextHistory);
        await window.wisprApi.saveTranscriptHistory(
          nextHistory,
          settingsRef.current.transcriptHistoryLimit
        );
        const updatedStats = await window.wisprApi.trackTranscriptStats(result.transcript);
        setStats(updatedStats);
      }

      setLastResult(enrichedResult);

      if (profile && result.transcript.trim()) {
        const updatedProfile = await window.wisprApi.saveVoiceProfile({
          id: profile.id,
          name: profile.name,
          embedding,
          incrementSamplesBy: 1
        });
        setProfiles((current) =>
          current.map((item) => (item.id === updatedProfile.id ? updatedProfile : item))
        );
      }

      if (options.pasteResult && currentSettings.autoPaste && result.transcript.trim()) {
        await window.wisprApi.pasteText(result.transcript);
        setStatus("Transcribed locally and pasted into the active app.");
      } else {
        setStatus("Local dictation completed.");
      }
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Local transcription failed.");
    } finally {
      recorderRef.current.reset();
    }
  }

  async function finishGlobalDictation() {
    if (!isRecordingRef.current) {
      return;
    }

    isRecordingRef.current = false;
    setIsPushToTalkActive(false);
    await finalizeDictation({ pasteResult: true });
  }

  async function startDictation() {
    if (isRecordingRef.current) {
      return;
    }

    isRecordingRef.current = true;
    await recorder.start();
    setStatus("Recording from your selected microphone...");
  }

  async function stopDictation() {
    if (!isRecordingRef.current) {
      return;
    }

    isRecordingRef.current = false;
    await finalizeDictation({ pasteResult: false });
  }

  async function trainProfile() {
    if (!profileName.trim()) {
      setStatus("Choose a profile name before training.");
      return;
    }

    if (isTrainingProfile) {
      return;
    }

    await recorder.start();
    setIsTrainingProfile(true);
    setStatus("Voice profile recording is live. Read the full paragraph, then press stop when you are done.");
  }

  async function stopProfileTraining() {
    if (!isTrainingProfile) {
      return;
    }

    try {
      const sample = await recorder.stop();
      const embedding = computeVoiceEmbedding(sample.pcm, sample.sampleRate);
      const existing = profiles.find(
        (profile) => profile.name.toLowerCase() === profileName.trim().toLowerCase()
      );

      await window.wisprApi.saveVoiceProfile({
        id: existing?.id,
        name: profileName.trim(),
        embedding,
        incrementSamplesBy: 1
      });
      await refreshLocalData();
      setStatus(`Saved a local voice sample for ${profileName.trim()}. Nothing left the device.`);
    } finally {
      setIsTrainingProfile(false);
      recorder.reset();
    }
  }

  const activeShortcutLabel = shortcutToLabel(settings.activationShortcut);
  const draftShortcutLabel = draftShortcut ? shortcutToLabel(draftShortcut) : null;
  const currentLevelFloor = getLevelThreshold(stats.currentLevel);
  const nextLevelThreshold = getNextLevelThreshold(stats.currentLevel);
  const xpIntoCurrentLevel = Math.max(0, stats.totalXp - currentLevelFloor);
  const xpNeededForCurrentLevel = Math.max(1, nextLevelThreshold - currentLevelFloor);
  const xpRemainingToNextLevel = Math.max(0, nextLevelThreshold - stats.totalXp);

  async function copyTranscript(text: string) {
    await navigator.clipboard.writeText(text);
    setStatus("Transcript copied to clipboard.");
  }

  async function copyTrainingParagraph() {
    await navigator.clipboard.writeText(trainingParagraph);
    setStatus("Training paragraph copied to clipboard.");
  }

  async function saveDictionaryEntry() {
    if (!dictionarySpoken.trim() || !dictionaryReplacement.trim()) {
      setStatus("Add both the heard phrase and the corrected replacement before saving.");
      return;
    }

    const entry = await window.wisprApi.saveManualDictionaryEntry({
      spoken: dictionarySpoken,
      replacement: dictionaryReplacement
    });
    setManualDictionary((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
    setDictionarySpoken("");
    setDictionaryReplacement("");
    setStatus(`Saved dictionary rule for "${entry.spoken}".`);
  }

  return (
    <div className="app-shell">
      <div className="titlebar-drag" aria-hidden="true" />
      <aside className="sidebar">
        <div>
          <div className="brand-mark">
            <img src={appIconUrl} alt="WhispARR icon" className="brand-mark-image" />
            <p className="eyebrow">WhispARR</p>
          </div>
          <h1>System Dictation</h1>
          <p className="intro">
            Hold <strong>{activeShortcutLabel}</strong> anywhere on the computer to talk. Release
            the shortcut to run local transcription and paste the result back into the active app.
          </p>
        </div>
        <nav className="nav">
          {[
            ["dictation", "Dictation"],
            ["profiles", "Voice Profiles"],
            ["stats", "Statistics"],
            ["settings", "System"],
            ["help", "Help"]
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "nav-button active" : "nav-button"}
              onClick={() => setTab(key as TabKey)}
            >
              {key === "help" ? (
                <span className="nav-button-content">
                  <span className="help-nav-icon" aria-hidden="true">
                    ?
                  </span>
                  <span>{label}</span>
                </span>
              ) : (
                label
              )}
            </button>
          ))}
        </nav>
        <div className="privacy-card">
          <h2>Resident App</h2>
          <p>Closing the window keeps the app alive in the tray so shortcut dictation still works.</p>
          <p>No cloud APIs, no remote sync, and no telemetry are included.</p>
        </div>
      </aside>
      <main className="content">
        <header className="hero">
          <div>
            <p className="eyebrow">Status</p>
            <h2>{status}</h2>
          </div>
          <div className="status-pill">
            <span
              className={
                isPushToTalkActive || recorder.state === "recording"
                  ? "dot ready"
                  : whisperStatus.binaryExists && whisperStatus.modelExists
                    ? "dot ready"
                    : "dot"
              }
            />
            {isPushToTalkActive
              ? "Push-to-talk live"
              : whisperStatus.binaryExists && whisperStatus.modelExists
                ? `Ready on ${activeShortcutLabel}`
                : "Local engine needs setup"}
          </div>
        </header>
        <section className="top-stats">
          <article className="top-stat">
            <span>Level</span>
            <strong>{stats.currentLevel}</strong>
          </article>
          <article className="top-stat">
            <span>Total XP</span>
            <strong>{stats.totalXp.toLocaleString()}</strong>
          </article>
          <article className="top-stat">
            <span>XP remaining</span>
            <strong>{xpRemainingToNextLevel.toLocaleString()}</strong>
          </article>
          <article className="top-stat">
            <span>Words</span>
            <strong>{stats.totalWords.toLocaleString()}</strong>
          </article>
          <article className="top-stat">
            <span>Streak</span>
            <strong>{stats.currentStreakDays} days</strong>
          </article>
        </section>
        <section className="top-progress">
          <div className="top-progress-copy">
            <p className="eyebrow">Live XP</p>
            <h3>
              Level {stats.currentLevel} Progress
            </h3>
          </div>
          <div className="top-progress-meter">
            <div className="level-progress-bar">
              <div
                className="level-progress-fill"
                style={{
                  width: `${Math.min(100, (xpIntoCurrentLevel / xpNeededForCurrentLevel) * 100)}%`
                }}
              />
            </div>
            <div className="top-progress-meta">
              <span>
                {xpIntoCurrentLevel.toLocaleString()} / {xpNeededForCurrentLevel.toLocaleString()} XP in this level
              </span>
              <span>Next level at {nextLevelThreshold.toLocaleString()} XP</span>
              <span>{xpRemainingToNextLevel.toLocaleString()} XP remaining</span>
            </div>
          </div>
        </section>
        {tab === "dictation" && (
          <section className="panel-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Activation</p>
                  <h3>{activeShortcutLabel} To Dictate</h3>
                </div>
                <button className="ghost-button" onClick={() => void refreshDevices()}>
                  Refresh devices
                </button>
              </div>
              <p className="supporting">
                The app listens globally. Press and hold {activeShortcutLabel}, speak, then release.
                With auto-paste enabled, the result is inserted back into the app you were using.
              </p>
              <label className="field">
                <span>Microphone</span>
                <select
                  value={settings.selectedMicId ?? ""}
                  onChange={(event) =>
                    void patchSettings({ selectedMicId: event.target.value || null })
                  }
                >
                  <option value="">System default microphone</option>
                  {devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="button-row">
                <button
                  className="primary-button"
                  onClick={() => void startDictation()}
                  disabled={recorder.state === "recording"}
                >
                  Start manually
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void stopDictation()}
                  disabled={recorder.state !== "recording"}
                >
                  Stop manual capture
                </button>
                <button className="ghost-button" onClick={() => setTab("settings")}>
                  Edit shortcut
                </button>
              </div>
              {activeProfile && (
                <p className="supporting">
                  Active speaker verification profile: <strong>{activeProfile.name}</strong>
                </p>
              )}
              {recorder.error && <p className="error-text">{recorder.error}</p>}
            </section>
            <section className="panel transcript-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Output</p>
                  <h3>Transcript History</h3>
                </div>
                <div className="panel-actions">
                  <label className="inline-field">
                    <span>Keep</span>
                    <select
                      value={settings.transcriptHistoryLimit}
                      onChange={(event) =>
                        void patchSettings({
                          transcriptHistoryLimit: Number(event.target.value)
                        })
                      }
                    >
                      {transcriptHistoryOptions.map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                  </label>
                  {lastResult && (
                    <div className="metrics">
                      <span>{Math.round(lastResult.elapsedMs)} ms</span>
                      {typeof lastResult.speakerScore === "number" && (
                        <span>speaker {lastResult.speakerScore}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="transcript-history">
                {transcriptHistory.length === 0 && (
                  <p className="supporting">
                    Your most recent dictations will appear here. Older entries are removed automatically once you pass the selected limit.
                  </p>
                )}
                {transcriptHistory.map((entry, index) => (
                  <div key={`${index}-${entry.slice(0, 24)}`} className="transcript-entry">
                    <div className="transcript-entry-header">
                      <strong>{index === 0 ? "Newest" : `Previous ${index}`}</strong>
                      <button
                        className="ghost-button"
                        onClick={() => void copyTranscript(entry)}
                      >
                        Copy
                      </button>
                    </div>
                    <p>{entry}</p>
                  </div>
                ))}
              </div>
            </section>
          </section>
        )}
        {tab === "profiles" && (
          <section className="panel-grid profiles-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Training</p>
                  <h3>Voice Profile Builder</h3>
                </div>
              </div>
              <label className="field">
                <span>Profile name</span>
                <input
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  placeholder="Example: Hunter"
                />
              </label>
              <div className="button-row">
                <button
                  className="primary-button"
                  onClick={() => void trainProfile()}
                  disabled={isTrainingProfile || recorder.state === "recording"}
                >
                  Start training recording
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void stopProfileTraining()}
                  disabled={!isTrainingProfile}
                >
                  Stop and save training
                </button>
                <button className="ghost-button" onClick={() => void copyTrainingParagraph()}>
                  Copy sample paragraph
                </button>
                <button
                  className="secondary-button"
                  onClick={() =>
                    void patchSettings({ autoVerifySpeaker: !settings.autoVerifySpeaker })
                  }
                >
                  {settings.autoVerifySpeaker ? "Disable speaker gate" : "Enable speaker gate"}
                </button>
              </div>
              <p className="supporting">
                Training stores a local voiceprint that can block transcription if someone else is
                speaking when push-to-talk is triggered. Start recording when you are ready, read the
                paragraph at your normal pace, and stop it yourself when finished.
              </p>
              <div className="training-example">
                <p className="eyebrow">Practice Paragraph</p>
                <p>{trainingParagraph}</p>
              </div>
              <p className="supporting">
                Read this paragraph a few times in your normal speaking voice. After a profile is
                active, successful dictations also reinforce that profile automatically so it can
                adapt as you keep using the app.
              </p>
            </section>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Profiles</p>
                  <h3>Saved Local Voices</h3>
                </div>
              </div>
              <div className="profile-list">
                {profiles.length === 0 && (
                  <p className="supporting">
                    No profiles yet. Record a few short samples to build one.
                  </p>
                )}
                {profiles.map((profile) => (
                  <div key={profile.id} className="profile-card">
                    <div>
                      <strong>{profile.name}</strong>
                      <p>{profile.sampleCount} samples</p>
                    </div>
                    <div className="button-row compact">
                      <button
                        className="ghost-button"
                        onClick={() => void patchSettings({ activeProfileId: profile.id })}
                      >
                        {settings.activeProfileId === profile.id ? "Active" : "Set active"}
                      </button>
                      <button
                        className="ghost-button danger"
                        onClick={async () => {
                          await window.wisprApi.deleteVoiceProfile(profile.id);
                          await refreshLocalData();
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="panel-header dictionary-header">
                <div>
                  <p className="eyebrow">Manual Dictionary</p>
                  <h3>Teach Corrections</h3>
                </div>
              </div>
              <p className="supporting">
                Add phrases the model tends to hear incorrectly, then tell WhispARR what they
                should become after transcription. Everything stays local on this device.
              </p>
              <div className="dictionary-form">
                <label className="field">
                  <span>What it hears</span>
                  <input
                    value={dictionarySpoken}
                    onChange={(event) => setDictionarySpoken(event.target.value)}
                    placeholder="Example: whisper"
                  />
                </label>
                <label className="field">
                  <span>Replace with</span>
                  <input
                    value={dictionaryReplacement}
                    onChange={(event) => setDictionaryReplacement(event.target.value)}
                    placeholder="Example: WhispARR"
                  />
                </label>
              </div>
              <div className="button-row">
                <button className="primary-button" onClick={() => void saveDictionaryEntry()}>
                  Save dictionary rule
                </button>
              </div>
              <div className="dictionary-list">
                {manualDictionary.length === 0 && (
                  <p className="supporting">
                    No dictionary rules yet. Add words, names, or phrases you want corrected automatically.
                  </p>
                )}
                {manualDictionary.map((entry) => (
                  <div key={entry.id} className="dictionary-card">
                    <div>
                      <strong>{entry.replacement}</strong>
                      <p>
                        Heard as <span className="dictionary-chip">{entry.spoken}</span>
                      </p>
                    </div>
                    <button
                      className="ghost-button danger"
                      onClick={async () => {
                        const next = await window.wisprApi.deleteManualDictionaryEntry(entry.id);
                        setManualDictionary(next);
                        setStatus(`Removed dictionary rule for "${entry.spoken}".`);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </section>
        )}
        {tab === "stats" && (
          <section className="panel-grid stats-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Progress</p>
                  <h3>Level {stats.currentLevel}</h3>
                </div>
              </div>
              <div className="stats-cards">
                <div className="stat-card">
                  <span>Total words</span>
                  <strong>{stats.totalWords.toLocaleString()}</strong>
                </div>
                <div className="stat-card">
                  <span>Total XP</span>
                  <strong>{stats.totalXp.toLocaleString()}</strong>
                </div>
                <div className="stat-card">
                  <span>Current streak</span>
                  <strong>{stats.currentStreakDays} days</strong>
                </div>
              </div>
              <div className="level-progress">
                <div className="level-progress-bar">
                  <div
                    className="level-progress-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        (xpIntoCurrentLevel / xpNeededForCurrentLevel) * 100
                      )}%`
                    }}
                  />
                </div>
                <p className="supporting">
                  {xpIntoCurrentLevel.toLocaleString()} / {xpNeededForCurrentLevel.toLocaleString()} XP toward level{" "}
                  {stats.currentLevel + 1}
                </p>
                <p className="supporting progress-meta">
                  Next level at <strong>{nextLevelThreshold.toLocaleString()} XP</strong>
                </p>
                <p className="supporting progress-meta">
                  <strong>{xpRemainingToNextLevel.toLocaleString()} XP remaining</strong>
                </p>
              </div>
            </section>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Leveling</p>
                  <h3>How XP Works</h3>
                </div>
              </div>
              <ul className="plain-list">
                <li>Every dictated word gives 1 XP</li>
                <li>Everyone starts at Level 1</li>
                <li>Level 2 unlocks at 1,000 total XP</li>
                <li>Each level after that unlocks every additional 500 XP</li>
              </ul>
              <p className="supporting">
                The streak increases when you use the app on consecutive days. Missing a day resets
                the streak back to 1 on your next session.
              </p>
              <p className="supporting">
                Last active day: <strong>{stats.lastUsedOn ?? "No usage yet"}</strong>
              </p>
            </section>
          </section>
        )}
        {tab === "settings" && (
          <section className="panel-grid settings-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Shortcut</p>
                  <h3>Activation Combo</h3>
                </div>
              </div>
              <p className="supporting">Current shortcut: <strong>{activeShortcutLabel}</strong></p>
              <div className="button-row">
                <button
                  className={isCapturingShortcut ? "primary-button" : "secondary-button"}
                  onClick={() => {
                    setDraftShortcut(null);
                    setIsCapturingShortcut(true);
                  }}
                >
                  {isCapturingShortcut ? "Press shortcut now..." : "Record new shortcut"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => void saveShortcut(defaultShortcut)}
                >
                  Reset to Windows + Control
                </button>
              </div>
              {draftShortcutLabel && (
                <div className="button-row">
                  <p className="supporting">Captured: <strong>{draftShortcutLabel}</strong></p>
                  <button
                    className="primary-button"
                    onClick={() => draftShortcut && void saveShortcut(draftShortcut)}
                  >
                    Save captured shortcut
                  </button>
                </div>
              )}
              <p className="supporting">
                While recording a shortcut, press the full combination once. `Escape` cancels the capture.
              </p>

              <div className="panel-header">
                <div>
                  <p className="eyebrow">Requirements</p>
                  <h3>Speech Runtime Setup</h3>
                </div>
              </div>
              <div className="button-row">
                <button
                  className="primary-button"
                  onClick={() => void installEverything()}
                  disabled={isInstallingRuntime}
                >
                  {isInstallingRuntime ? "Installing..." : "Install everything"}
                </button>
                <button className="primary-button" onClick={() => void autoConfigureRuntime()}>
                  Auto-find runtime
                </button>
              </div>
              <p className="supporting">
                `Install everything` downloads the local speech runtime into the app data folder
                and configures it automatically. Packaged builds can also ship the runtime already
                embedded, and the app will auto-detect it on launch.
              </p>
              {runtimeInstallMessage && <p className="supporting">{runtimeInstallMessage}</p>}
              {runtimeDiscovery?.selected && (
                <p className="supporting">
                  Active match: <strong>{runtimeDiscovery.selected.source}</strong>
                </p>
              )}
              {runtimeDiscovery && runtimeDiscovery.candidates.length > 1 && (
                <p className="supporting">
                  Additional matches found: <strong>{runtimeDiscovery.candidates.length - 1}</strong>
                </p>
              )}

              <div className="panel-header">
                <div>
                  <p className="eyebrow">Themes</p>
                  <h3>Application Look</h3>
                </div>
              </div>
              <p className="supporting">
                Pick a color theme for the whole app. Your choice is saved locally on this device.
              </p>
              <div className="theme-grid">
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    className={settings.appTheme === theme.id ? "theme-card active" : "theme-card"}
                    onClick={() => void patchSettings({ appTheme: theme.id })}
                    type="button"
                  >
                    <div className="theme-card-swatches">
                      <span
                        className="theme-swatch"
                        style={{ background: theme.accent }}
                        aria-hidden="true"
                      />
                      <span
                        className="theme-swatch"
                        style={{ background: theme.accentSoft }}
                        aria-hidden="true"
                      />
                      <span
                        className="theme-swatch theme-swatch-panel"
                        style={{ background: theme.panel }}
                        aria-hidden="true"
                      />
                    </div>
                    <strong>{theme.name}</strong>
                  </button>
                ))}
                <div
                  className={
                    settings.appTheme === "custom"
                      ? "theme-card theme-card-custom active"
                      : "theme-card theme-card-custom"
                  }
                >
                  <button
                    className="theme-card-button"
                    onClick={() => void patchSettings({ appTheme: "custom" })}
                    type="button"
                  >
                    <div className="theme-card-swatches">
                      <span
                        className="theme-swatch"
                        style={{ background: settings.customTheme.primary }}
                        aria-hidden="true"
                      />
                      <span
                        className="theme-swatch"
                        style={{ background: settings.customTheme.secondary }}
                        aria-hidden="true"
                      />
                      <span
                        className="theme-swatch"
                        style={{ background: settings.customTheme.tertiary }}
                        aria-hidden="true"
                      />
                    </div>
                    <strong>Custom</strong>
                  </button>
                  <div className="custom-theme-editor">
                    <label className="theme-color-field">
                      <span>Primary</span>
                      <input
                        type="color"
                        value={settings.customTheme.primary}
                        onChange={(event) =>
                          void patchSettings({
                            appTheme: "custom",
                            customTheme: {
                              ...settings.customTheme,
                              primary: event.target.value
                            }
                          })
                        }
                      />
                    </label>
                    <label className="theme-color-field">
                      <span>Secondary</span>
                      <input
                        type="color"
                        value={settings.customTheme.secondary}
                        onChange={(event) =>
                          void patchSettings({
                            appTheme: "custom",
                            customTheme: {
                              ...settings.customTheme,
                              secondary: event.target.value
                            }
                          })
                        }
                      />
                    </label>
                    <label className="theme-color-field">
                      <span>Tertiary</span>
                      <input
                        type="color"
                        value={settings.customTheme.tertiary}
                        onChange={(event) =>
                          void patchSettings({
                            appTheme: "custom",
                            customTheme: {
                              ...settings.customTheme,
                              tertiary: event.target.value
                            }
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="panel-header">
                <div>
                  <p className="eyebrow">System</p>
                  <h3>Background Behavior</h3>
                </div>
              </div>
              <div className="button-row">
                <button
                  className={settings.autoPaste ? "primary-button" : "secondary-button"}
                  onClick={() => void patchSettings({ autoPaste: !settings.autoPaste })}
                >
                  {settings.autoPaste ? "Auto-paste on" : "Auto-paste off"}
                </button>
                <button
                  className={settings.launchOnLogin ? "primary-button" : "secondary-button"}
                  onClick={() => void patchSettings({ launchOnLogin: !settings.launchOnLogin })}
                >
                  {settings.launchOnLogin ? "Launch at login on" : "Launch at login off"}
                </button>
              </div>
              <p className="supporting">
                Auto-paste uses the system clipboard plus a local paste keystroke so the dictated
                text lands back in the app you were using.
              </p>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Engine</p>
                  <h3>whisper.cpp Paths</h3>
                </div>
              </div>
              <label className="field">
                <span>Local binary</span>
                <div className="path-field">
                  <input
                    value={settings.whisperBinaryPath}
                    readOnly
                    placeholder="Path to main binary"
                  />
                  <button
                    className="ghost-button"
                    onClick={() => void chooseFile("whisperBinaryPath")}
                  >
                    Browse
                  </button>
                </div>
              </label>
              <label className="field">
                <span>Local model</span>
                <div className="path-field">
                  <input
                    value={settings.whisperModelPath}
                    readOnly
                    placeholder="Path to GGML model"
                  />
                  <button
                    className="ghost-button"
                    onClick={() => void chooseFile("whisperModelPath")}
                  >
                    Browse
                  </button>
                </div>
              </label>
            </section>
          </section>
        )}
        {tab === "help" && (
          <section className="panel-grid settings-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">How It Works</p>
                  <h3>Using WhispARR</h3>
                </div>
              </div>
              <p className="supporting">
                WhispARR is a resident local dictation app. Once the runtime is installed, the app
                stays available in the tray and listens for your shortcut anywhere on the computer.
              </p>
              <ul className="plain-list">
                <li>Open `System` once to install the local speech runtime and pick your microphone</li>
                <li>Set your shortcut if you want something different from `Windows + Control`</li>
                <li>Hold the shortcut to talk, then release it to transcribe</li>
                <li>If auto-paste is on, the transcript is pasted back into the app you were using</li>
                <li>The bottom pill and waveform show when WhispARR is actively hearing your voice</li>
                <li>Transcript history keeps your recent dictated text ready to copy again</li>
              </ul>
              <p className="supporting">
                Voice Profiles are optional. You can train one by reading the sample paragraph, then
                WhispARR can use that local voiceprint to better recognize your speech pattern and
                optionally block dictation from someone else speaking near your microphone.
              </p>
              <p className="supporting">
                Your stats, XP, history, shortcut, selected theme, dictionary rules, and runtime
                paths are all saved locally on this device so you can close and reopen the app
                without losing your setup.
              </p>
            </section>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Boundary</p>
                  <h3>What Stays Local</h3>
                </div>
              </div>
              <ul className="plain-list">
                <li>Global shortcut preferences and activation state</li>
                <li>Selected microphone and startup preferences</li>
                <li>Bundled or auto-discovered runtime paths</li>
                <li>Whisper binary and model paths</li>
                <li>Voice profile embeddings and verification settings</li>
                <li>Manual dictionary corrections and transcript history</li>
                <li>Clipboard-based paste insertion after local transcription</li>
              </ul>
              <p className="supporting">
                WhispARR is built to run locally on your computer. Dictation, history, voice
                training, theme choices, and stats remain on the device instead of being sent to a
                remote service.
              </p>
              <p className="supporting">
                For packaged releases, place the runtime under `runtime/bin` and `runtime/models`
                before building so the installer can ship with everything preloaded.
              </p>
            </section>
          </section>
        )}
      </main>
      <div className="bottom-level-bar" aria-label="Level progress to next level">
        <div className="bottom-level-bar-fill-wrap">
          <div
            className="bottom-level-bar-fill"
            style={{
              width: `${Math.min(100, (xpIntoCurrentLevel / xpNeededForCurrentLevel) * 100)}%`
            }}
          />
        </div>
        <div className="bottom-level-bar-meta">
          <span>Level {stats.currentLevel}</span>
          <span>
            {xpIntoCurrentLevel.toLocaleString()} / {xpNeededForCurrentLevel.toLocaleString()} XP
          </span>
          <span>Next level at {nextLevelThreshold.toLocaleString()} XP</span>
        </div>
      </div>
    </div>
  );
}
