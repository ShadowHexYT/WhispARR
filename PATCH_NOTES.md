# WhispARR Patch Notes

This file is the internal source of truth for release notes and version-to-version changes.
It is intended for maintenance, release prep, and populating update notes. It is not wired into
the app UI directly.

## Versioning Notes

- Add new releases to the top of this file.
- Keep older entries below newer ones.
- Group changes by user-facing impact when possible.
- Prefer concise bullet points over implementation details.

## 1.1.4

Released: 2026-03-18

Highlights

- Added a fuller in-app update experience so release notes can be reviewed during update checks and then shown again after installation completes.
- Refined the app shell with a shimmer-and-glow brand hover, a visible version label under the WhispARR title, and compact sidebar quick links for GitHub, Legal Information, and Terms of Service.
- Expanded tray controls for showing the app, jumping to Settings, restarting the local engine, toggling the always-visible pill, and quitting quickly.

Behavior and Fixes

- Fixed a startup issue that could cause onboarding prompts to reappear for returning users after onboarding had already been completed.
- Fixed the always-visible pill audio behavior so transition sounds no longer overlap incorrectly on release.
- Updated daily challenges to follow the computer's local timezone for midnight resets and cleaned up related wording throughout the interface.
- Improved update dialogs with tighter no-update spacing and clearer current-version messaging when no newer build is available.
- Improved clipboard cleanup so dictated text is restored or cleared after use instead of lingering as the active clipboard item.

Auto Dictionary

- Reworked automatic dictionary learning so it focuses on genuine recognition mistakes instead of broad rewrites or stylistic edits.
- Restricted auto-learning to corrected misheard words that improve future dictation quality rather than trying to capture every user change.
- Improved the correction heuristics so unacceptable or clearly incorrect substitutions can be recovered when the user fixes them after dictation.
- Reduced over-capture by limiting automatic learning to the strongest correction candidate from the post-dictation review window.
- Simplified dictionary presentation by removing unnecessary automatic-labeling language and tightening how saved corrections are displayed.

Updates and Release Flow

- Bumped the application version to `1.1.4`.
- Added internal release-note tracking and a release-note publishing flow so GitHub release descriptions, update checks, and post-install patch notes stay aligned.
- Preserved installed-version patch notes locally so users can dismiss them, skip a version, or turn them off entirely after updating.

Brand, Navigation, and Seasonal Extras

- Made the `WhispARR` application name clickable, with a direct path to the GitHub page after confirmation.
- Kept the hidden 20-click developer-mode unlock on the application icon only so the title link and Easter egg no longer compete.

## 1.1.3 And Earlier

Formal patch note tracking had not yet been established in-repo before `1.1.4`.
Older versions can be backfilled later if needed, but `1.1.4` is the first maintained baseline in this file.
