# MH3U Collection Tracker

A web app for tracking your **Monster Hunter 3 Ultimate** equipment collection — every weapon and
armor piece, with an "owned" checkbox, full stats, crafting recipes and the upgrade tree.

**Live:** https://armoredraven17.github.io/mh3u-collection-tracker/ *(GitHub Pages, served from `docs/`)*

## Features

- All 12 weapon classes (1,395 weapons) and all five armor slots (1,605 pieces), Blademaster and
  Gunner.
- Click a cell to see stats: attack, affinity, element/status (with Awaken), sharpness (base and
  Sharpness +1), slots, Hunting Horn notes, Gunlance shelling, Switch Axe phials, bow charges, arc
  shot and coatings, bowgun reload/recoil/deviation and ammo; armor defense and Armor Sphere +
  zenny cost per upgrade level,
  resistances and skills.
- The upgrade tree: what each weapon upgrades from and into, a crafting-routes view, and a
  checklist that costs a build along the tree.
- Progress per category and overall, filters (element, affinity, slots, rarity, class-specific
  stats), totals of everything still to craft.
- **Saved in your browser** automatically, with file save/load for backups or another device.
- The game's own equipment icons, in its own Rare 1–10 colours; the MH3U monster-icon themes shared
  with the other MH3U apps.

## Where the data comes from

Everything is read from the game itself — a personally owned copy, extracted locally — by
[scripts/build_data.py](scripts/build_data.py): the weapon and armor tables in the executable
(`exefs/code.decompressed.bin`), the English text files for names, and the icon atlas. Where a
field's meaning was not obvious it was traced to the game code that reads it; the script comments
give the addresses. The decode was cross-checked against Kiranico's MH3U database as ground truth
(97–100% agreement per field; the rest are errors on the site), but no data is taken from it.

Not decoded yet: the names of a few DLC pieces.

## Local development

There is no build step for the app. The stats are lazy-loaded with `fetch()`, which browsers block
on `file://`, so serve `docs/` over HTTP:

```
python -m http.server 8133 --directory docs
```

Then open http://localhost:8133/.

## Regenerating data

Needs a local MH3U extract (romfs unpacked, arcs extracted, `code.bin` decompressed) laid out like
`C:\MH3U-Extract`, plus Python 3.10+, Pillow, numpy and unicorn:

```
python scripts/build_data.py "C:\MH3U-Extract"
```

This rewrites `docs/data/` and `docs/assets/icons/`. Bump `DATA_VERSION` in `docs/app.js` (and the
`?v=` on `catalog.js` in `index.html`) whenever the data changes.

## Cache busting

GitHub Pages caches assets by full URL. When you change `styles.css`, `app.js` or
`data/catalog.js`, bump the `?v=N` query string on its tag in `index.html`.

## AI assistance

Most of this project's code — the app (ported from the author's MHGU Collection Tracker), the data
extraction and this README — was written with [Claude Code](https://claude.com/claude-code),
Anthropic's AI coding tool, working from the author's direction and reviewed before landing.
Commits made that way carry a `Co-Authored-By: Claude` trailer.

## Licensing

Code is MIT (see [LICENSE](LICENSE)). Game data and icons are Capcom's — see
[NOTICE.md](NOTICE.md). Monster Hunter 3 Ultimate is © Capcom Co., Ltd.; this is an unofficial fan
project.
