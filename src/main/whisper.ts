import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { readData, recordSpokenPunctuationDecisions } from "./storage";
import {
  AppSettings,
  DictationResult,
  ManualDictionaryEntry,
  SpokenPunctuationPreferenceMap,
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
    const replacement = entry.replacement?.trim();
    if (!term) {
      continue;
    }

    if (replacement) {
      const replacementPattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
      updatedTranscript = updatedTranscript.replace(replacementPattern, replacement);
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
  const stripped = transcript
    // Remove subtitle-style bracketed cues such as [music], (applause), {laughter}.
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, " ")
    // Remove common singing / caption markers.
    .replace(/[♪♫]+/g, " ")
    // Remove standalone caption cue lines like "applause", "laughter", "music", "subtitle".
    .replace(
      /\b(?:applause|laughter|laughing|music|singing|sings|subtitle|subtitles|closed captions?|caption|captions|background noise|crowd noise|ambient noise|sound effects?)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  const trimmed = stripped.trim();
  if (!trimmed) {
    return "";
  }

  const simplified = trimmed
    .toLowerCase()
    .replace(/[\[\](){}"'.!?,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!/[a-z0-9]/i.test(simplified)) {
    return "";
  }

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

type SpokenPunctuationToken = {
  key: string;
  phrase: string;
  symbol: string;
};

const spokenPunctuationTokens: SpokenPunctuationToken[] = [
  { key: "exclamation-mark", phrase: "exclamation mark", symbol: "!" },
  { key: "question-mark", phrase: "question mark", symbol: "?" },
  { key: "comma", phrase: "comma", symbol: "," },
  { key: "period", phrase: "period", symbol: "." },
  { key: "full-stop", phrase: "full stop", symbol: "." },
  { key: "colon", phrase: "colon", symbol: ":" },
  { key: "semicolon", phrase: "semicolon", symbol: ";" },
  { key: "open-parenthesis", phrase: "open parenthesis", symbol: "(" },
  { key: "close-parenthesis", phrase: "close parenthesis", symbol: ")" },
  { key: "open-quote", phrase: "open quote", symbol: "\"" },
  { key: "close-quote", phrase: "close quote", symbol: "\"" },
  { key: "quote", phrase: "quote", symbol: "\"" }
];

type SpokenPunctuationDecision = {
  key: string;
  resolution: "punctuation" | "literal";
  confidence: "high" | "medium" | "low";
};

function getLastWords(segment: string, count: number) {
  return segment
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-count);
}

function getFirstWords(segment: string, count: number) {
  return segment
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, count);
}

function decideSpokenPunctuationResolution(
  token: SpokenPunctuationToken,
  before: string,
  after: string,
  preferences: SpokenPunctuationPreferenceMap
): {
  resolution: "punctuation" | "literal";
  confidence: "high" | "medium" | "low";
} {
  const beforeWords = getLastWords(before, 4);
  const afterWords = getFirstWords(after, 4);
  const beforeText = beforeWords.join(" ");
  const afterText = afterWords.join(" ");
  const combinedContext = `${beforeText} ${afterText}`.trim();
  const preference = preferences[token.key];
  const preferenceDelta = (preference?.punctuationBias ?? 0) - (preference?.literalBias ?? 0);

  const literalCuePattern =
    /\b(?:word|literal|actual|spelled|spell|spelling|called|named|term|text|string)\b/;
  const punctuationCuePattern =
    /\b(?:insert|type|add|with|using|end|ending|ends|close|closed|open|opens)\b/;
  const explanatoryPattern =
    /\b(?:is|means|means the|looks like|spelled as|called)\b/;
  const terminalAfter = after.trim().length === 0 || /^[)\]}\s"'`]*$/.test(after.trim());
  const nextStartsNewSentence = /^[\s"'`)\]}]*[A-Z0-9]/.test(after);
  const previousEndsLikeClause = /[A-Za-z0-9"'\])]\s*$/.test(before);

  if (literalCuePattern.test(beforeText) || explanatoryPattern.test(afterText)) {
    return { resolution: "literal" as const, confidence: "high" as const };
  }

  if (punctuationCuePattern.test(combinedContext)) {
    return { resolution: "punctuation" as const, confidence: "high" as const };
  }

  if ((terminalAfter || nextStartsNewSentence) && previousEndsLikeClause) {
    return { resolution: "punctuation" as const, confidence: "medium" as const };
  }

  if (beforeWords.length === 0 && afterWords.length > 0) {
    return { resolution: "literal" as const, confidence: "medium" as const };
  }

  if (Math.abs(preferenceDelta) >= 3) {
    return {
      resolution: preferenceDelta > 0 ? "punctuation" : "literal",
      confidence: "low" as const
    };
  }

  return {
    resolution: token.symbol === "," || token.symbol === "." || token.symbol === "!" || token.symbol === "?"
      ? ("punctuation" as const)
      : ("literal" as const),
    confidence: "low" as const
  };
}

function applySpokenPunctuation(
  transcript: string,
  preferences: SpokenPunctuationPreferenceMap
) {
  let updatedTranscript = transcript;
  const decisions: SpokenPunctuationDecision[] = [];

  for (const token of spokenPunctuationTokens) {
    const pattern = new RegExp(`\\b${escapeRegExp(token.phrase)}\\b`, "gi");
    updatedTranscript = updatedTranscript.replace(pattern, (match, offset: number, input: string) => {
      const before = input.slice(0, offset);
      const after = input.slice(offset + match.length);
      const decision = decideSpokenPunctuationResolution(token, before, after, preferences);

      decisions.push({
        key: token.key,
        resolution: decision.resolution,
        confidence: decision.confidence
      });

      return decision.resolution === "punctuation" ? token.symbol : match.toLowerCase();
    });
  }

  updatedTranscript = updatedTranscript
    .replace(/\s+([,.;:!?)(\]])/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .replace(/([,.;:!?])([A-Za-z0-9])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();

  recordSpokenPunctuationDecisions(
    decisions
      .filter((decision) => decision.confidence !== "low")
      .map((decision) => ({
        key: decision.key,
        resolution: decision.resolution,
        weight: decision.confidence === "high" ? 2 : 1
      }))
  );

  return updatedTranscript;
}

function applyCodingLanguageFormatting(transcript: string) {
  const extensionWords = [
    "ts",
    "tsx",
    "js",
    "jsx",
    "json",
    "md",
    "html",
    "css",
    "scss",
    "py",
    "cs",
    "cpp",
    "c",
    "h",
    "hpp",
    "java",
    "kt",
    "go",
    "rs",
    "php",
    "rb",
    "yml",
    "yaml",
    "toml",
    "env",
    "sh",
    "sql"
  ];

  const lowerCaseTerms = [
    "npm",
    "pnpm",
    "yarn",
    "bun",
    "npx",
    "git",
    "github",
    "gitlab",
    "powershell",
    "bash",
    "zsh",
    "cmd",
    "json",
    "yaml",
    "toml",
    "markdown",
    "typescript",
    "javascript",
    "node",
    "react",
    "vite",
    "electron",
    "tsx",
    "jsx",
    "html",
    "css",
    "scss",
    "sql"
  ];

  let formatted = transcript
    .replace(/\bdot dot\b/gi, "..")
    .replace(/\bdash dash\b/gi, "--")
    .replace(/\bdouble dash\b/gi, "--")
    .replace(/\bforward slash\b/gi, "/")
    .replace(/\bback slash\b/gi, "\\")
    .replace(/\bslash\b/gi, "/")
    .replace(/\bbackslash\b/gi, "\\")
    .replace(/\bunderscore\b/gi, "_")
    .replace(/\bhyphen\b/gi, "-")
    .replace(/\bdot\b/gi, ".")
    .replace(/\bcolon\b/gi, ":")
    .replace(/\bsemicolon\b/gi, ";")
    .replace(/\bcomma\b/gi, ",")
    .replace(/\bequals\b/gi, "=")
    .replace(/\bplus\b/gi, "+")
    .replace(/\bminus\b/gi, "-")
    .replace(/\basterisk\b/gi, "*")
    .replace(/\bpipe\b/gi, "|")
    .replace(/\bbacktick\b/gi, "`")
    .replace(/\bopen bracket\b/gi, "[")
    .replace(/\bclose bracket\b/gi, "]")
    .replace(/\bopen brace\b/gi, "{")
    .replace(/\bclose brace\b/gi, "}")
    .replace(/\bopen parenthesis\b/gi, "(")
    .replace(/\bclose parenthesis\b/gi, ")")
    .replace(/\bdouble quote\b/gi, "\"")
    .replace(/\bquote\b/gi, "\"")
    .replace(/\bsingle quote\b/gi, "'")
    .replace(/\bpackage dot json\b/gi, "package.json")
    .replace(/\bpackage json\b/gi, "package.json")
    .replace(/\bread me dot md\b/gi, "README.md")
    .replace(/\bread me\b/gi, "README")
    .replace(/\bgit ignore\b/gi, ".gitignore")
    .replace(/\benv\b/gi, ".env")
    .replace(/\s+([/\\._,:;!?=+\-*|)\]}])/g, "$1")
    .replace(/([/\\([{])\s+/g, "$1");

  for (const extension of extensionWords) {
    const pattern = new RegExp(`\\b([A-Za-z0-9_-]+)\\s*\\.\\s*${extension}\\b`, "g");
    formatted = formatted.replace(pattern, (_match, fileBase: string) => `${fileBase}.${extension}`);
  }

  for (const term of lowerCaseTerms) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    formatted = formatted.replace(pattern, term);
  }

  return formatted
    .replace(/\s{2,}/g, " ")
    .trim();
}

function applyProfanityFilter(transcript: string) {
  const profanityPatterns = [
    /\bfuck(?:ing|ed|er|ers)?\b/gi,
    /\bshit(?:ty|ting|ted|s)?\b/gi,
    /\bbitch(?:es)?\b/gi,
    /\basshole(?:s)?\b/gi,
    /\bdamn\b/gi,
    /\bcrap\b/gi,
    /\bbastard(?:s)?\b/gi,
    /\bdick(?:head|heads)?\b/gi,
    /\bpiss(?:ed|ing)?\b/gi
  ];

  return profanityPatterns
    .reduce((current, pattern) => current.replace(pattern, " "), transcript)
    .replace(/\s+([,.;:!?)(\]])/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function applySmartFormatting(transcript: string, preserveCodeStyle = false) {
  const numberWords: Record<string, string> = {
    zero: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10"
  };

  let formatted = transcript
    .replace(/\bnew paragraph\b/gi, "\n\n")
    .replace(/\bnew line\b/gi, "\n")
    .replace(/\bbullet point\b/gi, "\n- ")
    .replace(/\bbullet\b/gi, "\n- ")
    .replace(/\bdash\b/gi, "\n- ");

  formatted = formatted.replace(
    /\b(?:number|item)\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
    (_match, word: string) => `\n${numberWords[word.toLowerCase()] ?? word}.`
  );

  formatted = formatted
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const lines = formatted.split("\n").map((line) => line.trim());
  if (preserveCodeStyle) {
    return lines
      .join("\n")
      .replace(/([a-z0-9])([.!?])([A-Za-z])/g, "$1$2 $3")
      .trim();
  }

  formatted = lines
    .map((line) => {
      if (!line) {
        return "";
      }

      const bulletMatch = line.match(/^(-\s+|\d+\.\s*)(.+)$/);
      if (bulletMatch) {
        const prefix = bulletMatch[1] ?? "";
        const content = bulletMatch[2] ?? "";
        return `${prefix}${content.charAt(0).toUpperCase()}${content.slice(1)}`;
      }

      return `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
    })
    .join("\n");

  formatted = formatted.replace(/([a-z0-9])([.!?])([A-Za-z])/g, "$1$2 $3");
  if (!formatted.trim()) {
    return "";
  }

  return formatted
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`)
    .replace(/\n([a-z])/g, (_, char: string) => `\n${char.toUpperCase()}`);
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
  const normalizedTranscript = normalizeTranscript(
    applyManualDictionary(rawTranscript, args.manualDictionary)
  );
  const spokenPunctuationPreferences = readData().spokenPunctuationPreferences;
  const punctuationNormalizedTranscript = args.settings.codingLanguageMode
    ? applyCodingLanguageFormatting(applySpokenPunctuation(normalizedTranscript, spokenPunctuationPreferences))
    : applySpokenPunctuation(normalizedTranscript, spokenPunctuationPreferences);
  const formattedTranscript = args.settings.smartFormatting
    ? applySmartFormatting(punctuationNormalizedTranscript, args.settings.codingLanguageMode)
    : punctuationNormalizedTranscript;
  const transcript = args.settings.filterProfanity
    ? applyProfanityFilter(formattedTranscript)
    : formattedTranscript;

  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    transcript,
    elapsedMs: Date.now() - startedAt
  };
}
