# Decoration search and stock filters

Shop → Decor and Inventory → Decor now have a local search field, a stock selector and the existing theme filters. These controls only change the visible list; they never write to localStorage, spend coins, change rewards or begin placement.

Search matches item names, IDs, themes, types and common English/Russian aliases (e.g. lavender/лаванда, shell/ракушка, tulip/тюльпаны, moon/звёзды). Case, repeated spaces, apostrophes, hyphens and ё/е are normalized. Search is capped at 80 characters; user text is assigned through the input value property and never inserted into HTML.

| Show filter | Meaning |
| --- | --- |
| All items | All matching items in the current Shop/Inventory and theme |
| Owned | At least one purchased or rewarded copy |
| Available to place | At least one unplaced copy, using the existing instance counts |
| In this room | At least one copy placed in the current room |

A copy placed in a different room is not an available unplaced copy. All items still allows the existing free transfer through Place here. Multiple copies are counted independently. Theme, stock and query filters intersect. Clear empties only the query; Reset filters clears query, stock and theme together. Empty inventories link to Shop without changing rooms. Item purchases immediately update availability, while failed saves preserve wallet and stock.

Input and select controls are at least 44px high with 16px text. Typing only toggles product visibility and preserves the input, focus and keyboard. Enter focuses the first matching preview without buying or placing. Escape first clears a nonempty query; a subsequent Escape closes the Shop. Composition keystrokes do not close the dialog. The modal focus trap includes inputs and selects as well as buttons.

Filters are transient: a fresh Shop/Inventory opening or backup restore resets them. Within an open dialog, changing themes and categories preserves the query/stock controls. Collection item links reset filters so the requested item stays visible. Placement still closes Shop, retains the originating room, waits for a drag before Confirm, and supports Cancel and free reinstallation through the existing editor.

Validation: all 168 automated tests pass. New model and DOM/event tests cover aliases, future item types, independent copies, theme/stock intersections, typing and empty states, keyboard/composition, focus trapping, all five rooms through the existing placement suite, Inventory placement/removal, failed purchase retry, restored progress and collection links. Actual iPhone Safari keyboard, visual layout and physical gestures remain manual checks in the authenticated private Preview.
