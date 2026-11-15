# Mini-game search and categories

The hub keeps its compact icon/name/numeric-reward cards and adds a local search
field, Puzzles and Arcade categories. Favorites remains an independent toggle.
Categories and Favorites intersect with the current query. Clicking an active
category again removes that category restriction without clearing Favorites.

| Category | Games |
| --- | --- |
| Puzzles (9) | Block Garden, Memory Pairs, Treasure Hunt, Puzzle Time, 2048, Bubble Rescue, Color Sort, Jerry’s Maze, Treat Match |
| Arcade (7) | Bone Catch, Ball Run, Jump Adventure, Treat Time, Falling Blocks, Snake Garden, Mole Patrol |

Search accepts game names and common English/Russian aliases, for example
`tetris`, `тетрис`, `змейка`, `пары`, `2048`, `лабиринт` and `три в ряд`.
Matching ignores case, repeated spaces and apostrophe variants. Search is plain
text; query contents are never inserted as HTML, sent to a server or saved in
player progress. All Games and Reset filters clear the whole view filter; Clear
only empties the query. No-results states provide a reset action.

Enter in search focuses the first matching card without launching it. Escape
clears a nonempty query first; another Escape can close the hub. Search uses a
label, live result count, 44px controls and 16px input text. No new captions are
added under game cards. Returning from a game retains the current query and
filters. Restoring a backup clears stale transient filters and uses the restored
favorites and last-played game. Continue still targets the last played game,
independently of the current view filters.

`npm test`: **135 passing tests**, including category coverage, aliases,
combined filters, empty results, keyboard behavior, gameplay return, backup
restore, and checks that filtering does not write progress or start a game.
Visual layout and actual iPhone Safari keyboard/touch behavior remain manual
checks in the authenticated private Preview.
