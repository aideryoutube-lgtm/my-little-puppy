# Pawtopia 2.0 verification

Based on main 7cacbed. Bone Catch derived from feature commit 0e1cbaba60fefe758d0fa0d06fa2c46228355fdd.

- `node --test tests/animations.cjs tests/bone-logic.cjs`: 31 passing checks.
- `node --check mini-games.js`: passed.
- Existing video files and mappings are unchanged. The regression suite simulates media events; it does not certify codec playback.
- Reward and best score are saved atomically in the existing `jerry-save-v1` object. The last rewarded round prevents duplicate claims. Existing balances, XP and other fields survive; the old unlimited-balance overwrite was removed. Care actions remain free as before.
- Bone Catch supports pointer and keyboard activation with a consumed-object guard. Abandoned/background rounds receive no reward. Rounds finish against a monotonic 30-second deadline.
- Existing standalone Bone Catch best-score storage is read for compatibility.
- `tests/bone-catch.cjs` contains mobile browser scoring/reload/navigation checks. It was NOT executed successfully here: installed Chromium cannot start because socket creation is denied. Set CHROMIUM_PATH if needed; otherwise use Playwright's installed Chromium.
- Manual iPhone Safari verification remains: all six actions and Touch/Idle at Baby, Puppy and Adult; no media-frame shift on return; Bone Catch tapping, rewards, reload and narrow-screen layout. Existing `tests/browser.html` provides a playback runner and restores saved state.
- No paid service was introduced.
