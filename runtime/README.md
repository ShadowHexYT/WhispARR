Place bundled offline speech runtime files here before packaging:

- `runtime/bin/whisper-cli.exe` on Windows or `runtime/bin/whisper-cli` on macOS
- `runtime/models/<model>.bin` or `.gguf`

The packaged app will auto-detect these files on launch.
