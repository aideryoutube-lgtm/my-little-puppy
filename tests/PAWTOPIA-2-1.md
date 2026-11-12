# Pawtopia 2.1 verification

Base: bd88df4343ae06d228780aa3fe86e2491cb06fdb on aideryoutube-lgtm/my-little-puppy main.

## Implemented

Five games share Start, Pause/Resume, Play Again, Back, results, synthesized optional sound effects, original Jerry stage images, and a persistent coin balance. Leaving a game abandons the active round without a reward; backgrounding pauses it.

| Game | Play | Round reward |
| --- | --- | --- |
| Bone Catch | Tap bones +1, boots -2; 30 seconds | floor(max(0, score)/5), cap 10 |
| Ball Run | Three lanes, swipe/buttons/arrows; balls, rocks, 3 hearts; 60 seconds | floor(score/5), cap 10 |
| Treasure Hunt | 5×5 board; 6 gems, 5 traps, adjacent trap hints, 3 hearts; 60 seconds | floor(score/3), cap 10; each gem 5 points |
| Jump Adventure | Tap/Space to jump; crates, 3 hearts, increasing speed; 90 seconds | floor(distance/50), cap 10 |
| Puzzle Time | Swap two image tiles; 3×3, 4×4, 5×5; reference preview | Completion only: 3 / 6 / 10 coins |

`jerry-save-v1` retains existing fields. `miniGames` stores per-game best, completed rounds and wins. `miniRounds` retains the latest 64 reward transaction IDs; the active UI also prevents repeated settlement. Best and coins commit together; failed saves roll back and expose Retry Save. Legacy standalone Bone Catch best is read. Main care actions, growth thresholds, media files and video mappings were not changed.

## Passed checks

- `node --check game-engine.js` and `node --check mini-games.js`.
- `node --test tests/animations.cjs tests/bone-logic.cjs tests/mini-games.cjs`: 45 passing checks. Includes pause, collisions, penalties, timing, solvability at all puzzle levels, limits, duplicate reward prevention, storage failure rollback/retry, XP and existing care-video regression.
- Cloud Chromium UI on mobile iframe widths 320, 390 and 430: no horizontal overflow; game selection, ready/start/pause/back, tile swaps, Bone Catch scoring, Treasure Hunt traps and results.
- Actual drag gesture moved Ball Run Jerry from center to left lane.
- Completed 3×3, 4×4 and 5×5 puzzles through visible tile interactions: +3, +6 and +10 coins. Browser balance advanced from 100 to 119; after reload balance 119 and puzzle best 1542 remained.
- Existing browser playback runner: Baby 0 XP, Puppy 100 XP, Adult 300 and 600 XP all PASS. 24 actual action playbacks, Idle interruption, Touch hit-test, still restoration, unchanged scene bounds, reload and growth reset. Test saved progress restored.

## Limits

Cloud Chromium is not physical iPhone Safari. Manually verify Safari touch/swipe, audio unlock and full game rounds on a real iPhone. No claim of native Safari testing.

No paid service or external game asset was added. Published using the existing GitHub Pages workflow.
