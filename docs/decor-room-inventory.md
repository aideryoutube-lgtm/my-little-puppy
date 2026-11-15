# Rooms & Decor overview

Open Inventory → Decor → Rooms & Decor (also available from Shop → Decor) to see owned, placed and available copy totals and the individual decorations in all five rooms. Native disclosure groups show each room and mark the current room. Nonempty rooms and the current room start expanded; empty groups still remain visible. Each placed copy has its own row and Edit in room button, labelled with its item, room and copy number. IDs remain internal and are assigned through DOM properties, never interpolated into HTML.

Viewing the overview and returning with Back to Decor are read-only. The previous Shop/Inventory section, search, stock and theme filters remain available; closing the dialog normally keeps the original room. The overview updates from the current canonical save, including after backup restoration. It does not introduce new saved fields or migrations.

Edit in room validates the current instance, saves a normal room navigation if necessary, closes the dialog without returning to the old room, and selects the exact copy in Edit Decor. Normal navigation still records a room visit through the existing Daily Rewards mechanism; this feature does not grant coins or XP or alter reward amounts. A failed room save keeps the overview open in the original room and allows retry. Missing instances refresh the list without selecting another copy.

Moving and removal use the existing editor and confirmation flow. Remove returns one instance to available stock without a refund. Other copies remain installed; reinstallation remains free. Done locks edit handles again. Opening the overview does not make confirmed decorations editable outside Edit Decor.

The overview stays inside the existing scrolling modal, with controls at least 44px high, wrapping labels and a narrower layout below 350px. Native room summaries participate in the modal keyboard focus trap. Actual iPhone Safari layout, disclosure taps and physical drag gestures remain manual verification in the authenticated private Preview.

Validation: `npm test` passes all 162 automated tests. Six new model/DOM tests cover separate instances and totals, empty rooms, read-only browsing and Back filters/focus, keyboard trap, selection and reload in all five rooms, cancellation/removal/free stock, failed room saves and retries, stale references, backup refresh and treating instance IDs as text. Existing purchases, mini-games, rewards, Baby/Puppy/Adult, touch placement and backup checks remain enabled.
