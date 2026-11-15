# Pawtopia mini-game trails

All 16 mini-games now have ten levels: **160 levels and 480 best-result stars**.
The hub shows the overall total. Each game's map unlocks the next level after a
saved win. Replays keep the best star result. Each completed map grants a single
50-coin bonus; subsequent wins grant only the normal round reward.

| Game | Level progression |
| --- | --- |
| Block Garden | Clear 2–11 lines |
| Falling Blocks | Clear 1–10 lines; falling speed increases |
| Snake Garden | Collect 3–12 apples; movement speed increases |
| Memory Pairs | Match 3–10 pairs with level-specific timers |
| Treat Time | Find 4–22 treats; timer decreases from 45 to 36 seconds |
| Bone Catch | Catch 5–23 bones in 35 seconds; boots subtract points |
| Ball Run | Collect 3–12 balls in 45 seconds; avoid rocks |
| Treasure Hunt | Find 4–8 gems among 2–7 traps with level-specific timers |
| Jump Adventure | Travel 60–240 metres within 60 seconds; avoid crates |
| Puzzle Time | Rebuild 3×3, 4×4 and 5×5 images with distinct arrangements |
| 2048 | Reach tiles 16–256 on distinct seeded boards |
| Bubble Rescue | Clear ten authored boards with level-specific shot limits |
| Color Sort | Solve ten authored puzzles with 2–5 colors |
| Mole Patrol | Catch 5–23 moles in 45 seconds; avoid bombs |
| Jerry’s Maze | Reach the bone in distinct 7×7 through 13×13 mazes |
| Treat Match | Collect 15–60 treats within 15–24 moves |

Star criteria appear in each round's instructions: efficiency for board games,
completion time for Falling Blocks and Snake, remaining hearts for action games,
and avoided boots for Bone Catch. Timed failures do not unlock levels or earn
campaign-win rewards. Puzzle grid size and campaign level are separate values.

## Persistence and compatibility

The existing `jerry-save-v1` key, old mini-game records and old legacy rule entry
points remain supported. The first four maps retain `bubbleCampaign`,
`treasureCampaign`, `memoryCampaign` and `sortCampaign`. New maps use
`arcadeCampaigns[kind]`. Coin rewards, best stars, round IDs, daily mission
progress and completion bonuses are written together; a failed write restores
the previous state so Retry Save can safely retry. Existing purchases, room
decorations, XP, gifts and backup keys are preserved.

## Verification

`npm test` passes **185 automated tests**. Tests include all 160 authored/configured
levels, gameplay-driven wins for the 120 new rounds, all sixteen maps, DOM input
handlers and animation frames for levels 1 and 10 of each new trail, Next, pause,
reload, save failure/retry, independent progression and one-time bonuses.
Existing room/decor, inventory, daily reward, Baby/Puppy/Adult action routing and
disabled-idle-video checks also pass.

DOM integration is not visual browser verification. Real iPhone Safari touch,
layout, orientation changes and authenticated Preview playback remain manual
checks; the available Chromium process cannot start in this environment.
