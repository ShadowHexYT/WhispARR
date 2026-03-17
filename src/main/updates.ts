import { app } from "electron";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { AppUpdateInfo } from "../shared/types";

type GitHubAsset = {
  name: string;
  browser_download_url: string;
};

type GitHubRelease = {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  assets?: GitHubAsset[];
};

type RepoTarget = {
  owner: string;
  repo: string;
};

function requestJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "whisparr"
          }
        },
        (response) => {
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            resolve(requestJson<T>(response.headers.location));
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Update check failed with status ${response.statusCode ?? "unknown"}.`));
            return;
          }

          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => {
            try {
              resolve(JSON.parse(body) as T);
            } catch (error) {
              reject(error);
            }
          });
        }
      )
      .on("error", reject);
  });
}

async function downloadToFile(url: string, filePath: string): Promise<void> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "whisparr"
          }
        },
        async (response) => {
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            response.resume();
            try {
              await downloadToFile(response.headers.location, filePath);
              resolve();
            } catch (error) {
              reject(error);
            }
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Update download failed with status ${response.statusCode ?? "unknown"}.`));
            return;
          }

          const stream = fs.createWriteStream(filePath);
          try {
            await pipeline(response, stream);
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      )
      .on("error", reject);
  });
}

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

function parseGitHubRepo(urlValue: string | undefined) {
  if (!urlValue) {
    return null;
  }

  const normalized = urlValue
    .trim()
    .replace(/^git\+/, "")
    .replace(/\.git$/i, "");
  const match = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)$/i);
  if (!match) {
    return null;
  }

  return {
    owner: match[1] ?? "",
    repo: match[2] ?? ""
  };
}

function readRepoTarget(): RepoTarget | null {
  try {
    const packageJsonPath = path.join(app.getAppPath(), "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      repository?: string | { url?: string };
      build?: {
        publish?: Array<{ provider?: string; owner?: string; repo?: string }> | { provider?: string; owner?: string; repo?: string };
      };
    };

    const publish = Array.isArray(packageJson.build?.publish)
      ? packageJson.build?.publish[0]
      : packageJson.build?.publish;
    if (publish?.provider === "github" && publish.owner && publish.repo) {
      return {
        owner: publish.owner,
        repo: publish.repo
      };
    }

    if (typeof packageJson.repository === "string") {
      return parseGitHubRepo(packageJson.repository);
    }

    return parseGitHubRepo(packageJson.repository?.url);
  } catch {
    return null;
  }
}

function selectReleaseAsset(assets: GitHubAsset[]) {
  if (process.platform === "win32") {
    return (
      assets.find((asset) => /setup.*\.exe$/i.test(asset.name) && !/arm64|blockmap/i.test(asset.name)) ??
      assets.find((asset) => /\.exe$/i.test(asset.name) && !/arm64|blockmap/i.test(asset.name)) ??
      null
    );
  }

  if (process.platform === "darwin") {
    return assets.find((asset) => /\.(dmg|zip)$/i.test(asset.name) && !/blockmap/i.test(asset.name)) ?? null;
  }

  return assets.find((asset) => /\.(AppImage|deb|rpm|tar\.gz)$/i.test(asset.name)) ?? null;
}

export async function checkForAppUpdates(): Promise<AppUpdateInfo> {
  const currentVersion = app.getVersion();
  const repoTarget = readRepoTarget();
  if (!repoTarget) {
    return {
      configured: false,
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      releaseName: null,
      releaseNotes: null,
      downloadUrl: null,
      assetName: null,
      htmlUrl: null,
      message: "Updates are not configured yet. Add a GitHub repository URL or build.publish GitHub target to package.json."
    };
  }

  const url = `https://api.github.com/repos/${repoTarget.owner}/${repoTarget.repo}/releases/latest`;
  const release = await requestJson<GitHubRelease>(url);
  const latestVersion = normalizeVersion(release.tag_name || release.name || "");
  const asset = selectReleaseAsset(release.assets ?? []);
  const hasUpdate = latestVersion.length > 0 && compareVersions(latestVersion, currentVersion) > 0;

  return {
    configured: true,
    currentVersion,
    latestVersion: latestVersion || null,
    hasUpdate,
    releaseName: release.name?.trim() || release.tag_name?.trim() || null,
    releaseNotes: release.body?.trim() || null,
    downloadUrl: asset?.browser_download_url ?? null,
    assetName: asset?.name ?? null,
    htmlUrl: release.html_url ?? null,
    message: hasUpdate
      ? asset
        ? `Version ${latestVersion} is available.`
        : `Version ${latestVersion} is available, but no installer asset was found for this platform.`
      : `You are up to date on version ${currentVersion}.`
  };
}

export async function downloadAppUpdate(): Promise<{ message: string; filePath: string | null }> {
  const updateInfo = await checkForAppUpdates();
  if (!updateInfo.configured) {
    throw new Error(updateInfo.message);
  }
  if (!updateInfo.hasUpdate) {
    return {
      message: updateInfo.message,
      filePath: null
    };
  }
  if (!updateInfo.downloadUrl || !updateInfo.assetName) {
    throw new Error("A newer release was found, but no downloadable installer asset is available for this platform.");
  }

  const updateDir = path.join(app.getPath("downloads"), "WhispARR Updates");
  const filePath = path.join(updateDir, updateInfo.assetName);
  await downloadToFile(updateInfo.downloadUrl, filePath);

  return {
    message: `Downloaded ${updateInfo.assetName}.`,
    filePath
  };
}
