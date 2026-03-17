# WhispARR

WhispARR is a fresh rebuild of the product as a cross-platform desktop app for Windows and macOS with a strict local-only processing model.

## What it does

- Lets the user select which microphone to use for dictation.
- Stores settings and voice profiles only on the current device.
- Records local audio in the renderer and sends it only to the Electron main process.
- Supports local voice-profile training for speaker verification before transcription.
- Runs transcription through a locally installed `whisper.cpp` binary and model file.

## Local-only design

- No cloud API integration is included.
- No telemetry or analytics code is included.
- No remote sync is included.
- Voice profiles are stored as lightweight local embeddings in the Electron user-data folder.
- Audio for transcription is written to a temporary local WAV file and deleted after the local binary finishes.

## Development

```bash
npm install
npm run dev
```

## Packaging

```bash
npm run dist
```

This is configured to build for:

- Windows via NSIS
- macOS via Electron Builder

## Local speech engine requirement

To keep transcription completely local, the app expects a local speech runtime:

- A local `whisper.cpp` executable
- A local Whisper model file

The app can now:

- Auto-search common local runtime folders
- Auto-search packaged `runtime/` resources bundled with the installer
- Configure the discovered binary and model automatically from Settings
- Download and install the local runtime into the app data folder from inside the app on supported platforms

## Packaging the runtime with the app

If you want users to install the app and have dictation work immediately, place files here before
running `npm run dist`:

- `runtime/bin/whisper-cli.exe` on Windows or `runtime/bin/whisper-cli` on macOS
- `runtime/models/<your-model>.bin` or `.gguf`

Electron Builder will package that `runtime/` folder inside the app, and the app will auto-detect it on launch.

## One-stop setup flow

For the best first-run experience:

- Ship packaged builds with the runtime already included under `runtime/`
- Let users open the app and click `Install everything` only for lean builds or self-updating runtime installs

The app then stores the runtime locally and only needs the user to:

- Confirm or change the push-to-talk shortcut
- Train a voice profile if speaker verification is desired
