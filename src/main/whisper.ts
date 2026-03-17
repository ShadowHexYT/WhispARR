import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  AppSettings,
  DictationResult,
  ManualDictionaryEntry,
  WhisperConfigStatus
} from "../shared/types";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForCompare(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
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

function shouldReplaceWithDictionaryTerm(word: string, term: string) {
  const normalizedWord = normalizeForCompare(word);
  const normalizedTerm = normalizeForCompare(term);

  if (!normalizedWord || !normalizedTerm || normalizedWord === normalizedTerm) {
    return normalizedWord !== "" && normalizedWord !== normalizedTerm ? false : true;
  }

  if (normalizedWord[0] !== normalizedTerm[0]) {
    return false;
  }

  const distance = levenshteinDistance(normalizedWord, normalizedTerm);
  const allowedDistance = normalizedTerm.length >= 8 ? 2 : 1;
  return distance <= allowedDistance;
}

function applyManualDictionary(transcript: string, manualDictionary: ManualDictionaryEntry[]) {
  let updatedTranscript = transcript;

  for (const entry of manualDictionary) {
    const term = entry.term.trim();
    if (!term) {
      continue;
    }

    // Exact phrase matches are normalized to the preferred dictionary spelling/casing.
    const exactPattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    updatedTranscript = updatedTranscript.replace(exactPattern, term);

    // Single-word entries also act as preferred spellings for close transcript matches.
    if (!term.includes(" ")) {
      updatedTranscript = updatedTranscript.replace(/\b[\w'-]+\b/g, (word) =>
        shouldReplaceWithDictionaryTerm(word, term) ? term : word
      );
    }
  }

  return updatedTranscript;
}

function normalizeTranscript(transcript: string) {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return "";
  }

  const simplified = trimmed
    .toLowerCase()
    .replace(/[\[\](){}"'.!?,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const silentPhrases = new Set([
    "silence",
    "blank audio",
    "says nothing",
    "said nothing",
    "no speech",
    "no audio",
    "nothing",
    "empty audio"
  ]);

  return silentPhrases.has(simplified) ? "" : trimmed;
}

function writeWavFile(filePath: string, pcm: number[], sampleRate: number) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
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

  for (let index = 0; index < pcm.length; index += 1) {
    const value = Math.max(-1, Math.min(1, pcm[index] ?? 0));
    buffer.writeInt16LE(Math.floor(value * 32767), 44 + index * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

export function getWhisperConfigStatus(settings: AppSettings): WhisperConfigStatus {
  return {
    binaryExists: Boolean(settings.whisperBinaryPath) && fs.existsSync(settings.whisperBinaryPath),
    modelExists: Boolean(settings.whisperModelPath) && fs.existsSync(settings.whisperModelPath)
  };
}

export async function transcribeLocally(args: {
  pcm: number[];
  sampleRate: number;
  settings: AppSettings;
  manualDictionary: ManualDictionaryEntry[];
}): Promise<DictationResult> {
  const status = getWhisperConfigStatus(args.settings);
  if (!status.binaryExists || !status.modelExists) {
    throw new Error("Configure a local whisper.cpp binary and model path before dictating.");
  }

  const startedAt = Date.now();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "whisparr-"));
  const audioPath = path.join(tempDir, "input.wav");
  const outputBase = path.join(tempDir, "output");
  const outputPath = `${outputBase}.txt`;
  const threadCount = Math.max(1, Math.min(os.cpus().length || 1, 8));

  writeWavFile(audioPath, args.pcm, args.sampleRate);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      args.settings.whisperBinaryPath,
      [
        "-m",
        args.settings.whisperModelPath,
        "-f",
        audioPath,
        "-t",
        String(threadCount),
        "-otxt",
        "-of",
        outputBase,
        "-nt"
      ],
      { stdio: "ignore" }
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Local transcription failed with exit code ${code ?? -1}.`));
      }
    });
  });

  const rawTranscript = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf8").trim()
    : "";
  const transcript = normalizeTranscript(
    applyManualDictionary(rawTranscript, args.manualDictionary)
  );

  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    transcript,
    elapsedMs: Date.now() - startedAt
  };
}
