import { app } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import { AppUpdateInfo, AppUpdateState } from "../shared/types";

type UpdateCheckMode = "interactive" | "silent";

let lastKnownInfo: AppUpdateInfo | null = null;
let currentState: AppUpdateState = {
  stage: "idle",
  message: "Update service idle.",
  progress: null,
  info: null
};
let updaterInitialized = false;
let shouldInstallWhenDownloaded = false;
let currentCheckMode: UpdateCheckMode = "interactive";

const listeners = new Set<(state: AppUpdateState) => void>();

function normalizeVersion(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^v/i, "");
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersion(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeVersion(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function normalizeReleaseNotes(releaseNotes: UpdateInfo["releaseNotes"]) {
  if (typeof releaseNotes === "string") {
    return releaseNotes.trim() || null;
  }

  if (!Array.isArray(releaseNotes)) {
    return null;
  }

  const combined = (releaseNotes as Array<{ note?: string }>)
    .map((entry) => (typeof entry.note === "string" ? entry.note.trim() : ""))
    .filter(Boolean)
    .join("\n\n");

  return combined || null;
}

function buildUpdateInfo(updateInfo: UpdateInfo | null, message: string): AppUpdateInfo {
  const currentVersion = app.getVersion();
  const latestVersion = updateInfo?.version?.trim() || null;
  const hasUpdate =
    latestVersion !== null && compareVersions(latestVersion, currentVersion) > 0;

  return {
    configured: app.isPackaged,
    currentVersion,
    latestVersion,
    hasUpdate,
    releaseName: latestVersion,
    releaseNotes: normalizeReleaseNotes(updateInfo?.releaseNotes),
    downloadUrl: null,
    assetName: null,
    htmlUrl: null,
    message
  };
}

function emitState(nextState: AppUpdateState) {
  currentState = nextState;
  if (nextState.info) {
    lastKnownInfo = nextState.info;
  }

  for (const listener of listeners) {
    listener(currentState);
  }
}

function shouldEmitUpdateCheckState(stage: AppUpdateState["stage"]) {
  if (currentCheckMode !== "silent") {
    return true;
  }

  return stage === "downloading" || stage === "downloaded" || stage === "installing";
}

function ensureUpdaterReady() {
  if (updaterInitialized) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    if (!shouldEmitUpdateCheckState("checking")) {
      return;
    }
    emitState({
      stage: "checking",
      message: "Checking for updates...",
      progress: null,
      info: lastKnownInfo
    });
  });

  autoUpdater.on("update-available", (updateInfo) => {
    const info = buildUpdateInfo(updateInfo, `Version ${updateInfo.version} is available.`);
    if (!shouldEmitUpdateCheckState("available")) {
      lastKnownInfo = info;
      return;
    }
    emitState({
      stage: "available",
      message: info.message,
      progress: null,
      info
    });
  });

  autoUpdater.on("update-not-available", (updateInfo) => {
    const info = buildUpdateInfo(updateInfo, `You are up to date on version ${app.getVersion()}.`);
    if (!shouldEmitUpdateCheckState("none")) {
      lastKnownInfo = info;
      return;
    }
    emitState({
      stage: "none",
      message: info.message,
      progress: null,
      info
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    emitState({
      stage: "downloading",
      message: `Downloading update... ${Math.round(progress.percent)}%`,
      progress: Math.max(0, Math.min(100, Math.round(progress.percent))),
      info: lastKnownInfo
    });
  });

  autoUpdater.on("update-downloaded", (updateInfo) => {
    const info = buildUpdateInfo(updateInfo, "Update downloaded. Restarting to install...");
    emitState({
      stage: "downloaded",
      message: info.message,
      progress: 100,
      info
    });

    if (!shouldInstallWhenDownloaded) {
      return;
    }

    emitState({
      stage: "installing",
      message: "Installing update and restarting...",
      progress: 100,
      info
    });

    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 800);
  });

  autoUpdater.on("error", (error) => {
    if (!shouldEmitUpdateCheckState("error")) {
      return;
    }
    emitState({
      stage: "error",
      message: error == null ? "Update service failed." : error.message,
      progress: null,
      info: lastKnownInfo
    });
  });

  updaterInitialized = true;
}

export function subscribeToAppUpdateState(listener: (state: AppUpdateState) => void) {
  listeners.add(listener);
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
}

export async function checkForAppUpdates(options?: { silent?: boolean }): Promise<AppUpdateInfo> {
  const isSilent = options?.silent === true;
  if (!app.isPackaged) {
    const info: AppUpdateInfo = {
      configured: false,
      currentVersion: app.getVersion(),
      latestVersion: null,
      hasUpdate: false,
      releaseName: null,
      releaseNotes: null,
      downloadUrl: null,
      assetName: null,
      htmlUrl: null,
      message: "Updates only work in the installed packaged app."
    };

    if (!isSilent) {
      emitState({
        stage: "error",
        message: info.message,
        progress: null,
        info
      });
    }

    return info;
  }

  ensureUpdaterReady();
  shouldInstallWhenDownloaded = false;
  currentCheckMode = isSilent ? "silent" : "interactive";

  try {
    const result = await autoUpdater.checkForUpdates();
    const info = buildUpdateInfo(
      result?.updateInfo ?? null,
      lastKnownInfo?.message ?? `You are up to date on version ${app.getVersion()}.`
    );

    lastKnownInfo = info;
    return info;
  } finally {
    currentCheckMode = "interactive";
  }
}

export async function downloadAppUpdate(): Promise<{ message: string; filePath: string | null }> {
  if (!app.isPackaged) {
    throw new Error("Updates only work in the installed packaged app.");
  }

  ensureUpdaterReady();
  shouldInstallWhenDownloaded = true;

  if (currentState.stage === "downloaded" && lastKnownInfo?.hasUpdate) {
    emitState({
      stage: "installing",
      message: "Installing update and restarting...",
      progress: 100,
      info: lastKnownInfo
    });
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 400);

    return {
      message: "Installing update and restarting...",
      filePath: null
    };
  }

  await autoUpdater.downloadUpdate();
  return {
    message: "Downloading update...",
    filePath: null
  };
}
