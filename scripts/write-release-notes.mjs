import fs from "node:fs";
import path from "node:path";

const versionArg = (process.argv[2] ?? "").trim().replace(/^v/i, "");
const outputArg = (process.argv[3] ?? "").trim();

if (!versionArg) {
  console.error("Usage: node scripts/write-release-notes.mjs <version> [output-file]");
  process.exit(1);
}

const repoRoot = process.cwd();
const patchNotesPath = path.join(repoRoot, "PATCH_NOTES.md");
const patchNotes = fs.readFileSync(patchNotesPath, "utf8");

const escapedVersion = versionArg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sectionPattern = new RegExp(
  `^##\\s+${escapedVersion}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`,
  "m"
);

const match = patchNotes.match(sectionPattern);
if (!match) {
  console.error(`Could not find patch notes for version ${versionArg}.`);
  process.exit(1);
}

const body = match[1]
  .trim()
  .replace(/^###\s+/gm, "")
  .replace(/^##\s+/gm, "")
  .trim();

const releaseNotes = `WhispARR ${versionArg}\n\n${body}\n`;

if (outputArg) {
  fs.writeFileSync(path.resolve(repoRoot, outputArg), releaseNotes, "utf8");
} else {
  process.stdout.write(releaseNotes);
}
