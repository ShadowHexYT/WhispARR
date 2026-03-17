import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = packageJson.version;
const unpackedDir = path.join(releaseDir, "win-unpacked");

function fail(message) {
  console.error(`\n[verify-package] ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`\n[verify-package] Warning: ${message}`);
}

function assertExists(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing required packaged file: ${relativePath}`);
  }
}

if (!fs.existsSync(unpackedDir)) {
  fail("Missing release/win-unpacked. Run the Windows distributable build before verification.");
}

assertExists(path.join("release", "win-unpacked", "WhispARR.exe"));
assertExists(path.join("release", "win-unpacked", "resources", "app.asar"));
assertExists(path.join("release", "win-unpacked", "resources", "assets", "WhispARR Image.png"));
assertExists(
  path.join(
    "release",
    "win-unpacked",
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "uiohook-napi"
  )
);

const installerName = `WhispARR-${version}-windows-x64.exe`;
assertExists(path.join("release", installerName));

const packagedRuntimeDir = path.join(unpackedDir, "resources", "runtime");
assertExists(path.join("release", "win-unpacked", "resources", "runtime"));

const runtimeEntries = fs.readdirSync(packagedRuntimeDir, { withFileTypes: true });
const hasBundledBinary = runtimeEntries.some((entry) => {
  if (!entry.isDirectory()) {
    return false;
  }

  return entry.name === "bin" || entry.name === "models" || entry.name === "Release";
});

if (!hasBundledBinary) {
  warn(
    "No bundled local engine binaries/models were found under release/win-unpacked/resources/runtime. " +
      "The packaged app will still work, but it will need to download/install the local engine after first launch."
  );
}

console.log("[verify-package] Packaged app audit passed.");
