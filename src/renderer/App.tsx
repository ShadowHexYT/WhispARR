import { useEffect, useMemo, useRef, useState, type ComponentType, type PointerEvent, type ReactNode } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import {
  BookText,
  ChartColumnBig,
  FileText,
  Mic,
  Settings2,
  SquareTerminal,
  UserRound,
  Minimize2,
  Maximize2,
  Volume1,
  Volume2
} from "lucide-react";
import { computeVoiceEmbedding, hasAudibleSpeech, scoreVoiceMatch } from "./lib/audio";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import {
  AchievementUnlockInput,
  ActivationShortcut,
  AppDiagnostics,
  AppUpdateInfo,
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

type TabKey = "dictation" | "profiles" | "dictionary" | "notes" | "stats" | "settings" | "developer" | "help";
type MicDevice = { deviceId: string; label: string };
type StatusLogEntry = { timestamp: string; message: string };
type RuntimeFeedbackTone = "idle" | "success" | "error" | "working";
type AchievementDifficulty = "Easy" | "Medium" | "Hard" | "Almost Impossible";
type UpdateDialogState = "closed" | "none" | "available" | "error";
const MAX_SLIDER_OVERFLOW = 50;
const levelUpSoundUrl = new URL("../../assets/lvl_up.mp3", import.meta.url).href;
const appIconUrl = new URL("../../assets/WhispARR Image.png", import.meta.url).href;
const konamiSequence = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

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
  alwaysShowPill: false,
  hudPosition: null,
  hudScale: 100,
  muteDictationSounds: false,
  appSoundVolume: 80,
  muteMusicWhileDictating: false,
  autoLearnDictionary: false,
  smartFormatting: true,
  activationShortcut: defaultShortcut,
  appTheme: "aurora",
  customTheme: {
    primary: "#5ef0ba",
    secondary: "#54d8ff",
    tertiary: "#ff77c8"
  },
  onboardingCompleted: false,
  devModeUnlocked: false,
  devModeEnabled: false
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

function HelpQuestionIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={props.className}
    >
      <circle cx="12" cy="12" r="9" className="help-question-ring" />
      <path
        d="M9.35 9.15a2.7 2.7 0 0 1 5.3.7c0 1.95-2.1 2.35-2.1 4.15"
        className="help-question-stem"
      />
      <circle cx="12" cy="17.35" r="0.95" className="help-question-dot" />
    </svg>
  );
}

const trainingParagraph =
  "Hello, this is my voice training sample for WhispARR. I speak clearly and naturally so the app can recognize my voice, pacing, and pronunciation. Today I am reading a short paragraph with numbers like twenty three and names like Chicago, Windows, and macOS to give the model a better sense of how I sound in everyday use.";

const navItems: Array<{
  key: TabKey;
  label: string;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  iconClassName: string;
}> = [
  { key: "dictation", label: "Dictation", Icon: Mic, iconClassName: "nav-icon-dictation" },
  { key: "profiles", label: "Voice Profiles", Icon: UserRound, iconClassName: "nav-icon-profiles" },
  { key: "dictionary", label: "Dictionary", Icon: BookText, iconClassName: "nav-icon-dictionary" },
  { key: "notes", label: "Notes", Icon: FileText, iconClassName: "nav-icon-notes" },
  { key: "stats", label: "Statistics", Icon: ChartColumnBig, iconClassName: "nav-icon-stats" },
  { key: "settings", label: "System", Icon: Settings2, iconClassName: "nav-icon-settings" },
  { key: "help", label: "Help", Icon: HelpQuestionIcon, iconClassName: "nav-icon-help" },
  { key: "developer", label: "Developer", Icon: SquareTerminal, iconClassName: "nav-icon-developer" }
];

const achievements = [
  { title: "First Words", description: "Dictate your first 100 words.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Warm Up", description: "Reach 250 total words.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Short Session", description: "Dictate 3 separate times in one day.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Getting Comfortable", description: "Reach 500 total words.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Day One Done", description: "Use WhispARR on 2 different days.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Quick Notes", description: "Save 3 notes in the notes workspace.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Clean Start", description: "Create your first voice profile.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Ready To Roll", description: "Install the runtime and complete a successful dictation.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Routine Builder", description: "Reach a 3-day streak.", difficulty: "Easy" as AchievementDifficulty },
  { title: "One Thousand Club", description: "Reach 1,000 total words.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Clipboard Captain", description: "Copy notes or transcripts 10 times.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Local Legend", description: "Save 5 dictionary entries.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Weekender", description: "Use WhispARR on 5 different days.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Double Take", description: "Dictate 2 times back to back.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Focused Voice", description: "Complete a dictation with no edits afterward.", difficulty: "Easy" as AchievementDifficulty },
  { title: "First Level Up", description: "Reach Level 2.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Steady Flow", description: "Reach 2,500 total words.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Helpful Habit", description: "Save 10 local notes.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Seven Day Rhythm", description: "Reach a 7-day streak.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Daily Driver", description: "Use WhispARR on 10 different days.", difficulty: "Easy" as AchievementDifficulty },
  { title: "Word Worker", description: "Reach 5,000 total words.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Snippet Saver", description: "Save 15 separate notes.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Correction Coach", description: "Add 15 learned words to the dictionary.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Two Level Lead", description: "Reach Level 3.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Quiet Consistency", description: "Dictate on 12 different days in one month.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Meeting Ready", description: "Dictate 10 separate times in a single day.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Ten Thousand Strong", description: "Reach 10,000 total words.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Reliable Voice", description: "Train 2 separate voice profiles.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Workspace Pro", description: "Keep 1,000 characters or more in notes for a full week.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Long Form", description: "Complete one dictation over 1,000 words.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Two Week Run", description: "Reach a 14-day streak.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Frequent Flyer", description: "Use WhispARR on 20 different days.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Level Climber", description: "Reach Level 5.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Twenty K", description: "Reach 20,000 total words.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Daily Notes", description: "Save at least 1 note on 10 different days.", difficulty: "Medium" as AchievementDifficulty },
  { title: "Power Session", description: "Dictate 5,000 words in a single day.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Iron Streak", description: "Reach a 21-day streak.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Thirty Thousand", description: "Reach 30,000 total words.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Voice Vault", description: "Maintain 25 saved notes at the same time.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Level Seven", description: "Reach Level 7.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Always On", description: "Use WhispARR on 25 different days in one month.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Marathon Dictator", description: "Dictate 20 separate times in one day.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Forty Thousand", description: "Reach 40,000 total words.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Perfect Three Weeks", description: "Use the app every day for 21 straight days.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Reach Level 100", description: "Reach Level 100.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Fifty Thousand", description: "Reach 50,000 total words.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Month Of Motion", description: "Use WhispARR on all 30 days of a month.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Dictation Machine", description: "Dictate 10,000 words in a single day.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Century Session", description: "Finish 100 successful dictations in one month.", difficulty: "Hard" as AchievementDifficulty },
  { title: "Orbital", description: "Reach 250,000 total words in a single month.", difficulty: "Almost Impossible" as AchievementDifficulty }
] as const;

const achievementXpByDifficulty: Record<AchievementDifficulty, number> = {
  Easy: 150,
  Medium: 400,
  Hard: 900,
  "Almost Impossible": 5000
};

const onboardingSteps = [
  {
    title: "Welcome to WhispARR",
    description: "This quick setup will walk through the basics so the app is ready before your first dictation."
  },
  {
    title: "Install the local engine",
    description: "Make sure the local runtime is available so dictation can run fully on your device."
  },
  {
    title: "Choose your microphone",
    description: "Pick the microphone you want to use and test that the app is hearing your voice."
  },
  {
    title: "Set your shortcut",
    description: "Choose the push-to-talk shortcut you want to hold anywhere on your computer."
  },
  {
    title: "Create your voice profile",
    description: "Record a voice sample so WhispARR can learn how you sound and personalize the experience."
  },
  {
    title: "You are ready",
    description: "Finish setup and start using the home screen with your core tools already configured."
  }
] as const;

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

