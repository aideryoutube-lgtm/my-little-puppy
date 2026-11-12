# Pawtopia 3.0 — Jerry’s World

Base: main `1a046037484757be02658dacaac6173ab0b72fe2`, fetched before development. Branch: `feature/pawtopia-3-jerrys-world`.

## Interactive rooms

| Room | Working interactions |
| --- | --- |
| Living Room | Sofa cuddles, ball play, toy reaction, dog-bed Sleep; equipped bed/rug/basket |
| Kitchen | Food bowl, refrigerator and shelf open meal selection; water restores 5 Hunger |
| Bedroom | Bed uses current-stage Sleep, pillow/teddy reactions, persistent day/night light, equipped furniture |
| Bathroom | Tub/shower use current-stage Bath; soap bubbles, towel sparkles, duck sound/effect; synthesized water sound |
| Garden | Trees/toy reactions, ball play, direct entry to the existing five mini games; equipped toy basket |

Rooms use original CSS scenery and interactive props around the preserved Jerry media scene. Switching saves the room and stops the current video; it does not navigate or resize the media. Original MP4 footage keeps its original background. This is a stylized 2D house interface, not a new 3D character renderer or a walkable 3D world.

## Shop and inventory

| Category | Products and prices |
| --- | --- |
| Hats | Baseball Cap 15; Party Hat 20; Cowboy Hat 35; Crown 60 |
| Collars | Blue Collar 10; Gold Collar 30; Royal Collar 70 |
| Outfits | Superhero 50; Pirate 60; Astronaut 100 |
| Furniture | Cozy Bed 40; Luxury Bed 100; Colorful Rug 25; Toy Basket 35 |
| Meals | Crunchy Kibble 5 / +20 Hunger; Chicken Bowl 10 / +40 Hunger; Garden Feast 15 / +60 Hunger |

All 14 durable products support purchase once, preview, Equip and Unequip. Hat, collar, outfit and bed are exclusive slots; rug and basket can also be equipped. Furniture is placed in living/bedroom, and baskets also in the garden. The same saved coin balance receives mini-game rewards and pays for purchases/food. Insufficient balance disables Buy, while transaction logic independently rejects overspending and unowned equips.

Clothing is shown only on static original Jerry images in a stage-specific fitting preview, using original SVG accessory drawings. Clothing is intentionally absent from care/Idle/Touch videos. The fitting screen states this limitation. Preview selection does not buy or equip an item.

## Reactions and needs

- Head, back, belly and paw taps produce different English messages and heart/sparkle/paw effects. Rapid second taps produce a special heart burst immediately; the first tap is not delayed.
- The available current-stage Touch Happy clip is reused. There are no fabricated tickling, rolling or paw-motion clips.
- Happy, Hungry, Sleepy, Playful and Dirty derive from existing root Hunger (`hunger`), Fun (`fun`) and Clean (`clean`) plus canonical root `energy`.
- Energy defaults to 80 for older saves, Play consumes 5, and completing Sleep restores 100. There is no second parallel needs object or offline decay.
- Existing care buttons remain available. Existing MP4 mappings, first-frame protection and one-second Idle scheduling remain intact. World dialogs stop video and suppress Idle until closed.
- Sound is one persisted world setting, used by world effects and mini games. No paid sound service or external asset is used.

## Save compatibility

The existing key is still `jerry-save-v1`. Migration clones existing data, preserves valid XP, coins, needs, growth, mini-game records/claim IDs and unknown fields, sets `schemaVersion: 3`, and adds `world` (room, inventory, equipment, sound, night) plus Energy. The first migration attempts to preserve a pre-v3 snapshot under `jerry-save-v1-backup-pre-v3`.

A purchase writes the reduced balance and added ownership in the same localStorage object. State is assigned only after storage succeeds. On failure, no coins or ownership change and a visible retry message is shown. Existing mini-game reward settlement remains in place. As before, progress is local to this browser/device; cross-device synchronization is not added.

## Verification

- JavaScript syntax and `git diff --check`: PASS.
- `node --test tests/animations.cjs tests/bone-logic.cjs tests/mini-games.cjs tests/world.cjs`: **54 PASS**. Includes all 14 catalog items at exact prices, duplicate buying, unowned equips, insufficient funds, failed-storage rollback, shared mini-game balance, old-save migration/idempotence, unknown-field preservation, five emotions and Energy.
- `tests/browser.html` in cloud Chromium: **24 real action playback checks PASS** for Baby 0 XP, Puppy 100 XP, Adult 300 and 600 XP. Includes all six care actions, Idle interruption, Touch hit-testing, fixed media bounds, still return, reload and growth reset. The runner now scrolls the media into view for its hit-test and unloads the fixture iframe before restoring progress.
- `tests/world-browser.html` in cloud Chromium: **Baby/Puppy/Adult PASS**. Each runs a 2.1 fixture through migration, purchases, equip/unequip, five room changes, placed furniture, night mode, Sleep interruption by room change, paid feeding, Bath/bubbles, global mute, all five mini-game starts, pause, completed puzzle reward and reload. Fixtures and migration backups are restored after the iframe is unloaded.
- Manual cloud-browser flows: cap purchase 119→104, bed/rug 104→39, paid meal 39→34, completed mini-game reward 34→37; ownership, equipment, room, muted sound and previous puzzle best persisted on reload.
- Mobile iframe widths 320, 390 and 430: checked house, room navigation, shop and fitting layout. No document/dialog horizontal overflow. The room navigation itself intentionally scrolls horizontally on narrow screens.
- No existing MP4 or original growth image was added, replaced or removed. `game-engine.js` is unchanged from Pawtopia 2.1.

## Remaining real-iPhone checks

Physical iPhone Safari was not available. Verify first-tap and double-tap reactions, swipe controls, audio unlock/mute, safe areas, room changes during long clips, fitting at all stages, and return from mini games in Safari. Cloud Chromium results are not a claim of physical Safari testing.

No paid API/service was enabled. Deployment uses the existing GitHub Pages workflow and URL.
