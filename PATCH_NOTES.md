# WhispARR Patch Notes

This file is the internal source of truth for release notes and version-to-version changes.
It is intended for maintenance, release prep, and populating update notes. It is not wired into
the app UI directly.

## Versioning Notes

- Add new releases to the top of this file.
- Keep older entries below newer ones.
- Group changes by user-facing impact when possible.
- Prefer concise bullet points over implementation details.

## 1.1.9

- Fixed the always-visible pill so it stays on screen after auto-paste and remains more stable during rapid toggling, clicking, pasting, and settings changes.
- Fixed the transcription audio reduction path so volume control targets the correct output device more reliably instead of silently failing.
- Added selectable output-device targeting for `Lower Volume on Transcription`, including macOS support.
- Added an in-app microphone input-device selector for macOS and kept device refresh controls available in Settings.
- Tightened and simplified the sound-file settings section with a more compact, more minimal layout.

## 1.1.8

- Fixed the macOS updater flow so WhispARR stops attempting the failing in-place auto-install path and instead opens the correct release download for manual update on Mac.
- Added the required macOS ZIP release artifacts and updater metadata path for future releases so mac update feeds resolve correctly.

## 1.1.7

- Added a full macOS local-engine install path so WhispARR can use a bundled runtime, Homebrew `whisper-cpp`, or a local whisper.cpp build instead of failing on Mac installs.
- Improved macOS runtime verification so engine checks are lighter, more reliable, and produce clearer error details when verification fails.
- Fixed pre-install update notes so release notes render cleanly instead of showing escaped HTML-like markup.
- Persisted patch-note dismissal by version so dismissed hotfix notes do not reopen after restarting the app.
- Fixed permanent progression so daily challenge rollover no longer resets XP, total words, achievements, or long-term user progress.
- Changed onboarding completion tracking to stay completed per install instead of resurfacing unexpectedly after profile or restart state changes.
- Fixed dictated clipboard persistence so repeated-paste behavior now works correctly when clipboard history saving is enabled, including on macOS.
- Added press-and-hold dictation directly from the always-visible pill without stealing typing focus from the app the user is working in.
- Restored live pill waveform/audio-meter behavior so the HUD reacts to speech again during dictation and microphone testing.
- Added safer pill dragging so move mode never activates push-to-talk, plus a new optional `Ctrl + Alt` drag shortcut in Settings.
- Replaced media pausing with a new `Lower Volume on Transcription` setting that lowers Windows system output volume during dictation and restores it afterward.
- Added a configurable reduced-volume slider for transcription ducking and moved that control into the right-side audio slider area for a cleaner settings layout.

## 1.1.6

- Fixed the in-app patch notes display so update notes render as a clean bulleted list instead of showing raw HTML-like formatting.
- Removed the `Skip this version` action from the post-install patch notes modal once that version has already been installed.
- Added a new setting to let users keep dictated text in supported clipboard history tools, including Windows Clipboard History, while leaving it off by default.
- Removed automatic dictionary learning so dictionary improvements now come from explicit manual entries instead of background clipboard scanning.
- Fixed the HUD audio waveform path so the pill reacts to live speech again during dictation and microphone testing.
- Removed all mouse movement and click-based paste targeting so auto-paste only runs when the original target app is still focused.

## 1.1.5

Released: 2026-03-25

Highlights

- Fixed paste targeting so dictated text returns to the original app and click position more reliably instead of drifting farther off over time.
- Strengthened dictionary usage and automatic learning so corrected words, names, brands, and phrases are more likely to stick after users fix them.
- Refined daily challenge behavior so challenge sets rotate at local midnight while levels, achievements, streak tracking, and long-term progression remain intact.

Behavior and Fixes

- Restored the original paste target before auto-paste so dictation is inserted back where the user started instead of wherever focus drifted later.
- Fixed onboarding persistence so skipping or completing setup is remembered properly and no longer reappears incorrectly after reopening the app.
- Fixed onboarding completion tracking to respect the current user/profile scope instead of collapsing back into a single install-wide state.
- Restored daily challenge midnight resets using the computer's local timezone while keeping permanent progression cumulative.
- Updated the Stats and challenge interface copy so daily resets apply only to the challenge set and not to overall user progress.

Dictionary and Learning

- Improved manual dictionary matching so saved terms can correct close mis-hearings more aggressively, including custom names and longer words.
- Improved phrase handling so multi-word dictionary entries can influence transcript cleanup instead of only exact single-word replacements.
- Re-applied dictionary cleanup after formatting passes so preferred spellings survive punctuation and casing adjustments.
- Expanded auto dictionary learning so corrections made within the one-minute review window can save stronger replacements instead of only very small spelling changes.
- Improved auto-learning for larger custom-word corrections such as `Dumrat` to `Doomwrought`.
- Allowed more than one strong correction candidate to be learned from the same post-paste edit session when appropriate.

Clipboard and Paste Flow

- Prevented dictated clipboard staging from polluting Windows clipboard history during both auto-paste and one-time manual paste flows.
- Continued restoring the user's real clipboard contents after WhispARR uses the clipboard for dictated text.

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
