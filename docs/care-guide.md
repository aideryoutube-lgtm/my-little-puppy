# Care for Jerry

## Design comparison (2026-11-15)

| Game | Publisher-described loop | Pawtopia opportunity |
| --- | --- | --- |
| My Talking Tom 2 | Care, contextual activities, skills, snacks, collections and room customization | Make Jerry's current needs actionable before adding more game menus |
| Pou | Feed, clean, play, grow, customize rooms/outfits and unlock achievements | Connect existing care, progression and room systems more clearly |

Sources: https://apps.apple.com/tr/app/my-talking-tom-2/id1337578317 and https://play.google.com/store/apps/details?id=me.pou.app . This is a comparison of published descriptions, not hands-on competitor testing or proof of retention impact.

## Delivered first addition

A collapsed Care for Jerry panel below the emotion line, outside the unchanged room image. Four labelled native meters show food, cleanliness, energy and fun from the canonical save. The lowest value below 70 determines Jerry's suggestion; below 40, the collapsed summary flags the need. At 70 or above for every need, the panel offers relaxed activities. Ties use stable food/cleanliness/energy/fun priority.

Buttons route through existing room navigation. They do not feed, bathe, sleep, spend coins or grant rewards automatically. The current-room button is disabled. Failed storage writes retain the original room and show a retry message. State and restore events refresh the panel; there is no new persistent schema, timer, currency or inactivity animation.

## Validation

Three integration tests exercise the actual inline state script, world UI and new guide: read-only rendering, four live meters, lowest-need priority, safe room navigation, no automatic actions, successful feeding refresh and failed-save/retry behavior. Existing full regression suite is rerun before release. Actual iPhone Safari meter appearance, compact layout, disclosure and room navigation still require device QA.

## Further candidates

1. Original interactive brushing or training activity with Jerry-specific animations.
2. Photo album with exportable room portraits, accounting for video/model capture limitations.
3. New room exploration with authored rewards and deduplicated saving.

These are proposals, not delivered features in this commit.
