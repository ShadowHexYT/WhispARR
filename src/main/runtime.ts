import { app } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import extract from "extract-zip";
import {
  RuntimeCandidate,
  RuntimeDiscoveryResult,
  RuntimeInstallResult
} from "../shared/types";

const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin?download=true";
const MODEL_FILENAME = "ggml-base.en.bin";
const GITHUB_RELEASES_LATEST = "https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest";

function fileExists(filePath: string) {
  return Boolean(filePath) && fs.existsSync(filePath);
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getManagedRuntimeRoot() {
  return path.join(app.getPath("userData"), "runtime");
}

function getBinaryNames() {
  return process.platform === "win32"
    ? ["whisper-cli.exe", "main.exe"]
    : ["whisper-cli", "main"];
}

function getCommonRoots() {
  const home = os.homedir();
  const roots = [
    path.join(process.cwd(), "runtime"),
    path.join(process.cwd(), "resources", "runtime"),
    getManagedRuntimeRoot(),
    path.join(process.resourcesPath, "runtime"),
    path.join(path.dirname(app.getPath("exe")), "runtime")
  ];

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      roots.push(path.join(localAppData, "WhispARR", "runtime"));
    }
  } else if (process.platform === "darwin") {
    roots.push(path.join(home, "Library", "Application Support", "WhispARR", "runtime"));
  }

  roots.push(path.join(home, ".whisparr", "runtime"));
  return Array.from(new Set(roots));
}

function findBinary(root: string) {
  const names = getBinaryNames();
  const candidates = [
    ...names.map((name) => path.join(root, "bin", name)),
    ...names.map((name) => path.join(root, "Release", name)),
    ...names.map((name) => path.join(root, "build", "bin", "Release", name)),
    ...names.map((name) => path.join(root, name))
  ];

  return candidates.find(fileExists) ?? null;
}

function findModels(root: string) {
  const modelDirs = [path.join(root, "models"), root];
  const models: string[] = [];

  for (const dir of modelDirs) {
    if (!fs.existsSync(dir)) {
      continue;
    }

    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      if (!fs.statSync(fullPath).isFile()) {
        continue;
      }

      const lower = entry.toLowerCase();
      if (lower.endsWith(".bin") || lower.endsWith(".gguf")) {
        models.push(fullPath);
      }
    }
  }

  return models;
}

function scoreModelPath(modelPath: string) {
  const lower = path.basename(modelPath).toLowerCase();
  if (lower.includes("base.en")) {
    return 5;
  }
  if (lower.includes("small.en")) {
    return 4;
  }
  if (lower.includes("base")) {
    return 3;
  }
  if (lower.includes("small")) {
    return 2;
  }
  return 1;
}

function getBundledRoots() {
  return [path.join(process.resourcesPath, "runtime"), path.join(process.cwd(), "runtime")];
}

function writeSilentWav(filePath: string, sampleRate = 16000, durationMs = 250) {
  const sampleCount = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  fs.writeFileSync(filePath, buffer);
}

