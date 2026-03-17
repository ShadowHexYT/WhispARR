import { useEffect, useMemo, useRef, useState } from "react";
import { computeVoiceEmbedding, scoreVoiceMatch } from "./lib/audio";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import {
  ActivationShortcut,
  AppSettings,
  DictationResult,
  ManualDictionaryEntry,
  RuntimeDiscoveryResult,
  RuntimeInstallResult,
  ShortcutModifier,
  UserStats,
  VoiceProfile,
  WhisperConfigStatus
} from "../shared/types";

type TabKey = "dictation" | "profiles" | "stats" | "settings";
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
  activationShortcut: defaultShortcut
};

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
  const transcriptHistoryOptions = [3, 5, 10, 20];

  useEffect(() => {
    recorderRef.current = recorder;
  }, [recorder]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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
            ["settings", "System"]
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "nav-button active" : "nav-button"}
              onClick={() => setTab(key as TabKey)}
            >
              {label}
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
                <li>Clipboard-based paste insertion after local transcription</li>
              </ul>
              <p className="supporting">
                This is a close local-first recreation of the workflow, but without copying any
                proprietary branding, cloud services, or closed-source internals.
              </p>
              <p className="supporting">
                For packaged releases, place the runtime under `runtime/bin` and `runtime/models`
                before building so the installer ships with everything preloaded.
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
