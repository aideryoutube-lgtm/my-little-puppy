# Decoration reactions

Confirmed flowers and plants can be watered by tapping; pictures gently sway and sparkle. Other decoration types receive a short sparkle fallback. This feedback works in all five rooms and never writes save data, changes coins/XP/rewards, moves decorations, or starts Jerry media.

Normal-mode feedback uses a separate accessible button. Movement, selection and removal remain exclusively in Edit Decor; entering that mode stops feedback and hides the normal reaction button. Confirm and Done keep edit handles locked in normal play.

Effects are finite and rate-limited. Scroll gestures, cancelled touches and secondary fingers do not water plants. Effects clear on room changes, modal opening, backup restoration, resize and backgrounding. Reduced-motion users receive a static symbol. Decoration layers retain lower priority than Jerry and care buttons.

Validation: `npm test` passes all 185 tests, including every current decoration in every room, immutable saved progress, touch cancellation, keyboard activation, edit/delete controls, restore with reused instance IDs, modal cleanup and reduced motion.

Actual iPhone Safari gestures and visual layout still need manual verification. Headless Chromium cannot start in this environment because socket creation is restricted; the password-protected Preview cannot be visually verified here. Automated DOM/event checks do not replace a device check.