function clampSoundVolume(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampHudScale(value: number) {
  return Math.max(60, Math.min(160, Math.round(value)));
}

function clampTranscriptHistoryLimit(value: number) {
  return Math.max(1, Math.min(500, Math.round(value)));
}

function compactStatus(message: string) {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  const mappedStatuses: Array<[RegExp, string]> = [
    [/loading local workspace/, "Loading workspace"],
    [/hold .* anywhere to dictate/, "Ready to dictate"],
    [/activation shortcut updated/, "Shortcut updated"],
    [/configured local runtime/, "Engine configured"],
    [/no bundled or local runtime/, "Engine not found"],
    [/installed and verified/, "Engine ready"],
    [/installation finished, but readiness could not be confirmed/, "Engine needs attention"],
    [/install failed/, "Install failed"],
    [/update installer launched/, "Installing update"],
    [/you are up to date/, "No updates available"],
    [/version .* is available/, "Update available"],
    [/update check failed/, "Update check failed"],
    [/setup complete/, "Setup complete"],
    [/pill location saved/, "Pill location saved"],
    [/drag the pill where you want it/, "Move the pill"],
    [/pill location reset/, "Pill recentered"],
    [/developer mode unlocked/, "Developer mode unlocked"],
    [/listening\.\.\. release/, "Listening"],
    [/no speech detected/, "No speech detected"],
    [/speaker mismatch detected/, "Speaker mismatch"],
    [/running local transcription/, "Transcribing"],
    [/local dictation completed/, "Dictation complete"],
    [/local transcription failed/, "Transcription failed"],
    [/microphone test is live/, "Testing microphone"],
    [/microphone test stopped/, "Mic test stopped"],
    [/choose a profile name/, "Enter profile name"],
    [/voice profile recording is live/, "Recording profile"],
    [/saved a local voice sample/, "Voice profile saved"],
    [/pronunciation capture failed/, "Pronunciation failed"],
    [/say \".*\" clearly, then press stop/, "Recording pronunciation"],
    [/transcript copied/, "Transcript copied"],
    [/notes copied/, "Notes copied"],
    [/clipboard pasted into notes/, "Pasted into notes"],
    [/notes saved locally/, "Notes saved"],
    [/saved a local note item/, "Note saved"],
    [/removed the saved note item/, "Saved note removed"],
    [/saved note copied/, "Saved note copied"],
    [/saved \".*\" to your local dictionary and checked how it was heard/, "Dictionary updated"],
    [/saved \".*\" to your local dictionary, but no speech was detected/, "Dictionary updated"],
    [/saved \".*\" to your local dictionary/, "Dictionary saved"],
    [/removed \".*\" from your local dictionary/, "Dictionary removed"],
    [/choose or type the word you want whisparr to learn first/, "Choose a word"],
    [/add the word or phrase you want whisparr to learn before saving/, "Enter a dictionary term"],
    [/auto dictionary learning saved .* new terms/, "Dictionary auto-saved"],
    [/auto dictionary learning saved /, "Dictionary auto-saved"],
    [/achievement unlocked:/, "Achievement unlocked"],
    [/unlocked \d+ achievements/, "Achievements unlocked"],
    [/retro mode unlocked/, "Retro mode unlocked"],
    [/retro mode disabled/, "Retro mode off"]
  ];

  for (const [pattern, replacement] of mappedStatuses) {
    if (pattern.test(lower)) {
      return replacement;
    }
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 10) {
    return normalized;
  }

  return words.slice(0, 10).join(" ");
}

function decayOverflow(value: number, max: number) {
  if (max === 0) {
    return 0;
  }

  const entry = value / max;
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
  return sigmoid * max;
}

function ElasticSettingSlider(props: {
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  ariaLabel: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  onChange: (value: number) => void;
}) {
  const {
    value,
    min = 0,
    max = 100,
    disabled = false,
    ariaLabel,
    leftIcon = <Volume1 size={18} />,
    rightIcon = <Volume2 size={18} />,
    onChange
  } = props;
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [region, setRegion] = useState<"left" | "middle" | "right">("middle");
  const clientX = useMotionValue(0);
  const overflow = useMotionValue(0);
  const scale = useMotionValue(1);
  const percentage = ((value - min) / Math.max(1, max - min)) * 100;

  useMotionValueEvent(clientX, "change", (latest) => {
    if (!sliderRef.current || disabled) {
      return;
    }

    const { left, right } = sliderRef.current.getBoundingClientRect();
    let overflowValue = 0;

    if (latest < left) {
      setRegion("left");
      overflowValue = left - latest;
    } else if (latest > right) {
      setRegion("right");
      overflowValue = latest - right;
    } else {
      setRegion("middle");
    }

    overflow.jump(decayOverflow(overflowValue, MAX_SLIDER_OVERFLOW));
  });

  function updateValue(nextClientX: number) {
    if (!sliderRef.current || disabled) {
      return;
    }

    const { left, width } = sliderRef.current.getBoundingClientRect();
    const rawValue = min + ((nextClientX - left) / width) * (max - min);
    onChange(Math.min(Math.max(Math.round(rawValue), min), max));
    clientX.jump(nextClientX);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    updateValue(event.clientX);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.buttons > 0) {
      updateValue(event.clientX);
    }
  }

  function handlePointerUp() {
    animate(overflow, 0, { type: "spring", bounce: 0.5 });
    setRegion("middle");
  }

  function nudge(delta: number) {
    if (disabled) {
      return;
    }

    onChange(Math.min(max, Math.max(min, value + delta)));
  }

  return (
    <motion.div
      className={disabled ? "elastic-slider-wrapper disabled" : "elastic-slider-wrapper"}
      onHoverStart={() => !disabled && animate(scale, 1.12)}
      onHoverEnd={() => animate(scale, 1)}
      onTouchStart={() => !disabled && animate(scale, 1.12)}
      onTouchEnd={() => animate(scale, 1)}
      style={{
        scale,
        opacity: useTransform(scale, [1, 1.12], [0.82, 1])
      }}
    >
      <motion.div
        className="elastic-slider-icon"
        animate={{
          scale: region === "left" ? [1, 1.28, 1] : 1,
          transition: { duration: 0.22 }
        }}
        style={{
          x: useTransform(() => (region === "left" ? -overflow.get() / scale.get() : 0))
        }}
      >
        {leftIcon}
      </motion.div>

      <div
        ref={sliderRef}
        className="elastic-slider-root"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            nudge(-1);
          }
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            nudge(1);
          }
        }}
      >
        <motion.div
          className="elastic-slider-track-wrapper"
          style={{
            scaleX: useTransform(() => {
              if (!sliderRef.current) {
                return 1;
              }

              const { width } = sliderRef.current.getBoundingClientRect();
              return 1 + overflow.get() / Math.max(1, width);
            }),
            scaleY: useTransform(overflow, [0, MAX_SLIDER_OVERFLOW], [1, 0.84]),
            transformOrigin: useTransform(() => {
              if (!sliderRef.current) {
                return "center";
              }

              const { left, width } = sliderRef.current.getBoundingClientRect();
              return clientX.get() < left + width / 2 ? "right" : "left";
            }),
            height: useTransform(scale, [1, 1.12], [16, 20]),
            marginTop: useTransform(scale, [1, 1.12], [0, -2]),
            marginBottom: useTransform(scale, [1, 1.12], [0, -2])
          }}
        >
          <div className="elastic-slider-track">
            <div className="elastic-slider-range" style={{ width: `${percentage}%` }} />
            <div className="elastic-slider-thumb" style={{ left: `calc(${percentage}% - 15px)` }} />
          </div>
        </motion.div>
      </div>

      <motion.div
        className="elastic-slider-icon"
        animate={{
          scale: region === "right" ? [1, 1.28, 1] : 1,
          transition: { duration: 0.22 }
        }}
        style={{
          x: useTransform(() => (region === "right" ? overflow.get() / scale.get() : 0))
        }}
      >
        {rightIcon}
      </motion.div>
    </motion.div>
  );
}

function shortcutFromPressedCodes(codes: Iterable<string>): ActivationShortcut {
  const codeSet = new Set(codes);
  const modifiers = modifierOrder.filter((modifier) => {
    if (modifier === "meta") {
      return codeSet.has("MetaLeft") || codeSet.has("MetaRight");
    }
    if (modifier === "ctrl") {
      return codeSet.has("ControlLeft") || codeSet.has("ControlRight");
    }
    if (modifier === "alt") {
      return codeSet.has("AltLeft") || codeSet.has("AltRight");
    }
    return codeSet.has("ShiftLeft") || codeSet.has("ShiftRight");
  });
  const key = [...codeSet].find((code) => !isModifierCode(code)) ?? null;

  return {
    modifiers,
    key
  };
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("dictation");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [manualDictionary, setManualDictionary] = useState<ManualDictionaryEntry[]>([]);
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [profileName, setProfileName] = useState("");
  const [dictionaryTerm, setDictionaryTerm] = useState("");
  const [pronunciationTerm, setPronunciationTerm] = useState("");
  const [selectedPronunciationEntryId, setSelectedPronunciationEntryId] = useState("");
  const [isRecordingPronunciation, setIsRecordingPronunciation] = useState(false);
  const [lastPronunciationResult, setLastPronunciationResult] = useState<{
    intended: string;
    heard: string;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  const [savedNoteDraft, setSavedNoteDraft] = useState("");
  const [isSavedNoteComposerOpen, setIsSavedNoteComposerOpen] = useState(false);
  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const [achievementFilter, setAchievementFilter] = useState<"all" | "unlocked" | "locked">("all");
  const [isTestingMicrophone, setIsTestingMicrophone] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [celebratingLevel, setCelebratingLevel] = useState<number | null>(null);
  const [isDevModeUnlockCelebrationVisible, setIsDevModeUnlockCelebrationVisible] = useState(false);
  const [isRetroModeEnabled, setIsRetroModeEnabled] = useState(false);
  const [isRetroCelebrationVisible, setIsRetroCelebrationVisible] = useState(false);
  const [appDiagnostics, setAppDiagnostics] = useState<AppDiagnostics | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLogEntry[]>([]);
  const [status, setStatus] = useState("Loading local workspace...");
  const [transcriptHistory, setTranscriptHistory] = useState<string[]>([]);
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<DictationResult | null>(null);
  const [whisperStatus, setWhisperStatus] = useState<WhisperConfigStatus>({
    binaryExists: false,
    modelExists: false
  });
  const [runtimeDiscovery, setRuntimeDiscovery] = useState<RuntimeDiscoveryResult | null>(null);
  const [runtimeInstallMessage, setRuntimeInstallMessage] = useState("");
  const [isInstallingRuntime, setIsInstallingRuntime] = useState(false);
  const [runtimeInstallProgress, setRuntimeInstallProgress] = useState(0);
  const [runtimeInstallStage, setRuntimeInstallStage] = useState("Waiting to start.");
  const [runtimeInstallTone, setRuntimeInstallTone] = useState<RuntimeFeedbackTone>("idle");
  const [runtimeAutoFindMessage, setRuntimeAutoFindMessage] = useState("");
  const [runtimeAutoFindTone, setRuntimeAutoFindTone] = useState<RuntimeFeedbackTone>("idle");
  const [isAutoFindingRuntime, setIsAutoFindingRuntime] = useState(false);
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [isInstallingAppUpdate, setIsInstallingAppUpdate] = useState(false);
  const [updateDialogState, setUpdateDialogState] = useState<UpdateDialogState>("closed");
  const [updateDialogMessage, setUpdateDialogMessage] = useState("");
  const [isEditingTranscriptHistoryLimit, setIsEditingTranscriptHistoryLimit] = useState(false);
  const [isTranscriptHistoryMenuOpen, setIsTranscriptHistoryMenuOpen] = useState(false);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const [isMovingHud, setIsMovingHud] = useState(false);
  const [isPreviewingHudScale, setIsPreviewingHudScale] = useState(false);
  const [isCapturingShortcut, setIsCapturingShortcut] = useState(false);
  const [draftShortcut, setDraftShortcut] = useState<ActivationShortcut | null>(null);
  const [isTrainingProfile, setIsTrainingProfile] = useState(false);
  const transcriptHistoryRef = useRef<string[]>([]);
  const notesRef = useRef("");
  const hasLoadedInitialDataRef = useRef(false);
  const previousLevelRef = useRef(defaultStats.currentLevel);
  const levelUpAudioRef = useRef<HTMLAudioElement | null>(null);
  const levelUpTimeoutRef = useRef<number | null>(null);
  const devUnlockTimeoutRef = useRef<number | null>(null);
  const retroCelebrationTimeoutRef = useRef<number | null>(null);
  const hudPreviewTimeoutRef = useRef<number | null>(null);
  const transcriptHistoryClickTimeoutRef = useRef<number | null>(null);
  const runtimeInstallProgressIntervalRef = useRef<number | null>(null);
  const shortcutCaptureCodesRef = useRef<Set<string>>(new Set());
  const brandClickCountRef = useRef(0);
  const konamiProgressRef = useRef(0);
  const lastLoggedStatusRef = useRef("");
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
  const visibleStatus = compactStatus(status);
  const transcriptHistoryOptions = [3, 5, 10, 20];

  useEffect(() => {
    recorderRef.current = recorder;
  }, [recorder]);

  useEffect(() => {
    if (isTestingMicrophone && recorder.error) {
      setIsTestingMicrophone(false);
    }
  }, [isTestingMicrophone, recorder.error]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!settings.onboardingCompleted) {
      setIsOnboardingOpen(true);
    }
  }, [settings.onboardingCompleted]);

  useEffect(() => {
    if (!settings.devModeUnlocked && tab === "developer") {
      setTab("help");
    }
  }, [settings.devModeUnlocked, tab]);

  useEffect(() => {
    if (!status || status === lastLoggedStatusRef.current) {
      return;
    }

    lastLoggedStatusRef.current = status;
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    setStatusLogs((current) => [{ timestamp, message: status }, ...current].slice(0, 60));
  }, [status]);

  useEffect(() => {
    if (!settings.devModeUnlocked) {
      return;
    }

    void window.wisprApi.getAppDiagnostics().then(setAppDiagnostics).catch(() => {
      setAppDiagnostics(null);
    });
  }, [settings.devModeUnlocked]);

  useEffect(() => {
    function playRetroZombieSound() {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) {
        return;
      }

      const audioContext = new AudioContextConstructor();
      const duration = 1.4;
      const now = audioContext.currentTime;

      const master = audioContext.createGain();
      master.gain.setValueAtTime(0.0001, now);
      const targetVolume = Math.max(0.0001, (settingsRef.current.appSoundVolume / 100) * 0.18);
      master.gain.exponentialRampToValueAtTime(targetVolume, now + 0.05);
      master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      master.connect(audioContext.destination);

      const oscillator = audioContext.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(210, now);
      oscillator.frequency.exponentialRampToValueAtTime(92, now + duration);

      const subOscillator = audioContext.createOscillator();
      subOscillator.type = "square";
      subOscillator.frequency.setValueAtTime(105, now);
      subOscillator.frequency.exponentialRampToValueAtTime(56, now + duration);

      const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let index = 0; index < noiseData.length; index += 1) {
        noiseData[index] = (Math.random() * 2 - 1) * 0.16;
      }

      const noiseSource = audioContext.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      const noiseFilter = audioContext.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(620, now);
      noiseFilter.Q.setValueAtTime(0.7, now);

      const wobble = audioContext.createOscillator();
      wobble.type = "triangle";
      wobble.frequency.setValueAtTime(5.5, now);
      const wobbleDepth = audioContext.createGain();
      wobbleDepth.gain.setValueAtTime(17, now);
      wobble.connect(wobbleDepth);
      wobbleDepth.connect(oscillator.frequency);

      oscillator.connect(master);
      subOscillator.connect(master);
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(master);

      oscillator.start(now);
      subOscillator.start(now);
      noiseSource.start(now);
      wobble.start(now);

      oscillator.stop(now + duration);
      subOscillator.stop(now + duration);
      noiseSource.stop(now + duration);
      wobble.stop(now + duration);

      window.setTimeout(() => {
        void audioContext.close().catch(() => undefined);
      }, Math.ceil(duration * 1000) + 200);
    }

    function handleKonamiCode(event: KeyboardEvent) {
      const expectedKey = konamiSequence[konamiProgressRef.current];
      const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (normalizedKey === expectedKey) {
        konamiProgressRef.current += 1;
        if (konamiProgressRef.current === konamiSequence.length) {
          konamiProgressRef.current = 0;
          setIsRetroModeEnabled(true);
          setIsRetroCelebrationVisible(true);
          playRetroZombieSound();
          if (retroCelebrationTimeoutRef.current) {
            window.clearTimeout(retroCelebrationTimeoutRef.current);
          }
          retroCelebrationTimeoutRef.current = window.setTimeout(() => {
            setIsRetroCelebrationVisible(false);
            retroCelebrationTimeoutRef.current = null;
          }, 5200);
          setStatus("Retro mode unlocked.");
        }
        return;
      }

      konamiProgressRef.current = normalizedKey === konamiSequence[0] ? 1 : 0;
    }

    window.addEventListener("keydown", handleKonamiCode);
    return () => {
      if (retroCelebrationTimeoutRef.current) {
        window.clearTimeout(retroCelebrationTimeoutRef.current);
        retroCelebrationTimeoutRef.current = null;
      }
      window.removeEventListener("keydown", handleKonamiCode);
    };
  }, []);

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
    levelUpAudioRef.current.volume = clampSoundVolume(settingsRef.current.appSoundVolume) / 100;

    return () => {
      levelUpAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = levelUpAudioRef.current;
    if (audio) {
      audio.volume = clampSoundVolume(settings.appSoundVolume) / 100;
    }
  }, [settings.appSoundVolume]);

  useEffect(() => {
    transcriptHistoryRef.current = transcriptHistory;
  }, [transcriptHistory]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

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
    if (!hasLoadedInitialDataRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void window.wisprApi.saveNotes(notesRef.current);
    }, 100);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [notes]);

  useEffect(() => {
    function flushNotesIfNeeded() {
      if (!hasLoadedInitialDataRef.current) {
        return;
      }

      void window.wisprApi.saveNotes(notesRef.current);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushNotesIfNeeded();
      }
    }

    window.addEventListener("beforeunload", flushNotesIfNeeded);
    window.addEventListener("pagehide", flushNotesIfNeeded);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", flushNotesIfNeeded);
      window.removeEventListener("pagehide", flushNotesIfNeeded);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const visible = recorder.state === "recording" || settings.alwaysShowPill || isPreviewingHudScale;
    void window.wisprApi.updateHud({
      visible,
      level: recorder.state === "recording" ? recorder.level : 0,
      label: recorder.state === "recording" ? "Listening" : "Ready",
      soundEnabled: !settings.muteDictationSounds,
      soundVolume: clampSoundVolume(settings.appSoundVolume) / 100,
      hudScale: clampHudScale(settings.hudScale)
    });
  }, [
    isPreviewingHudScale,
    recorder.level,
    recorder.state,
    settings.alwaysShowPill,
    settings.appSoundVolume,
    settings.hudScale,
    settings.muteDictationSounds
  ]);

  useEffect(() => {
    if (!hasLoadedInitialDataRef.current) {
      previousLevelRef.current = stats.currentLevel;
      return;
    }

    if (stats.currentLevel > previousLevelRef.current) {
      const audio = levelUpAudioRef.current;
      if (audio && !settingsRef.current.muteDictationSounds) {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }

      if (levelUpTimeoutRef.current) {
        window.clearTimeout(levelUpTimeoutRef.current);
      }
      setCelebratingLevel(stats.currentLevel);
      levelUpTimeoutRef.current = window.setTimeout(() => {
        setCelebratingLevel(null);
        levelUpTimeoutRef.current = null;
      }, 5000);
    }

    previousLevelRef.current = stats.currentLevel;
  }, [stats.currentLevel]);

  useEffect(() => {
    return () => {
      if (transcriptHistoryClickTimeoutRef.current) {
        window.clearTimeout(transcriptHistoryClickTimeoutRef.current);
      }
      if (hudPreviewTimeoutRef.current) {
        window.clearTimeout(hudPreviewTimeoutRef.current);
      }
      if (levelUpTimeoutRef.current) {
        window.clearTimeout(levelUpTimeoutRef.current);
      }
      if (devUnlockTimeoutRef.current) {
        window.clearTimeout(devUnlockTimeoutRef.current);
      }
      if (runtimeInstallProgressIntervalRef.current) {
        window.clearInterval(runtimeInstallProgressIntervalRef.current);
      }
    };
  }, []);

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
    const unsubscribeAutoLearn = window.wisprApi.onAutoDictionaryLearned((terms) => {
      void refreshLocalData();
      if (terms.length === 1) {
        setStatus(`Auto dictionary learning saved "${terms[0]}".`);
      } else if (terms.length > 1) {
        setStatus(`Auto dictionary learning saved ${terms.length} new terms.`);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeAutoLearn();
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedInitialDataRef.current) {
      return;
    }

    const currentlyUnlocked: AchievementUnlockInput[] = achievements
      .filter((achievement) => isAchievementUnlocked(achievement.title))
      .map((achievement) => ({
        title: achievement.title,
        xp: achievementXpByDifficulty[achievement.difficulty]
      }));

    void window.wisprApi.syncAchievements(currentlyUnlocked).then((result) => {
      setUnlockedAchievements(result.unlockedAchievements);
      setStats(result.stats);

      if (result.newlyUnlocked.length === 0) {
        return;
      }

      const rewardXp = result.newlyUnlocked.reduce((total, title) => {
        const achievement = achievements.find((item) => item.title === title);
        return total + (achievement ? achievementXpByDifficulty[achievement.difficulty] : 0);
      }, 0);

      if (result.newlyUnlocked.length === 1) {
        setStatus(`Achievement unlocked: ${result.newlyUnlocked[0]} (+${rewardXp} XP).`);
      } else {
        setStatus(`Unlocked ${result.newlyUnlocked.length} achievements (+${rewardXp} XP).`);
      }
    });
  }, [manualDictionary.length, notes, profiles.length, savedNotes.length, stats.currentLevel, stats.currentStreakDays, stats.totalWords, whisperStatus.binaryExists, whisperStatus.modelExists]);

  useEffect(() => {
    if (!isCapturingShortcut) {
      return;
    }

    shortcutCaptureCodesRef.current = new Set();

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.code === "Escape") {
        setIsCapturingShortcut(false);
        setDraftShortcut(null);
        shortcutCaptureCodesRef.current = new Set();
        return;
      }

      if (event.repeat) {
        return;
      }

      const nextCodes = new Set(shortcutCaptureCodesRef.current);
      nextCodes.add(event.code);
      shortcutCaptureCodesRef.current = nextCodes;
      const nextShortcut = shortcutFromPressedCodes(nextCodes);
      if (nextShortcut.modifiers.length === 0 && !nextShortcut.key) {
        return;
      }

      setDraftShortcut(nextShortcut);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const snapshot = new Set(shortcutCaptureCodesRef.current);
      if (snapshot.size === 0) {
        return;
      }

      const nextShortcut = shortcutFromPressedCodes(snapshot);
      const remainingCodes = new Set(snapshot);
      remainingCodes.delete(event.code);
      shortcutCaptureCodesRef.current = remainingCodes;

      if (nextShortcut.modifiers.length === 0 && !nextShortcut.key) {
        return;
      }

      setDraftShortcut(nextShortcut);
      void saveShortcut(nextShortcut);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      shortcutCaptureCodesRef.current = new Set();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isCapturingShortcut]);

  async function loadInitialData() {
    const runtimeResult = await window.wisprApi.discoverRuntime();
    const data = await window.wisprApi.loadData();
    setSettings(data.settings);
    setProfiles(data.voiceProfiles);
    setManualDictionary(data.manualDictionary);
    setStats(data.stats);
    setUnlockedAchievements(data.unlockedAchievements);
    setTranscriptHistory(data.transcriptHistory.slice(0, data.settings.transcriptHistoryLimit));
    setNotes(data.notes);
    setSavedNotes(data.savedNotes);
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
    setUnlockedAchievements(data.unlockedAchievements);
    setTranscriptHistory(data.transcriptHistory.slice(0, data.settings.transcriptHistoryLimit));
    setNotes(data.notes);
    setSavedNotes(data.savedNotes);
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
    setDraftShortcut(shortcut);
    setIsCapturingShortcut(false);
    setStatus(`Activation shortcut updated to ${shortcutToLabel(shortcut)}.`);
  }

  async function autoConfigureRuntime() {
    setIsAutoFindingRuntime(true);
    setRuntimeAutoFindTone("working");
    setRuntimeAutoFindMessage("Scanning common runtime locations...");

    try {
      const result = await window.wisprApi.discoverRuntime();
      setRuntimeDiscovery(result);
      await refreshLocalData();

      if (result.selected) {
        setRuntimeAutoFindTone("success");
        setRuntimeAutoFindMessage(`Runtime found and configured from ${result.selected.source}.`);
        setStatus(`Configured local runtime from ${result.selected.source}.`);
      } else {
        setRuntimeAutoFindTone("error");
        setRuntimeAutoFindMessage("No local engine was found. Try Install everything instead.");
        setStatus("No bundled or local runtime was found yet.");
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Runtime auto-find failed.";
      setRuntimeAutoFindTone("error");
      setRuntimeAutoFindMessage(message);
      setStatus(message);
    } finally {
      setIsAutoFindingRuntime(false);
    }
  }

  function previewHudScale() {
    setIsPreviewingHudScale(true);
    if (hudPreviewTimeoutRef.current) {
      window.clearTimeout(hudPreviewTimeoutRef.current);
    }
    hudPreviewTimeoutRef.current = window.setTimeout(() => {
      setIsPreviewingHudScale(false);
      hudPreviewTimeoutRef.current = null;
    }, 1100);
  }

  async function installEverything() {
    setIsInstallingRuntime(true);
    setRuntimeInstallTone("working");
    setRuntimeInstallProgress(8);
    setRuntimeInstallStage("Preparing local engine download...");
    setRuntimeInstallMessage("Installing local runtime, configuring paths, and verifying the engine...");
    setRuntimeAutoFindMessage("");
    setRuntimeAutoFindTone("idle");

    if (runtimeInstallProgressIntervalRef.current) {
      window.clearInterval(runtimeInstallProgressIntervalRef.current);
    }

    const stagedProgress = [
      { progress: 22, stage: "Downloading the local speech runtime..." },
      { progress: 46, stage: "Downloading the speech model..." },
      { progress: 68, stage: "Configuring runtime files..." },
      { progress: 86, stage: "Running a local verification check..." }
    ];
    let stageIndex = 0;
    runtimeInstallProgressIntervalRef.current = window.setInterval(() => {
      const nextStage = stagedProgress[stageIndex];
      if (!nextStage) {
        if (runtimeInstallProgressIntervalRef.current) {
          window.clearInterval(runtimeInstallProgressIntervalRef.current);
          runtimeInstallProgressIntervalRef.current = null;
        }
        return;
      }

      setRuntimeInstallProgress((current) => Math.max(current, nextStage.progress));
      setRuntimeInstallStage(nextStage.stage);
      stageIndex += 1;
    }, 900);

    try {
      const result: RuntimeInstallResult = await window.wisprApi.installRuntime();
      setRuntimeDiscovery(result.discovery);
      setRuntimeInstallMessage(result.message);
      setRuntimeInstallProgress(100);
      setRuntimeInstallStage(result.ready ? "Local engine verified and ready." : "Install finished.");
      setRuntimeInstallTone(result.ready ? "success" : "error");
      await refreshLocalData();
      setStatus(
        result.ready
          ? "Local speech engine is installed and verified. You can dictate right away."
          : "Local speech engine installation finished, but readiness could not be confirmed."
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Runtime installation failed.";
      setRuntimeInstallMessage(message);
      setRuntimeInstallProgress(100);
      setRuntimeInstallStage("Install failed.");
      setRuntimeInstallTone("error");
      setStatus(message);
    } finally {
      if (runtimeInstallProgressIntervalRef.current) {
        window.clearInterval(runtimeInstallProgressIntervalRef.current);
        runtimeInstallProgressIntervalRef.current = null;
      }
      setIsInstallingRuntime(false);
    }
  }

  async function checkForUpdates() {
    try {
      setIsCheckingForUpdates(true);
      const info = await window.wisprApi.checkForAppUpdates();
      setAppUpdateInfo(info);
      setStatus(info.message);
      if (info.hasUpdate && info.downloadUrl) {
        setUpdateDialogMessage(info.message);
        setUpdateDialogState("available");
      } else if (info.hasUpdate) {
        setUpdateDialogMessage(info.message);
        setUpdateDialogState("error");
      } else {
        setUpdateDialogMessage("No new updates are available right now.");
        setUpdateDialogState("none");
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Update check failed.";
      setStatus(message);
      setUpdateDialogMessage(message);
      setUpdateDialogState("error");
    } finally {
      setIsCheckingForUpdates(false);
    }
  }

  async function downloadAndInstallUpdate() {
    try {
      setIsInstallingAppUpdate(true);
      const message = await window.wisprApi.downloadAndInstallAppUpdate();
      setStatus(message);
      setUpdateDialogMessage(message);
      setUpdateDialogState("closed");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Update install failed.";
      setStatus(message);
      setUpdateDialogMessage(message);
      setUpdateDialogState("error");
    } finally {
      setIsInstallingAppUpdate(false);
    }
  }

  async function completeOnboarding() {
    await patchSettings({ onboardingCompleted: true });
    setIsOnboardingOpen(false);
    setOnboardingStep(0);
    setStatus("Setup complete. WhispARR is ready.");
  }

  function goToNextOnboardingStep() {
    setOnboardingStep((current) => Math.min(onboardingSteps.length - 1, current + 1));
  }

  function goToPreviousOnboardingStep() {
    setOnboardingStep((current) => Math.max(0, current - 1));
  }

  async function toggleHudMoveMode() {
    if (isMovingHud) {
      const nextSettings = await window.wisprApi.stopHudMoveMode();
      setSettings(nextSettings);
      setIsMovingHud(false);
      setStatus("Pill location saved.");
      return;
    }

    await window.wisprApi.startHudMoveMode();
    setIsMovingHud(true);
    setStatus("Drag the pill where you want it, then click stop to save.");
  }

  async function recenterHudPill() {
    if (isMovingHud) {
      const nextSettings = await window.wisprApi.stopHudMoveMode();
      setSettings(nextSettings);
      setIsMovingHud(false);
    }

    await patchSettings({ hudPosition: null });
    setStatus("Pill location reset to the default center position.");
  }

  async function handleBrandMarkClick() {
    if (settings.devModeUnlocked) {
      return;
    }

    brandClickCountRef.current += 1;
    if (brandClickCountRef.current < 20) {
      return;
    }

    brandClickCountRef.current = 0;
    await patchSettings({
      devModeUnlocked: true,
      devModeEnabled: true
    });
    setIsDevModeUnlockCelebrationVisible(true);
    setStatus("Developer mode unlocked.");

    if (devUnlockTimeoutRef.current) {
      window.clearTimeout(devUnlockTimeoutRef.current);
    }
    devUnlockTimeoutRef.current = window.setTimeout(() => {
      setIsDevModeUnlockCelebrationVisible(false);
      devUnlockTimeoutRef.current = null;
    }, 4000);
  }

  async function beginGlobalDictation() {
    if (isRecordingRef.current) {
      return;
    }

    if (isTestingMicrophone) {
      await stopMicrophoneTest();
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
        setStatus(
          currentSettings.autoLearnDictionary
            ? "Transcribed locally and pasted. Copy your corrected text within 45 seconds to auto-learn dictionary terms."
            : "Transcribed locally and pasted into the active app."
        );
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

  async function startMicrophoneTest() {
    if (isRecordingRef.current || recorderRef.current.state === "recording") {
      return;
    }

    setIsTestingMicrophone(true);
    await recorderRef.current.start();
    setStatus("Microphone test is live. Speak to check for input.");
  }

  async function stopMicrophoneTest() {
    if (recorderRef.current.state !== "recording") {
      setIsTestingMicrophone(false);
      return;
    }

    await recorderRef.current.stop();
    recorderRef.current.reset();
    setIsTestingMicrophone(false);
    setStatus("Microphone test stopped.");
  }

  async function trainProfile() {
    if (!profileName.trim()) {
      setStatus("Choose a profile name before training.");
      return;
    }

    if (isTrainingProfile || isRecordingPronunciation) {
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

  async function toggleProfileTraining() {
    if (isTrainingProfile) {
      await stopProfileTraining();
      return;
    }

    await trainProfile();
  }

  async function togglePronunciationCapture() {
    if (isTrainingProfile) {
      return;
    }

    if (isRecordingPronunciation) {
      try {
        const sample = await recorder.stop();
        const intended = pronunciationTerm.trim();
        const existingMatch = manualDictionary.find(
          (entry) => entry.term.toLowerCase() === intended.toLowerCase()
        );
        const savedEntry = await window.wisprApi.saveManualDictionaryEntry({
          id: existingMatch?.id,
          term: intended
        });

        setManualDictionary((current) => [savedEntry, ...current.filter((item) => item.id !== savedEntry.id)]);
        setSelectedPronunciationEntryId(savedEntry.id);

        if (!hasAudibleSpeech(sample.pcm)) {
          setLastPronunciationResult({
            intended: savedEntry.term,
            heard: "No speech detected"
          });
          setStatus(`Saved "${savedEntry.term}" to your local dictionary, but no speech was detected to check pronunciation.`);
          return;
        }

        const transcription = await window.wisprApi.transcribe({
          pcm: Array.from(sample.pcm),
          sampleRate: sample.sampleRate
        });
        setLastPronunciationResult({
          intended: savedEntry.term,
          heard: transcription.transcript.trim() || "No clear transcript detected"
        });
        setStatus(`Saved "${savedEntry.term}" to your local dictionary and checked how it was heard.`);
      } catch (caught) {
        setStatus(caught instanceof Error ? caught.message : "Pronunciation capture failed.");
      } finally {
        setIsRecordingPronunciation(false);
        recorder.reset();
      }
      return;
    }

    const intended = pronunciationTerm.trim();
    if (!intended) {
      setStatus("Choose or type the word you want WhispARR to learn first.");
      return;
    }

    setLastPronunciationResult(null);
    await recorder.start();
    setIsRecordingPronunciation(true);
    setStatus(`Pronunciation capture is live. Say "${intended}" clearly, then press stop.`);
  }

  const activeShortcutLabel = shortcutToLabel(settings.activationShortcut);
  const draftShortcutLabel = draftShortcut ? shortcutToLabel(draftShortcut) : null;
  const appSoundVolume = clampSoundVolume(settings.appSoundVolume);
  const hudScale = clampHudScale(settings.hudScale);
  const currentLevelFloor = getLevelThreshold(stats.currentLevel);
  const nextLevelThreshold = getNextLevelThreshold(stats.currentLevel);
  const xpIntoCurrentLevel = Math.max(0, stats.totalXp - currentLevelFloor);
  const xpNeededForCurrentLevel = Math.max(1, nextLevelThreshold - currentLevelFloor);
  const xpRemainingToNextLevel = Math.max(0, nextLevelThreshold - stats.totalXp);
  const currentOnboardingStep = onboardingSteps[onboardingStep];
  const runtimeReady = whisperStatus.binaryExists && whisperStatus.modelExists;
  const runtimeInstallHealthy = runtimeReady && runtimeInstallTone !== "error";
  const runtimeAutoFindHealthy = runtimeReady && runtimeAutoFindTone !== "error";
  const showRuntimeDetails =
    !runtimeReady ||
    isInstallingRuntime ||
    isAutoFindingRuntime ||
    runtimeInstallTone === "error" ||
    runtimeAutoFindTone === "error";
  const microphoneReady = devices.length > 0;
  const shortcutReady =
    settings.activationShortcut.modifiers.length > 0 || Boolean(settings.activationShortcut.key);
  const profileReady = profiles.length > 0;
  const isAchievementUnlocked = (achievementTitle: string) => {
    switch (achievementTitle) {
      case "First Words":
        return stats.totalWords >= 100;
      case "Warm Up":
        return stats.totalWords >= 250;
      case "Getting Comfortable":
        return stats.totalWords >= 500;
      case "Quick Notes":
        return savedNotes.length >= 3;
      case "Clean Start":
        return profiles.length >= 1;
      case "Ready To Roll":
        return runtimeReady && stats.totalWords > 0;
      case "Routine Builder":
        return stats.currentStreakDays >= 3;
      case "One Thousand Club":
        return stats.totalWords >= 1000;
      case "Local Legend":
        return manualDictionary.length >= 5;
      case "Weekender":
        return stats.currentStreakDays >= 5;
      case "First Level Up":
        return stats.currentLevel >= 2;
      case "Steady Flow":
        return stats.totalWords >= 2500;
      case "Helpful Habit":
        return savedNotes.length >= 10;
      case "Seven Day Rhythm":
        return stats.currentStreakDays >= 7;
      case "Daily Driver":
        return stats.currentStreakDays >= 10;
      case "Word Worker":
        return stats.totalWords >= 5000;
      case "Snippet Saver":
        return savedNotes.length >= 15;
      case "Correction Coach":
        return manualDictionary.length >= 15;
      case "Two Level Lead":
        return stats.currentLevel >= 3;
      case "Ten Thousand Strong":
        return stats.totalWords >= 10000;
      case "Reliable Voice":
        return profiles.length >= 2;
      case "Workspace Pro":
        return notes.trim().length >= 1000;
      case "Two Week Run":
        return stats.currentStreakDays >= 14;
      case "Frequent Flyer":
        return stats.currentStreakDays >= 20;
      case "Level Climber":
        return stats.currentLevel >= 5;
      case "Twenty K":
        return stats.totalWords >= 20000;
      case "Iron Streak":
        return stats.currentStreakDays >= 21;
      case "Thirty Thousand":
        return stats.totalWords >= 30000;
      case "Voice Vault":
        return savedNotes.length >= 25;
      case "Level Seven":
        return stats.currentLevel >= 7;
      case "Forty Thousand":
        return stats.totalWords >= 40000;
      case "Perfect Three Weeks":
        return stats.currentStreakDays >= 21;
      case "Reach Level 100":
        return stats.currentLevel >= 100;
      case "Fifty Thousand":
        return stats.totalWords >= 50000;
      case "Orbital":
        return stats.totalWords >= 250000;
      default:
        return false;
    }
  };

  const unlockedAchievementCount = unlockedAchievements.length;
  const filteredAchievements = achievements.filter((achievement) => {
    const isUnlocked = isAchievementUnlocked(achievement.title);

    switch (achievementFilter) {
      case "unlocked":
        return isUnlocked;
      case "locked":
        return !isUnlocked;
      default:
        return true;
    }
  });
  const mainNavItems = navItems.filter((item) => item.key !== "developer");
  const developerNavItem = settings.devModeUnlocked
    ? navItems.find((item) => item.key === "developer") ?? null
    : null;

  async function copyTranscript(text: string) {
    await navigator.clipboard.writeText(text);
    setStatus("Transcript copied to clipboard.");
  }

  async function copyNotes() {
    await navigator.clipboard.writeText(notes);
    setStatus("Notes copied to clipboard.");
  }

  async function pasteIntoNotes() {
    const clipboardText = await navigator.clipboard.readText();
    setNotes((current) => {
      if (!current.trim()) {
        return clipboardText;
      }

      if (!clipboardText.trim()) {
        return current;
      }

      return `${current}${current.endsWith("\n") ? "" : "\n"}${clipboardText}`;
    });
    setStatus("Clipboard pasted into notes.");
  }

  async function saveNotesNow() {
    await window.wisprApi.saveNotes(notesRef.current);
    setStatus("Notes saved locally.");
  }

  async function addSavedNote() {
    const nextNote = savedNoteDraft.trim();
    if (!nextNote) {
      setStatus("Add a note before saving it to the right-side list.");
      return;
    }

    const nextSavedNotes = [nextNote, ...savedNotes];
    await window.wisprApi.saveSavedNotes(nextSavedNotes);
    setSavedNotes(nextSavedNotes);
    setSavedNoteDraft("");
    setIsSavedNoteComposerOpen(false);
    setStatus("Saved a local note item.");
  }

  function handleTranscriptHistoryCustomClick() {
    if (transcriptHistoryClickTimeoutRef.current) {
      window.clearTimeout(transcriptHistoryClickTimeoutRef.current);
    }
    transcriptHistoryClickTimeoutRef.current = window.setTimeout(() => {
      setIsTranscriptHistoryMenuOpen((current) => !current);
      transcriptHistoryClickTimeoutRef.current = null;
    }, 220);
  }

  function handleTranscriptHistoryCustomDoubleClick() {
    if (transcriptHistoryClickTimeoutRef.current) {
      window.clearTimeout(transcriptHistoryClickTimeoutRef.current);
      transcriptHistoryClickTimeoutRef.current = null;
    }
    setIsTranscriptHistoryMenuOpen(false);
    setIsEditingTranscriptHistoryLimit(true);
  }

  async function removeSavedNote(index: number) {
    const nextSavedNotes = savedNotes.filter((_, noteIndex) => noteIndex !== index);
    await window.wisprApi.saveSavedNotes(nextSavedNotes);
    setSavedNotes(nextSavedNotes);
    setStatus("Removed the saved note item.");
  }

  async function copySavedNote(note: string) {
    await navigator.clipboard.writeText(note);
    setStatus("Saved note copied to clipboard.");
  }

  async function saveDictionaryEntry() {
    if (!dictionaryTerm.trim()) {
      setStatus("Add the word or phrase you want WhispARR to learn before saving.");
      return;
    }

    const entry = await window.wisprApi.saveManualDictionaryEntry({
      term: dictionaryTerm
    });
    setManualDictionary((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
    setDictionaryTerm("");
    setStatus(`Saved "${entry.term}" to your local dictionary.`);
  }

  return (
    <div className={isRetroModeEnabled ? "app-shell retro-mode" : "app-shell"}>
      <div className="titlebar-drag" aria-hidden="true" />
      <aside className="sidebar">
        <div>
          <button className="brand-mark-button" type="button" onClick={() => void handleBrandMarkClick()}>
            <div className="brand-mark">
            <img src={appIconUrl} alt="WhispARR icon" className="brand-mark-image" />
            <p className="eyebrow">WhispARR</p>
            </div>
          </button>
          <div className="sidebar-status">
            <p className="eyebrow">Status</p>
            <h1>{visibleStatus}</h1>
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
          </div>
        </div>
        <nav className="nav">
          {mainNavItems.map(({ key, label, Icon, iconClassName }) => (
            <button
              key={key}
              className={tab === key ? "nav-button active" : "nav-button"}
              onClick={() => setTab(key)}
            >
              <span className="nav-button-content">
                <span className="nav-icon" aria-hidden="true">
                  <Icon className={`nav-icon-glyph ${iconClassName}`} strokeWidth={1.8} />
                </span>
                <span>{label}</span>
              </span>
            </button>
          ))}
          <button
            className="nav-button sidebar-update-button"
            type="button"
            onClick={() => void checkForUpdates()}
            disabled={isCheckingForUpdates}
          >
            <span className="nav-button-content">
              <span className="nav-icon" aria-hidden="true">
                <HelpQuestionIcon className="nav-icon-glyph nav-icon-help" />
              </span>
              <span>{isCheckingForUpdates ? "Checking..." : "Check for updates"}</span>
            </span>
          </button>
          {appUpdateInfo?.hasUpdate && appUpdateInfo.downloadUrl && (
            <button
              className="secondary-button sidebar-update-button sidebar-update-install-button"
              type="button"
              onClick={() => void downloadAndInstallUpdate()}
              disabled={isInstallingAppUpdate}
            >
              {isInstallingAppUpdate ? "Preparing installer..." : "Download and install update"}
            </button>
          )}
          {developerNavItem && (
            <button
              key={developerNavItem.key}
              className={tab === developerNavItem.key ? "nav-button active nav-button-last" : "nav-button nav-button-last"}
              onClick={() => setTab(developerNavItem.key)}
            >
              <span className="nav-button-content">
                <span className="nav-icon" aria-hidden="true">
                  <developerNavItem.Icon className={`nav-icon-glyph ${developerNavItem.iconClassName}`} strokeWidth={1.8} />
                </span>
                <span>{developerNavItem.label}</span>
              </span>
            </button>
          )}
        </nav>
        {isRetroModeEnabled && (
          <button
            className="secondary-button retro-exit-button"
            type="button"
            onClick={() => {
              setIsRetroModeEnabled(false);
              setStatus("Retro mode disabled.");
            }}
          >
            Exit retro mode
          </button>
        )}
      </aside>
      <main className="content">
        <section className="top-stats">
          <article className={celebratingLevel ? "top-stat level-stat celebrating" : "top-stat level-stat"}>
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
            <span>Total Words</span>
            <strong>{stats.totalWords.toLocaleString()}</strong>
          </article>
          <article className="top-stat">
            <span>Streak</span>
            <strong>{stats.currentStreakDays} days</strong>
          </article>
          <article className="top-stat">
            <span>Total Achievements</span>
            <strong>{unlockedAchievementCount}</strong>
          </article>
        </section>
        {tab === "dictation" && (
          <section className="panel-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Activation</p>
                  <h3>{activeShortcutLabel} To Dictate</h3>
                </div>
                <button
                  className="icon-button"
                  onClick={() => void refreshDevices()}
                  type="button"
                  aria-label="Refresh devices"
                  title="Refresh devices"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path
                      d="M20 12a8 8 0 1 1-2.34-5.66"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M20 4v5h-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
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
                <button className="ghost-button" onClick={() => setTab("settings")}>
                  Edit shortcut
                </button>
                <button
                  className={isTestingMicrophone ? "secondary-button" : "primary-button"}
                  onClick={() =>
                    void (isTestingMicrophone ? stopMicrophoneTest() : startMicrophoneTest())
                  }
                  disabled={!isTestingMicrophone && recorder.state === "recording"}
                >
                  {isTestingMicrophone ? "Stop microphone test" : "Test microphone"}
                </button>
              </div>
              {isTestingMicrophone && (
                <div className="microphone-test-card">
                  <div className="microphone-test-header">
                    <strong>Microphone input</strong>
                    <span>{recorder.level > 0.03 ? "Input detected" : "Listening..."}</span>
                  </div>
                  <div className="microphone-test-meter" aria-hidden="true">
                    <div
                      className="microphone-test-fill"
                      style={{ width: `${Math.max(8, recorder.level * 100)}%` }}
                    />
                  </div>
                </div>
              )}
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
                    <div className="history-limit-control">
                      {isEditingTranscriptHistoryLimit ? (
                        <input
                          type="number"
                          min="1"
                          max="500"
                          step="1"
                          value={settings.transcriptHistoryLimit}
                          autoFocus
                          onChange={(event) =>
                            void patchSettings({
                              transcriptHistoryLimit: clampTranscriptHistoryLimit(
                                Number(event.target.value || settings.transcriptHistoryLimit)
                              )
                            })
                          }
                          onBlur={() => setIsEditingTranscriptHistoryLimit(false)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="history-limit-custom"
                          onClick={handleTranscriptHistoryCustomClick}
                          onDoubleClick={handleTranscriptHistoryCustomDoubleClick}
                          title="Click once for presets or double-click to enter a custom history limit"
                        >
                          {settings.transcriptHistoryLimit}
                        </button>
                      )}
                      {isTranscriptHistoryMenuOpen && !isEditingTranscriptHistoryLimit && (
                        <div className="history-limit-presets history-limit-presets-dropdown">
                          {transcriptHistoryOptions.map((count) => (
                            <button
                              key={count}
                              type="button"
                              className={
                                settings.transcriptHistoryLimit === count
                                  ? "history-limit-chip active"
                                  : "history-limit-chip"
                              }
                              onClick={() =>
                                void patchSettings({
                                  transcriptHistoryLimit: count
                                }).then(() => {
                                  setIsEditingTranscriptHistoryLimit(false);
                                  setIsTranscriptHistoryMenuOpen(false);
                                })
                              }
                            >
                              {count}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
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
                  className={isTrainingProfile ? "secondary-button" : "primary-button"}
                  onClick={() => void toggleProfileTraining()}
                  disabled={!isTrainingProfile && recorder.state === "recording"}
                >
                  {isTrainingProfile ? "Stop training" : "Start training"}
                </button>
              </div>
              <p className="supporting">
                Training stores a local voiceprint on this device. Start recording when you are ready,
                read the paragraph at your normal pace, and press the same button again when finished.
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
              <div className="dictionary-header">
                <p className="eyebrow">Pronunciation</p>
                <h3>Teach A Word You Say Differently</h3>
              </div>
              <p className="supporting">
                Pick a term from your local dictionary or type a new one, then record yourself saying
                it. WhispARR will save that intended term into the local dictionary and show what the
                local engine heard so you can quickly tune repeated misses.
              </p>
              <div className="dictionary-form">
                <label className="field">
                  <span>Use a saved dictionary term</span>
                  <select
                    value={selectedPronunciationEntryId}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      setSelectedPronunciationEntryId(nextId);
                      const selectedEntry = manualDictionary.find((entry) => entry.id === nextId);
                      if (selectedEntry) {
                        setPronunciationTerm(selectedEntry.term);
                      }
                    }}
                  >
                    <option value="">Choose from local dictionary</option>
                    {manualDictionary.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.addedBySystem ? `★ ${entry.term}` : entry.term}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Word or phrase</span>
                  <input
                    value={pronunciationTerm}
                    onChange={(event) => {
                      setPronunciationTerm(event.target.value);
                      setSelectedPronunciationEntryId("");
                    }}
                    placeholder="Example: WhispARR"
                  />
                </label>
              </div>
              <div className="button-row">
                <button
                  className={isRecordingPronunciation ? "secondary-button" : "primary-button"}
                  onClick={() => void togglePronunciationCapture()}
                  disabled={!isRecordingPronunciation && recorder.state === "recording"}
                >
                  {isRecordingPronunciation ? "Stop and check word" : "Say this word"}
                </button>
              </div>
              {isRecordingPronunciation && (
                <div className="microphone-test-card">
                  <div className="microphone-test-header">
                    <strong>Pronunciation input</strong>
                    <span>{recorder.level > 0.03 ? "Input detected" : "Listening..."}</span>
                  </div>
                  <div className="microphone-test-meter" aria-hidden="true">
                    <div
                      className="microphone-test-fill"
                      style={{ width: `${Math.max(8, recorder.level * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {lastPronunciationResult && (
                <div className="pronunciation-result">
                  <div>
                    <strong>Intended word</strong>
                    <p>{lastPronunciationResult.intended}</p>
                  </div>
                  <div>
                    <strong>Heard locally</strong>
                    <p>{lastPronunciationResult.heard}</p>
                  </div>
                </div>
              )}
            </section>
          </section>
        )}
        {tab === "dictionary" && (
          <section className="panel-grid settings-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Dictionary</p>
                  <h3>Known Words And Phrases</h3>
                </div>
              </div>
              <p className="supporting">
                Add names, brands, terms, or phrases you want WhispARR to learn. You only need to
                enter the preferred word or phrase itself. The app keeps this list locally and uses
                it as a preferred vocabulary during transcript cleanup.
              </p>
              <label className="field">
                <span>Word or phrase to learn</span>
                <input
                  value={dictionaryTerm}
                  onChange={(event) => setDictionaryTerm(event.target.value)}
                  placeholder="Example: WhispARR"
                />
              </label>
              <div className="button-row">
                <button className="primary-button" onClick={() => void saveDictionaryEntry()}>
                  Save to dictionary
                </button>
              </div>
            </section>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Saved Terms</p>
                  <h3>Your Local Dictionary</h3>
                </div>
              </div>
              <div className="dictionary-list">
                {manualDictionary.length === 0 && (
                  <p className="supporting">
                    No dictionary entries yet. Add words, names, or phrases you want WhispARR to keep in mind.
                  </p>
                )}
                {manualDictionary.map((entry) => (
                  <div key={entry.id} className="dictionary-card">
                    <div>
                      <strong>
                        {entry.term}
                        {entry.addedBySystem && <span className="dictionary-star" aria-label="System added"> ★</span>}
                      </strong>
                      <p>{entry.addedBySystem ? "System-added term" : "Preferred local term"}</p>
                    </div>
                    <button
                      className="ghost-button danger"
                      onClick={async () => {
                        const next = await window.wisprApi.deleteManualDictionaryEntry(entry.id);
                        setManualDictionary(next);
                        setStatus(`Removed "${entry.term}" from your local dictionary.`);
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
        {tab === "notes" && (
          <section className="panel-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Notes</p>
                  <h3>Local Notes Workspace</h3>
                </div>
                <div className="button-row compact">
                  <button className="ghost-button" onClick={() => void pasteIntoNotes()}>
                    Paste from clipboard
                  </button>
                  <button className="ghost-button" onClick={() => void copyNotes()}>
                    Copy notes
                  </button>
                  <button className="primary-button" onClick={() => void saveNotesNow()}>
                    Save now
                  </button>
                </div>
              </div>
              <p className="supporting">
                Keep personal notes inside WhispARR and come back to them later. Notes are saved
                locally on this device and auto-save while you type.
              </p>
              <label className="field">
                <span>Your notes</span>
                <textarea
                  className="notes-textarea"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Write anything here. You can paste text in, keep reminders, or save snippets you want to reuse later."
                />
              </label>
              <div className="notes-workspace-actions">
                <button
                  className="notes-add-button"
                  type="button"
                  onClick={() => setIsSavedNoteComposerOpen(true)}
                  aria-label="Add a saved note"
                  title="Add saved note"
                >
                  +
                </button>
              </div>
            </section>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Saved Notes</p>
                </div>
              </div>
              <div className="dictionary-list">
                {savedNotes.length === 0 && (
                  <p className="supporting">
                    No saved notes yet. Use the plus button under the workspace to add one.
                  </p>
                )}
                {savedNotes.map((note, index) => (
                  <div key={`${index}-${note.slice(0, 24)}`} className="dictionary-card">
                    <div>
                      <strong>Saved note {index + 1}</strong>
                      <p>{note}</p>
                    </div>
                    <div className="button-row compact">
                      <button
                        className="ghost-button"
                        onClick={() => void copySavedNote(note)}
                      >
                        Copy
                      </button>
                      <button
                        className="ghost-button danger"
                        onClick={() => void removeSavedNote(index)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {isSavedNoteComposerOpen && (
              <div className="notes-composer-backdrop" role="presentation">
                <section className="notes-composer" aria-label="Saved note composer">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">New Note</p>
                      <h3>Saved note</h3>
                    </div>
                  </div>
                  <label className="field">
                    <span>Write note</span>
                    <textarea
                      className="saved-note-input"
                      value={savedNoteDraft}
                      onChange={(event) => setSavedNoteDraft(event.target.value)}
                      placeholder="Write a short note, reminder, or snippet."
                    />
                  </label>
                  <div className="button-row">
                    <button className="primary-button" type="button" onClick={() => void addSavedNote()}>
                      Save note
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        setIsSavedNoteComposerOpen(false);
                        setSavedNoteDraft("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </section>
              </div>
            )}
          </section>
        )}
        {tab === "stats" && (
          <>
            <section className="panel achievements-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Achievements</p>
                  <h3>Goals To Chase</h3>
                </div>
              </div>
              <p className="supporting">
                Browse 50 possible achievements ranging from easy wins to a near-impossible monthly challenge.
              </p>
              <div className="button-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setIsAchievementsOpen(true)}
                >
                  View achievements
                </button>
              </div>
            </section>
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
            {isAchievementsOpen && (
              <div className="achievements-backdrop" role="presentation">
                <section className="achievements-modal" aria-label="Achievements list">
                  <div className="panel-header">
                    <div className="achievements-header-copy">
                      <p className="eyebrow">Achievements</p>
                      <h3>50 possible goals</h3>
                      <div className="achievement-filters" role="tablist" aria-label="Achievement filters">
                        <button
                          className={achievementFilter === "all" ? "ghost-button achievement-filter active" : "ghost-button achievement-filter"}
                          type="button"
                          onClick={() => setAchievementFilter("all")}
                        >
                          All
                        </button>
                        <button
                          className={achievementFilter === "unlocked" ? "ghost-button achievement-filter active" : "ghost-button achievement-filter"}
                          type="button"
                          onClick={() => setAchievementFilter("unlocked")}
                        >
                          Unlocked
                        </button>
                        <button
                          className={achievementFilter === "locked" ? "ghost-button achievement-filter active" : "ghost-button achievement-filter"}
                          type="button"
                          onClick={() => setAchievementFilter("locked")}
                        >
                          Locked
                        </button>
                      </div>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => setIsAchievementsOpen(false)}
                      aria-label="Close achievements"
                      title="Close"
                    >
                      X
                    </button>
                  </div>
                  <div className="achievements-list">
                    {filteredAchievements.length > 0 ? (
                      filteredAchievements.map((achievement) => (
                        <article
                          key={achievement.title}
                          className={
                            isAchievementUnlocked(achievement.title)
                              ? "achievement-card achievement-card-unlocked"
                              : "achievement-card"
                          }
                        >
                          <div className="achievement-card-header">
                            <strong>{achievement.title}</strong>
                            <span className="achievement-tier">
                              {achievement.difficulty} · +{achievementXpByDifficulty[achievement.difficulty]} XP
                            </span>
                          </div>
                          <p>{achievement.description}</p>
                        </article>
                      ))
                    ) : (
                      <div className="achievement-empty-state">
                        No {achievementFilter} achievements to show yet.
                      </div>
                    )}
                  </div>
                  <div className="button-row">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setIsAchievementsOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                </section>
              </div>
            )}
          </>
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
                    setIsCapturingShortcut(true);
                  }}
                >
                  {isCapturingShortcut ? "Hold combo and release" : "Record new shortcut"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => void saveShortcut(defaultShortcut)}
                >
                  Reset to Windows + Control
                </button>
              </div>
              {draftShortcutLabel && (
                <p className="supporting">Latest captured shortcut: <strong>{draftShortcutLabel}</strong></p>
              )}
              <p className="supporting">
                While recording a shortcut, hold the full combination and release any key to save it immediately.
                `Escape` cancels the capture.
              </p>

              <div className="panel-header">
                <div>
                  <p className="eyebrow">System</p>
                  <h3>Background Behavior</h3>
                </div>
              </div>
              <div className="settings-switch-list">
                <div className="settings-switch-row">
                  <div className="settings-switch-copy">
                    <strong>Auto-paste</strong>
                    <p>
                      Uses the system clipboard plus a local paste keystroke so dictated text lands
                      back in the app you were using.
                    </p>
                  </div>
                  <button
                    className={settings.autoPaste ? "settings-switch active" : "settings-switch"}
                    onClick={() => void patchSettings({ autoPaste: !settings.autoPaste })}
                    type="button"
                    role="switch"
                    aria-checked={settings.autoPaste}
                    aria-label="Toggle auto-paste"
                  >
                    <span className="settings-switch-thumb" aria-hidden="true" />
                  </button>
                </div>
                <div className="settings-switch-row">
                  <div className="settings-switch-copy">
                    <strong>Launch at login</strong>
                    <p>Keeps WhispARR ready after restart so dictation is available right away.</p>
                  </div>
                  <button
                    className={settings.launchOnLogin ? "settings-switch active" : "settings-switch"}
                    onClick={() => void patchSettings({ launchOnLogin: !settings.launchOnLogin })}
                    type="button"
                    role="switch"
                    aria-checked={settings.launchOnLogin}
                    aria-label="Toggle launch at login"
                  >
                    <span className="settings-switch-thumb" aria-hidden="true" />
                  </button>
                </div>
                <div className="settings-switch-row">
                  <div className="settings-switch-copy">
                    <strong>Pill always visible</strong>
                    <p>Leaves the HUD on screen in a ready state even when you are not dictating.</p>
                    <div className="button-row">
                      <button
                        className={isMovingHud ? "primary-button" : "secondary-button"}
                        type="button"
                        onClick={() => void toggleHudMoveMode()}
                      >
                        {isMovingHud ? "Stop moving and save pill location" : "Move pill location"}
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => void recenterHudPill()}
                      >
                        Recenter pill
                      </button>
                    </div>
                  </div>
                  <button
                    className={settings.alwaysShowPill ? "settings-switch active" : "settings-switch"}
                    onClick={() => void patchSettings({ alwaysShowPill: !settings.alwaysShowPill })}
                    type="button"
                    role="switch"
                    aria-checked={settings.alwaysShowPill}
                    aria-label="Toggle always show pill"
                  >
                    <span className="settings-switch-thumb" aria-hidden="true" />
                  </button>
                </div>
                <div className="settings-switch-row">
                  <div className="settings-switch-copy">
                    <strong>Dictation sounds</strong>
                    <p>Controls WhispARR sound cues like the pill pop and the level-up sound.</p>
                  </div>
                  <button
                    className={!settings.muteDictationSounds ? "settings-switch active" : "settings-switch"}
                    onClick={() =>
                      void patchSettings({ muteDictationSounds: !settings.muteDictationSounds })
                    }
                    type="button"
                    role="switch"
                    aria-checked={!settings.muteDictationSounds}
                    aria-label="Toggle dictation sounds"
                  >
                    <span className="settings-switch-thumb" aria-hidden="true" />
                  </button>
                </div>
                <div className="settings-switch-row">
                  <div className="settings-switch-copy">
                    <strong>Auto mute music when speaking</strong>
                    <p>Pauses media that is actively playing when dictation starts and never resumes anything automatically.</p>
                  </div>
                  <button
                    className={settings.muteMusicWhileDictating ? "settings-switch active" : "settings-switch"}
                    onClick={() =>
                      void patchSettings({
                        muteMusicWhileDictating: !settings.muteMusicWhileDictating
                      })
                    }
                    type="button"
                    role="switch"
                    aria-checked={settings.muteMusicWhileDictating}
                    aria-label="Toggle auto mute music when speaking"
                  >
                    <span className="settings-switch-thumb" aria-hidden="true" />
                  </button>
                </div>
                <div className="settings-switch-row">
                  <div className="settings-switch-copy">
                    <strong>Auto dictionary learning</strong>
                    <p>
                      Watches for copied corrections from the last pasted transcript and saves likely
                      corrected words into your local dictionary.
                    </p>
                  </div>
                  <button
                    className={settings.autoLearnDictionary ? "settings-switch active" : "settings-switch"}
                    onClick={() =>
                      void patchSettings({
                        autoLearnDictionary: !settings.autoLearnDictionary
                      })
                    }
                    type="button"
                    role="switch"
                    aria-checked={settings.autoLearnDictionary}
                    aria-label="Toggle auto dictionary learning"
                  >
                    <span className="settings-switch-thumb" aria-hidden="true" />
                  </button>
                </div>
                <div className="settings-switch-row">
                  <div className="settings-switch-copy">
                    <strong>Smart formatting</strong>
                    <p>
                      Auto-capitalizes text and cleans up spoken structure cues like bullets,
                      numbered items, lists, and line breaks before paste.
                    </p>
                  </div>
                  <button
                    className={settings.smartFormatting ? "settings-switch active" : "settings-switch"}
                    onClick={() =>
                      void patchSettings({
                        smartFormatting: !settings.smartFormatting
                      })
                    }
                    type="button"
                    role="switch"
                    aria-checked={settings.smartFormatting}
                    aria-label="Toggle smart formatting"
                  >
                    <span className="settings-switch-thumb" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>
            <section className="panel">
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
                  <p className="eyebrow">Requirements</p>
                  <h3>Speech Runtime Setup</h3>
                </div>
              </div>
              <div className={runtimeReady ? "runtime-feedback-card success" : "runtime-feedback-card error"}>
                <div className="runtime-feedback-header">
                  <strong>Engine status</strong>
                  <span>{runtimeReady ? "Ready" : "Needs attention"}</span>
                </div>
                <p className="supporting">
                  {runtimeReady
                    ? "Local engine is good to go and is working."
                    : "Local engine still needs setup or a fix before dictation can run reliably."}
                </p>
              </div>
              <div className="button-row">
                <button
                  className="primary-button"
                  onClick={() => void installEverything()}
                  disabled={isInstallingRuntime}
                >
                  <span className={runtimeInstallHealthy ? "status-light green" : "status-light red"} aria-hidden="true" />
                  {isInstallingRuntime ? "Installing..." : "Install everything"}
                </button>
                <button
                  className="primary-button"
                  onClick={() => void autoConfigureRuntime()}
                  disabled={isAutoFindingRuntime || isInstallingRuntime}
                >
                  <span className={runtimeAutoFindHealthy ? "status-light green" : "status-light red"} aria-hidden="true" />
                  {isAutoFindingRuntime ? "Scanning..." : "Auto-find runtime"}
                </button>
              </div>
              {showRuntimeDetails ? (
                <>
                  <p className="supporting">
                    `Install everything` downloads the local speech runtime, configures the binary and
                    model paths automatically, and runs a verification check before reporting success.
                  </p>
                  {(isInstallingRuntime || runtimeInstallMessage) && (
                    <div
                      className={
                        runtimeInstallTone === "success"
                          ? "runtime-feedback-card success"
                          : runtimeInstallTone === "error"
                            ? "runtime-feedback-card error"
                            : "runtime-feedback-card"
                      }
                    >
                      <div className="runtime-feedback-header">
                        <strong>Install everything</strong>
                        <span>{runtimeInstallProgress}%</span>
                      </div>
                      <div className="runtime-progress-track" aria-hidden="true">
                        <div
                          className="runtime-progress-fill"
                          style={{ width: `${Math.max(6, runtimeInstallProgress)}%` }}
                        />
                      </div>
                      <p className="supporting">{runtimeInstallStage}</p>
                      {runtimeInstallMessage && <p className="supporting">{runtimeInstallMessage}</p>}
                    </div>
                  )}
                  {(isAutoFindingRuntime || runtimeAutoFindMessage) && (
                    <div
                      className={
                        runtimeAutoFindTone === "success"
                          ? "runtime-feedback-card success"
                          : runtimeAutoFindTone === "error"
                            ? "runtime-feedback-card error"
                            : "runtime-feedback-card"
                      }
                    >
                      <div className="runtime-feedback-header">
                        <strong>Auto-find runtime</strong>
                        <span>
                          {runtimeAutoFindTone === "success"
                            ? "Success"
                            : runtimeAutoFindTone === "error"
                              ? "Failed"
                              : "Working"}
                        </span>
                      </div>
                      <p className="supporting">{runtimeAutoFindMessage}</p>
                    </div>
                  )}
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
                </>
              ) : (
                <p className="supporting">
                  Everything is configured correctly. You are good to go and the local engine is working.
                </p>
              )}
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Updates</p>
                  <h3>Application Updates</h3>
                </div>
              </div>
              <p className="supporting">
                Check GitHub releases for a newer installer so you can update from inside the app.
              </p>
              <div className="update-status-card">
                <p className="supporting">
                  Current version: <strong>{appUpdateInfo?.currentVersion ?? "Not checked yet"}</strong>
                </p>
                {appUpdateInfo?.latestVersion && (
                  <p className="supporting">
                    Latest release: <strong>{appUpdateInfo.latestVersion}</strong>
                  </p>
                )}
                {appUpdateInfo?.releaseName && (
                  <p className="supporting">
                    Release: <strong>{appUpdateInfo.releaseName}</strong>
                  </p>
                )}
                <p className="supporting">
                  {appUpdateInfo?.message ??
                    "No update check has been run yet. This works after a GitHub releases repo is configured for the app."}
                </p>
              </div>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Fine Tune</p>
                  <h3>Bubble And Sound Sliders</h3>
                </div>
              </div>
              <div className="settings-slider-card active">
                <div className="settings-slider-copy">
                  <strong>Bubble size</strong>
                  <p>Adjusts the pill size incrementally so you can make it smaller or larger on screen.</p>
                </div>
                <div className="bounce-slider-shell">
                  <div className="bounce-slider-readout">
                    <span>Smaller</span>
                    <strong>{hudScale}%</strong>
                    <span>Larger</span>
                  </div>
                  <ElasticSettingSlider
                    ariaLabel="Bubble size"
                    value={hudScale}
                    min={60}
                    max={160}
                    leftIcon={<Minimize2 size={18} />}
                    rightIcon={<Maximize2 size={18} />}
                    onChange={(nextValue) => {
                      previewHudScale();
                      void patchSettings({
                        hudScale: clampHudScale(nextValue)
                      });
                    }}
                  />
                </div>
              </div>
              <div
                className={!settings.muteDictationSounds ? "settings-slider-card active" : "settings-slider-card"}
                aria-disabled={settings.muteDictationSounds}
              >
                <div className="settings-slider-copy">
                  <strong>Application sound volume</strong>
                  <p>Adjusts the volume for HUD cues, level-up audio, and other built-in app sounds.</p>
                </div>
                <div className="bounce-slider-shell">
                  <div className="bounce-slider-readout">
                    <span>Quiet</span>
                    <strong>{appSoundVolume}%</strong>
                    <span>Loud</span>
                  </div>
                  <ElasticSettingSlider
                    ariaLabel="Application sound volume"
                    value={appSoundVolume}
                    disabled={settings.muteDictationSounds}
                    onChange={(nextValue) =>
                      void patchSettings({
                        appSoundVolume: clampSoundVolume(nextValue)
                      })
                    }
                  />
                </div>
              </div>
            </section>
          </section>
        )}
        {tab === "developer" && settings.devModeUnlocked && (
          <section className="panel dev-tab-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Developer</p>
                  <h3>Developer Mode</h3>
                </div>
              </div>
              <div className="update-status-card">
                <p className="supporting">
                  Status: <strong>{settings.devModeEnabled ? "On" : "Off"}</strong>
                </p>
                <div className="button-row">
                  <button
                    className={settings.devModeEnabled ? "primary-button" : "secondary-button"}
                    type="button"
                    onClick={() =>
                      void patchSettings({ devModeEnabled: !settings.devModeEnabled })
                    }
                  >
                    {settings.devModeEnabled ? "Turn developer mode off" : "Turn developer mode on"}
                  </button>
                </div>
              </div>
              {settings.devModeEnabled && (
                <div className="dev-mode-panel">
                  <div className="dev-mode-card dev-mode-card-primary">
                    <p className="eyebrow">Recent Logs</p>
                    <div className="dev-log-list">
                      {statusLogs.length === 0 && (
                        <p className="supporting">No logs yet.</p>
                      )}
                      {statusLogs.map((entry, index) => (
                        <div key={`${entry.timestamp}-${index}`} className="dev-log-entry">
                          <strong>{entry.timestamp}</strong>
                          <p>{entry.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="dev-mode-card dev-mode-card-secondary">
                    <p className="eyebrow">Diagnostics</p>
                    <ul className="plain-list dev-mode-list">
                      <li>Version: {appDiagnostics?.version ?? "Loading..."}</li>
                      <li>Platform: {appDiagnostics?.platform ?? "Loading..."}</li>
                      <li>Architecture: {appDiagnostics?.arch ?? "Loading..."}</li>
                      <li>Packaged: {appDiagnostics ? String(appDiagnostics.isPackaged) : "Loading..."}</li>
                      <li>Theme: {settings.appTheme}</li>
                      <li>Whisper ready: {runtimeReady ? "Yes" : "No"}</li>
                      <li>Profiles: {profiles.length}</li>
                      <li>Dictionary entries: {manualDictionary.length}</li>
                      <li>Saved notes: {savedNotes.length}</li>
                      <li>Selected mic: {settings.selectedMicId ?? "System default"}</li>
                      <li>Binary path: {settings.whisperBinaryPath || "Not set"}</li>
                      <li>Model path: {settings.whisperModelPath || "Not set"}</li>
                    </ul>
                  </div>
                </div>
              )}
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
      {isOnboardingOpen && (
        <div className="onboarding-backdrop" role="presentation">
          <section className="onboarding-modal" aria-label="WhispARR setup guide">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Setup Guide</p>
                <h3>{currentOnboardingStep.title}</h3>
              </div>
              <span className="dictionary-chip">
                Step {onboardingStep + 1} of {onboardingSteps.length}
              </span>
            </div>
            <p className="supporting">{currentOnboardingStep.description}</p>
            <div className="onboarding-progress">
              {onboardingSteps.map((step, index) => (
                <span
                  key={step.title}
                  className={index === onboardingStep ? "onboarding-progress-dot active" : "onboarding-progress-dot"}
                  aria-hidden="true"
                />
              ))}
            </div>

            {onboardingStep === 0 && (
              <div className="onboarding-step-card">
                <p className="supporting">
                  WhispARR works best after a few setup choices are handled first. We will set up the
                  local runtime, microphone, shortcut, and voice profile in order.
                </p>
              </div>
            )}

            {onboardingStep === 1 && (
              <div className="onboarding-step-card">
                <p className="supporting">
                  Status: <strong>{runtimeReady ? "Local engine ready" : "Local engine still needs setup"}</strong>
                </p>
                <div className="button-row">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void installEverything()}
                    disabled={isInstallingRuntime}
                  >
                    {isInstallingRuntime ? "Installing..." : "Install everything"}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void autoConfigureRuntime()}>
                    Auto-find runtime
                  </button>
                </div>
              </div>
            )}

            {onboardingStep === 2 && (
              <div className="onboarding-step-card">
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
                  <button className="ghost-button" type="button" onClick={() => void refreshDevices()}>
                    Refresh devices
                  </button>
                  <button
                    className={isTestingMicrophone ? "secondary-button" : "primary-button"}
                    type="button"
                    onClick={() =>
                      void (isTestingMicrophone ? stopMicrophoneTest() : startMicrophoneTest())
                    }
                  >
                    {isTestingMicrophone ? "Stop microphone test" : "Test microphone"}
                  </button>
                </div>
                {isTestingMicrophone && (
                  <div className="microphone-test-card">
                    <div className="microphone-test-header">
                      <strong>Microphone input</strong>
                      <span>{recorder.level > 0.03 ? "Input detected" : "Listening..."}</span>
                    </div>
                    <div className="microphone-test-meter" aria-hidden="true">
                      <div
                        className="microphone-test-fill"
                        style={{ width: `${Math.max(8, recorder.level * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {onboardingStep === 3 && (
              <div className="onboarding-step-card">
                <p className="supporting">
                  Current shortcut: <strong>{activeShortcutLabel}</strong>
                </p>
                <div className="button-row">
                  <button
                    className={isCapturingShortcut ? "primary-button" : "secondary-button"}
                    type="button"
                    onClick={() => {
                      setIsCapturingShortcut(true);
                      setTab("settings");
                    }}
                  >
                    {isCapturingShortcut ? "Hold combo and release" : "Choose shortcut"}
                  </button>
                </div>
                {draftShortcutLabel && (
                  <p className="supporting">Latest captured shortcut: <strong>{draftShortcutLabel}</strong></p>
                )}
              </div>
            )}

            {onboardingStep === 4 && (
              <div className="onboarding-step-card">
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
                    className={isTrainingProfile ? "secondary-button" : "primary-button"}
                    type="button"
                    onClick={() => void toggleProfileTraining()}
                    disabled={!isTrainingProfile && recorder.state === "recording"}
                  >
                    {isTrainingProfile ? "Stop training" : "Start training"}
                  </button>
                </div>
                <div className="training-example">
                  <p className="eyebrow">Practice Paragraph</p>
                  <p>{trainingParagraph}</p>
                </div>
                {profiles.length > 0 && (
                  <p className="supporting">
                    Saved voices: <strong>{profiles.length}</strong>
                  </p>
                )}
              </div>
            )}

            {onboardingStep === 5 && (
              <div className="onboarding-step-card">
                <ul className="plain-list">
                  <li>{runtimeReady ? "Local engine is ready" : "Local engine still needs setup"}</li>
                  <li>{microphoneReady ? "A microphone is available" : "No microphone found yet"}</li>
                  <li>{shortcutReady ? `Shortcut set to ${activeShortcutLabel}` : "Shortcut still needs review"}</li>
                  <li>{profileReady ? "At least one voice profile is saved" : "Voice profile still needs setup"}</li>
                </ul>
              </div>
            )}

            <div className="button-row">
              <button className="ghost-button" type="button" onClick={() => void completeOnboarding()}>
                Skip setup
              </button>
              {onboardingStep > 0 && (
                <button className="ghost-button" type="button" onClick={goToPreviousOnboardingStep}>
                  Back
                </button>
              )}
              {onboardingStep < onboardingSteps.length - 1 ? (
                <button className="primary-button" type="button" onClick={goToNextOnboardingStep}>
                  Continue
                </button>
              ) : (
                <button className="primary-button" type="button" onClick={() => void completeOnboarding()}>
                  Finish setup
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {celebratingLevel && (
        <div className="level-up-backdrop" role="presentation">
          <section className="level-up-modal" aria-label="Level up celebration">
            <p className="eyebrow">Level Up</p>
            <h3>Congratulations, You are now level <span>{celebratingLevel}</span></h3>
          </section>
        </div>
      )}
      {isDevModeUnlockCelebrationVisible && (
        <div className="dev-mode-backdrop" role="presentation">
          <section className="dev-mode-modal" aria-label="Developer mode unlocked">
            <p className="eyebrow">Easter Egg Found</p>
            <h3>Developer Mode Unlocked</h3>
            <p>Advanced logs and diagnostics are now available in the Developer tab.</p>
          </section>
        </div>
      )}
      {isRetroCelebrationVisible && (
        <div className="retro-mode-backdrop" role="presentation">
          <section className="retro-mode-modal" aria-label="Retro mode unlocked">
            <p className="eyebrow">Secret Mode</p>
            <h3>Retro Mode Unlocked</h3>
            <p>A pixel survivor just bolted across the app. You are now in arcade mode.</p>
          </section>
        </div>
      )}
      {updateDialogState !== "closed" && (
        <div className="update-dialog-backdrop" role="presentation">
          <section className="update-dialog-modal" aria-label="Application update">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Updates</p>
                <h3>
                  {updateDialogState === "available"
                    ? "New Update Ready"
                    : updateDialogState === "none"
                      ? "No New Updates"
                      : "Update Check"}
                </h3>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setUpdateDialogState("closed")}
                aria-label="Close update dialog"
                title="Close"
                disabled={isInstallingAppUpdate}
              >
                X
              </button>
            </div>
            <p className="supporting">
              {updateDialogState === "none"
                ? "You already have the latest version installed."
                : updateDialogMessage}
            </p>
            {appUpdateInfo?.latestVersion && updateDialogState !== "none" && (
              <p className="supporting">
                Latest version: <strong>{appUpdateInfo.latestVersion}</strong>
              </p>
            )}
            {appUpdateInfo?.releaseName && updateDialogState === "available" && (
              <p className="supporting">
                Release: <strong>{appUpdateInfo.releaseName}</strong>
              </p>
            )}
            {appUpdateInfo?.releaseNotes && updateDialogState === "available" && (
              <div className="update-dialog-notes">
                <strong>What's new</strong>
                <p>{appUpdateInfo.releaseNotes}</p>
              </div>
            )}
            <div className="button-row">
              {updateDialogState === "available" ? (
                <>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setUpdateDialogState("closed")}
                    disabled={isInstallingAppUpdate}
                  >
                    Later
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void downloadAndInstallUpdate()}
                    disabled={isInstallingAppUpdate}
                  >
                    {isInstallingAppUpdate ? "Downloading update..." : "Download and install update"}
                  </button>
                </>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setUpdateDialogState("closed")}
                  disabled={isInstallingAppUpdate}
                >
                  Okay
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      <div
        className={isRetroCelebrationVisible ? "bottom-level-bar retro-active" : "bottom-level-bar"}
        aria-label="Level progress to next level"
      >
        <div className={isRetroCelebrationVisible ? "bottom-level-bar-fill-wrap retro-active" : "bottom-level-bar-fill-wrap"}>
          <div
            className={celebratingLevel ? "bottom-level-bar-fill celebrating" : "bottom-level-bar-fill"}
            style={{
              width: `${Math.min(100, (xpIntoCurrentLevel / xpNeededForCurrentLevel) * 100)}%`
            }}
          />
        </div>
        {isRetroCelebrationVisible && (
          <div className="bottom-level-bar-runner-scene" aria-hidden="true">
            <div className="retro-sprite retro-survivor">
              <span />
              <span />
              <span />
            </div>
            <div className="retro-sprite retro-zombie retro-zombie-one">
              <span />
              <span />
              <span />
            </div>
            <div className="retro-sprite retro-zombie retro-zombie-two">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
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
