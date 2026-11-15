# Continue, favorites and local backups

Mini Games provides a Continue button for the last played game. It immediately
starts the next unlocked level. Completed maps offer Replay at level 10. Every
map also has its own Continue button. Favorites use separate star buttons; the
All Games/Favorites filter does not start a round. Preferences are saved in
`miniPreferences` inside the existing save, without spending coins or XP.

Open **Settings → Save & Backup** to see the last successful save time and
summaries of coins, XP, levels, stars and decorations. Download backup creates a
local JSON file; no cloud account or upload is involved. Choose backup only
reads and previews a file. Restore save requires a separate confirmation.

The application validates the file and migrates older supported saves before
writing. Before replacement, it writes a uniquely named recovery copy under
`jerry-save-v1-backup-before-restore-…`. Existing migration backups and old
recovery copies are not removed or overwritten. Recovery copies can be reviewed
and restored in the same dialog. Insufficient storage prevents replacement; a
failed write keeps the current in-memory state and primary save intact. Keep an
exported JSON file outside the browser as protection against clearing site data.

Backups use format `PawtopiaSave`, version 1. The canonical `jerry-save-v1` state
retains its existing progress keys. `savedAt` records a successful write;
`saveRestoredAt` marks a canonical imported checkpoint so a stale legacy Bone
Catch best value cannot override its restored record. Export includes the old
legacy best when exporting a save that has not already been restored.

`npm test`: **184 passing tests**, covering all previous gameplay, decor and
reward checks plus Continue, favorites, JSON export, real File/FileReader input,
preview/Cancel/Confirm, recovery, storage failures and legacy migration.
Actual iPhone Safari download UI, visual layout and physical touch still require
manual verification; DOM checks are not visual browser checks.
