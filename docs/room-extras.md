# Decor sets, room ambience and first-run tips

## Three decor sets

| Set | Items | Individual coin prices |
| --- | --- | --- |
| Seaside Bathroom | Shell Vase; Ocean Print | 30; 45 |
| Cozy Bedroom | Lavender Pot; Moon & Stars | 35; 45 |
| Blooming Garden | Tulip Bouquet; Rose Planter | 35; 40 |

Shop → Decor and Inventory include theme filters and All Decor. These are groups of separately purchased items, not paid bundles or new collection rewards. Every item is available in every room. Native SVG artwork follows the existing decor system and never replaces backgrounds or Jerry assets. Copies use the existing purchase, draft, drag, confirm, Edit Decor, remove and free-reinstall flow. Collection links clear theme filters so an older collection item remains visible.

## Room ambience

Settings → Room ambience is off by default and saved as `world.roomSound`. The existing Game sounds switch is the master mute. After enabling ambience, a tap or Enter/Space unlocks Web Audio. Living Room has soft filtered crackle, Kitchen gentle chimes, Bedroom filtered night breeze, Bathroom filtered water and Garden birdlike tones. All sounds are synthesized locally in short, quiet envelopes; there are no external audio services or asset downloads.

Active sources and timers stop on room changes, all game/shop/backup/decor-confirm dialogs, backgrounding, pagehide and mute. The next eligible visible room resumes. Stale asynchronous AudioContext resumes cannot revive the previous room or muted audio. Unsupported/rejected audio degrades silently without changing saved progress.

## Quick tour

A nonblocking card outside the room image introduces games, Shop, Place here/Edit Decor, and JSON backups. Next, Done and Skip are available; action links open the actual feature. Automatic display does not steal focus or launch a dialog. Completion is stored as `world.guideVersion: 1`; Settings → Quick tour → Show tips replays it. Failed preference saves allow retry. Backup restore applies the imported completion preference. Viewing tips or using sounds never grants/spends coins or changes XP and rewards.

## Verification

`npm test`: 185 automated tests. New checks cover all six items in every room, touch placement without early confirmation, locked handles after confirming, reactions, return to Inventory, free reinstall, saved coordinates and backup round trips; tour navigation, dismissal, replay and failed saves; opt-in audio, mute, modal/background cleanup, unsupported audio and asynchronous resume races. The previous mini-game, Baby/Puppy/Adult and reward regression checks remain enabled.

These are automated model and DOM/event tests. Actual iPhone Safari audio, physical gestures, orientation changes and visual layout still require a manual device check in the authenticated private Preview. Headless Chromium is unavailable in this execution environment because socket creation is restricted. Render Live and the HTTP password challenge verify deployment/service availability, not a visual browser check.
