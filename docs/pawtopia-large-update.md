# Pawtopia: large improvement release

This release implements the agreed gameplay, decoration, room-feedback and mobile-comfort package on `feature/pawtopia-3-1-rooms`. It preserves existing coin/XP amounts, Daily Rewards and collection payouts. New long-term and weekly goals award badges only, with no new currency. No Jerry media, models, animations or background image files change.

Final edge QA also corrected floating-point clamping at fractional decoration sizes: minimum and maximum bounds are normalized and candidate points are reclamped after rounding, preventing an attempted left-edge placement from jumping to the opposite edge.

## Plan and implementation

| # | Improvement | Delivered behavior | Evidence |
| --- | --- | --- | --- |
| 1 | Today in Pawtopia | Adventures & tools → Today combines gifts/task readiness, saved levels/stars/badges and real Continue/Daily Rewards routes. It never claims automatically. | Experience UI tests |
| 2 | Long-term goals | Eight milestones use existing wins, rounds, stars, levels, owned decor and decorated-room progress. Legacy progress contributes. | Core migration/badge tests |
| 3 | Achievement album | Progress indicators, permanently earned badges and recent weekly badges; removals cannot relock earned badges. | Core and UI album tests |
| 4 | Weekly challenge | Finish 5 rounds, try 3 games and win once. Weeks start Monday in device-local time. Completed weekly badges remain; missed days do not reduce them. No extra coins/XP. | Clock-controlled weekly tests |
| 5 | Personal bests | A saved new record is labelled in real game results; failed results wait for Retry Save. All 16 game records appear in a separate screen. | Actual round/save-retry UI tests |
| 6 | Favorite decorations | Per-item stars save in preferences; Favorites intersects query, stock and theme. | Favorites persistence/failure tests |
| 7 | Decoration sorting | Recommended, name, ascending price and available-copy count. Saved choice survives reload. | Sort order and rollback tests |
| 8 | Preview before buying | Try in room closes Shop and displays a movable preview even for an unowned or Day 7 item. Nothing is purchased; Back to Shop returns to the item. | Preview in all five rooms; exact save comparisons |
| 9 | Resize decorations | Selected Edit Decor items have −/+ size controls, from 65% to 150%. Relative scaled bounds avoid scene edges and care buttons; Confirm/Cancel retain normal semantics. | All items/rooms/edges at four scales plus every 5% scale step and an imported fractional size; UI obstacle/resize tests |
| 10 | Undo last decor change | Only in Edit Decor, Undo asks confirmation before undoing the last placement, move, resize, removal or transfer. It restores the exact instance without refund or repurchase, is single-use and checks stale state. | Core and UI undo/retry/reload tests |
| 11 | Room object reactions | Transparent, labelled touch areas offer short pillow/cushion, toy, curtain or leaf feedback; no pet action, save write or resource change. | Pointer-scroll suppression, no-Jerry/no-save and modal cleanup checks; artwork alignment remains manual |
| 12 | Light/water feedback | Existing fixture controls add a finite visual pulse after toggle while retaining existing on/off glow, streams and ARIA state. | Fixture pulse/resize/backup-dialog cleanup checks |
| 13 | Plant/flower variants | Leaf plants and flowering decor have different leaf/bloom accents and drop colors without changing SVG artwork. | Reaction classes and read-only UI checks |
| 14 | Effect intensity | Settings → Effects chooses Normal/Minimal. OS reduced-motion remains respected. Minimal mode settles decoration/game feedback and stops room water/bowl animation; Jerry media stays unchanged. | Minimal-mode, reduced-motion and existing celebration tests |
| 15 | Independent room volume | Settings → Room volume scales ambience; zero stops it while Game sounds remains enabled. Audio still needs opt-in and a user gesture. | Audio mock envelope scaling, zero mute, failed-save rollback and reload |
| 16 | Compact additional tools | A collapsed Adventures & tools group lives outside the room image. Main care buttons, room aspect ratio and Jerry placement are retained. | Structural/DOM checks; device layout manual |
| 17 | Back navigation | Album, Weekly and Records return to Today; preview returns to Shop; room lists keep their existing Back routes. Focus traps include input/select/native room summaries. | UI routes and keyboard regression tests |
| 18 | Failed-save warning | A visible alert reports failed primary writes. Retry saves current visible state; if a game result awaits saving, it delegates to that round's safe Retry Save. | Failed preference/game/undo saves, primary-write rollback and successful retry |
| 19 | Optional backup suggestions | Suggest a new JSON backup after 5 new completed levels, 3 new decor copies or 20 rounds since the last prepared backup. Later snoozes this session; Settings can disable suggestions. | Threshold, settings, snooze and download-preparation acknowledgement tests |
| 20 | Mobile and regression checks | Automated pointer, bounds, orientation-interruption, 320px/390px layout structure, persistence, game and Baby/Puppy/Adult routes pass. Actual Safari gestures, native audio and visual alignment remain a device check. | 185 automated tests; attempted Chromium launch blocked by `socket() failed: Operation not permitted` |

## Saved data and recovery

The existing primary save and immutable migration/recovery backups remain in place. Schema version stays 4; decoration version stays 2. Optional placement `scale` defaults to 1 for old data. Import validates scale and rejects unsupported scaled positions rather than silently dropping size.

New `world.preferences` stores decor favorites/sort, effects, room volume and backup-suggestion preference. New `journey` stores earned badges, current weekly progress/deduplicated round IDs, completed weeks, record annotations and the last prepared-backup checkpoint. `world.decorUndo` stores independent before/after placement copies, not aliases of live placements. All new state uses the existing transactional save and backup paths. Viewing Today/records, searching, previewing and feedback effects do not write progress; changing settings/favorites, confirming decor changes and acknowledging a prepared backup do.

A prepared download is the browser's download handoff, not proof the user retained a file in Files. Keep the actual JSON file outside the browser. Weekly history starts with new completed rounds after this feature is installed; long-term achievements and personal-record displays use existing saved progress immediately.

## Validation and remaining manual checks

`npm test`: **185 passed, 0 failed**. Syntax checks passed for all 35 modified/new JavaScript and CJS files. The full suite retains the prior 200 decoration-transfer scenarios, campaign solutions, atomic reward retries, backup recovery, inventory/room rules and Baby/Puppy/Adult action-media regression checks. Tests load the actual persistence helper when isolating the real game finish function, preserving failure injection rather than bypassing storage.

A local Playwright Chromium launch was attempted and failed before page creation because this runtime prohibits socket creation. This is not a visual browser pass. The private Preview also retains its existing HTTP password challenge. Before treating device QA as complete, check on iPhone Safari: native audio unlock/volume, exact object-touch alignment on each unchanged room artwork, keyboard and disclosure navigation, physical drag/resize/cancel, rotation, no horizontal overflow and file download retention. Render Live and the protected HTTP response confirm deployment/service availability, not those device behaviors.
