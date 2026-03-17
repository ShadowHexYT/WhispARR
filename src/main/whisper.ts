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

function applyManualDictionary(
  transcript: string,
  manualDictionary: ManualDictionaryEntry[]
) {
  return [...manualDictionary]
    .filter((entry) => entry.spoken.trim() && entry.replacement.trim())
    .sort((left, right) => right.spoken.length - left.spoken.length)
    .reduce((current, entry) => {
      const pattern = new RegExp(`\\b${escapeRegExp(entry.spoken.trim())}\\b`, "gi");
      return current.replace(pattern, entry.replacement.trim());
    }, transcript);
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

  writeWavFile(audioPath, args.pcm, args.sampleRate);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      args.settings.whisperBinaryPath,
      [
        "-m",
        args.settings.whisperModelPath,
        "-f",
        audioPath,
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
  const transcript = applyManualDictionary(rawTranscript, args.manualDictionary);

  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    transcript,
    elapsedMs: Date.now() - startedAt
  };
}