function copyDirectory(source: string, destination: string) {
  if (!fs.existsSync(source)) {
    return;
  }

  ensureDir(destination);
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function requestBufferJson(url: string): Promise<unknown> {
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
            resolve(requestBufferJson(response.headers.location));
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Request failed with status ${response.statusCode ?? "unknown"}.`));
            return;
          }

          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => {
            try {
              resolve(JSON.parse(body));
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
  ensureDir(path.dirname(filePath));

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
            reject(new Error(`Download failed with status ${response.statusCode ?? "unknown"}.`));
            return;
          }

          const writeStream = fs.createWriteStream(filePath);

          try {
            await pipeline(response, writeStream);
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      )
      .on("error", reject);
  });
}

function getWindowsAssetName() {
  if (process.arch === "ia32") {
    return "whisper-bin-Win32.zip";
  }

  return "whisper-bin-x64.zip";
}

async function installWindowsBinary(managedRoot: string) {
  const release = (await requestBufferJson(GITHUB_RELEASES_LATEST)) as {
    assets?: Array<{ name: string; browser_download_url: string }>;
  };

  const assetName = getWindowsAssetName();
  const asset = release.assets?.find((item) => item.name === assetName);
  if (!asset) {
    throw new Error(`Official runtime asset ${assetName} was not found in the latest whisper.cpp release.`);
  }

  const zipPath = path.join(app.getPath("temp"), asset.name);
  await downloadToFile(asset.browser_download_url, zipPath);
  await extract(zipPath, { dir: managedRoot });
}

async function installModel(managedRoot: string) {
  const modelPath = path.join(managedRoot, "models", MODEL_FILENAME);
  if (fileExists(modelPath)) {
    return modelPath;
  }

  await downloadToFile(MODEL_URL, modelPath);
  return modelPath;
}

async function verifyRuntimeCandidate(binaryPath: string, modelPath: string) {
  if (!fileExists(binaryPath)) {
    throw new Error("The local speech binary is missing after installation.");
  }

  if (!fileExists(modelPath)) {
    throw new Error("The local speech model is missing after installation.");
  }

  const tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "whisparr-runtime-check-"));
  const audioPath = path.join(tempDir, "smoke-test.wav");
  const outputBase = path.join(tempDir, "smoke-test");

  try {
    writeSilentWav(audioPath);

    await new Promise<void>((resolve, reject) => {
      execFile(
        binaryPath,
        ["-m", modelPath, "-f", audioPath, "-t", "1", "-otxt", "-of", outputBase, "-nt"],
        { timeout: 120000, windowsHide: true },
        (error) => {
          if (error) {
            reject(
              new Error(
                `Installed runtime failed its local verification check: ${error.message}.`
              )
            );
            return;
          }

          resolve();
        }
      );
    });

    if (!fileExists(`${outputBase}.txt`)) {
      throw new Error("Installed runtime did not produce a transcript output file during verification.");
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function discoverRuntime(): RuntimeDiscoveryResult {
  const candidates: RuntimeCandidate[] = [];

  for (const root of getCommonRoots()) {
    const binaryPath = findBinary(root);
    if (!binaryPath) {
      continue;
    }

    const models = findModels(root);
    if (models.length === 0) {
      continue;
    }

    const bestModel = [...models].sort((left, right) => scoreModelPath(right) - scoreModelPath(left))[0];
    candidates.push({
      binaryPath,
      modelPath: bestModel,
      source: root === path.join(process.resourcesPath, "runtime") ? "bundled package" : root
    });
  }

  return {
    candidates,
    selected: candidates[0] ?? null
  };
}

export async function installRuntime(): Promise<RuntimeInstallResult> {
  const existing = discoverRuntime();
  if (existing.selected) {
    await verifyRuntimeCandidate(existing.selected.binaryPath, existing.selected.modelPath);
    return {
      discovery: existing,
      installed: false,
      ready: true,
      message: `Runtime already available from ${existing.selected.source} and passed verification.`
    };
  }

  const managedRoot = getManagedRuntimeRoot();
  ensureDir(managedRoot);

  for (const bundledRoot of getBundledRoots()) {
    if (fileExists(findBinary(bundledRoot) ?? "")) {
      copyDirectory(bundledRoot, managedRoot);
      break;
    }
  }

  if (!findBinary(managedRoot)) {
    if (process.platform === "win32") {
      await installWindowsBinary(managedRoot);
    } else {
      throw new Error(
        "This build does not include a bundled macOS runtime. Package a local runtime under runtime/bin for turnkey macOS installs."
      );
    }
  }

  await installModel(managedRoot);

  const discovery = discoverRuntime();
  if (!discovery.selected) {
    throw new Error("Runtime installation finished, but the app could not validate the installed files.");
  }

  await verifyRuntimeCandidate(discovery.selected.binaryPath, discovery.selected.modelPath);

  return {
    discovery,
    installed: true,
    ready: true,
    message: `Installed local speech runtime from ${discovery.selected.source} and verified it is ready.`
  };
}
