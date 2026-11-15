# Decor collections and victory presentation

Shop → Decor and Inventory → Decor link to **Collections**. Every set shows its
members, ownership progress and a one-time Collect button. Items placed in any
of the five rooms count just like items in inventory. Extra copies do not replace
a missing member. Existing purchases become eligible without automatic payment.

| Collection | Members | One-time reward |
| --- | --- | --- |
| Cozy Corner | Cozy Fern and Sunny Flowers | 25 coins |
| Art Lover | Paw Portrait and Golden Paw Portrait | 40 coins |

A missing normal item links to its Shop preview. The Golden Paw Portrait links to
Daily Rewards and remains a Day 7 reward-only item. Collection claims use the
existing atomic world transaction; a failed write leaves both coins and claim
eligibility intact. Lifetime claim IDs are stored in `world.collectionClaims`,
which survives room moves, removal to inventory, reload and JSON backup/restore.
Old saves require no reset. Existing prices, gift rewards and item quantities
are unchanged.

All sixteen mini-games share a result presentation: earned stars, a short coin
count-up and finite confetti. `game-celebration.js` is presentation only and runs
after the existing round reward saves successfully. Pending saves and losses do
not celebrate. Leaving results clears timers. Reduced-motion preferences show
static final values; changing that preference or hiding the page settles active
effects immediately. Effects cannot intercept buttons or award additional coins.

`npm test`: **168 passing tests**, including collection ownership in every room,
one-time claims, save failure/retry, Day 7 exclusivity, backup flags, count-up,
reduced motion, backgrounding and actual saved-round integration. Actual iPhone
Safari visual/touch verification remains manual.
