r"""Build the tracker's data and icons from a local MH3U extract.

    python scripts/build_data.py [C:\MH3U-Extract]

Reads only the game itself -- the executable (exefs\code.decompressed.bin) and the English message
and texture files unpacked under arcx\ -- and writes:

    docs/data/catalog.js              every weapon and armour piece, with the fields the grid filters on
    docs/data/stats/<cat>.json        full stats, lazy-loaded by the detail panel
    docs/data/materials/<cat>.json    crafting recipes (create / upgrade-from), lazy-loaded
    docs/assets/icons/icon_<cat>_r<n>.png   the game's own equipment icons in its Rare 1-10 colours

Nothing from the game is committed except these generated files. Every address below was found in
the game code; "READ" means the instruction that consumes the value was read, so the meaning comes
from the game rather than from fitting. The full write-up, including the Kiranico cross-check the
decode was validated against, lives with the extract (tracker-data\notes_stats.md).

Needs: Python 3.10+, Pillow, numpy, and (for the rarity colours, which the game builds at boot)
unicorn via the extract's mh3u_static_init.py. pica_tex.py from the extract decodes the icon atlas.
"""
import json, os, struct, sys

EXTRACT = sys.argv[1] if len(sys.argv) > 1 else r'C:\MH3U-Extract'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
sys.path.insert(0, EXTRACT)

CODE = open(os.path.join(EXTRACT, 'exefs', 'code.decompressed.bin'), 'rb').read()
BASE = 0x100000          # .text 0x100000, .rodata 0xb00000, .data 0xb84000; file offset = VA - BASE
FONT = os.path.join(EXTRACT, 'arcx', 'arc', 'ID', 'ID_arena_eng', 'GUI', 'font')
ICON_TEX = os.path.join(EXTRACT, 'arcx', 'arc', 'ID', 'ID_lb_eng', 'GUI', 'Texture', 'common', 'td_icon_ID.tex')


def word(va): return struct.unpack_from('<I', CODE, va - BASE)[0]
def raw(va, n): return CODE[va - BASE:va - BASE + n]
def s8(x): return x - 256 if x > 127 else x


def gmd(name):
    """GMD v0x010201 message table -> list of strings (index = message id)."""
    b = open(os.path.join(FONT, name + '_eng.gmd'), 'rb').read()
    nlab, nstr, labsz, strsz, namelen = struct.unpack_from('<5I', b, 12)
    o = 0x20 + namelen + 1 + 8 * nlab + labsz
    return [s.decode('utf-8', 'replace') for s in b[o:o + strsz].split(b'\0')[:nstr]]


ITEMS = gmd('Item00')
SKILL_TREES = gmd('Skill_Type')
MENU = gmd('Menu')
BOWGUN_MES = gmd(os.path.join('lobby', 'Bowgun_mes'))
COUNTS = 0xb02854        # u32 record count per item type 1.. (the getters' bound checks)

# ── Weapons ───────────────────────────────────────────────────────────────
WEAPON_TABLES = 0xba353c  # [data manager +0x94]: one table per class (item type 7 + class)
MULT100 = 0xba2bf8        # READ 0x57bf40: displayed attack = true attack * u32[class] / 100
CLASSES = [  # class, key, weapon-name message file; label = Menu 236 + class
    (0, 'great_sword', 'Lsword'), (7, 'long_sword', 'Lsword2'), (1, 'sword_and_shield', 'Sword'),
    (11, 'dual_blades', 'WSword'), (2, 'hammer', 'Hammer'), (12, 'hunting_horn', 'Pipe'),
    (3, 'lance', 'Lance'), (9, 'gunlance', 'Gunlance'), (8, 'switch_axe', 'Axe'),
    (6, 'light_bowgun', 'Lbg'), (4, 'heavy_bowgun', 'Hbg'), (10, 'bow', 'Bow'),
]
GUNNER = {4, 6, 10}
# Element / status. Menu 249 + code = None FI WA LI DR IC PO PA SLP SLM: element codes 1-5 (record
# +0xe / +0x10), status codes 1-4 at 5 + code (+0x12). Full names from the status screen (Menu 401-405)
# and the status list (Menu 515-519). A negative value is hidden without Awaken (READ 0x57d728).
ATTR_NAME = ['None', MENU[401], MENU[402], MENU[403], MENU[405], MENU[404], MENU[515], MENU[516], MENU[517], MENU[519]]
ELEMENTS = ATTR_NAME[1:]                     # filter bit order: Fire Water Thunder Dragon Ice Poison Paralysis Sleep Slime
SHARP_TABLE = 0xba3c50   # READ 0x8ec228: per profile, 7 x u32 cumulative colour ends (450 = full bar)
# READ 0x8d2f00..0x8d2f80: profile = record +8; max sharpness = 150 + 50 * record +9, +50 with
# Sharpness+1 (skill 0x17), capped at 450.
HH_NOTES = 0xba5454      # READ 0x355e0c / 0x932fe4: three note codes per record +0x15
NOTE_COLOURS = {1: 'White', 2: 'Purple', 3: 'Blue', 4: 'Red', 5: 'Yellow', 6: 'Orange', 7: 'Green', 8: 'Sky'}  # drawn as icons; colours named by eye
GL_SHELLS = ['Normal', 'Wide', 'Long']       # record +0x15 % 3 (READ 0x8d3c78), level = +0x15 / 3 + 1 (READ 0x9ea404)
PHIALS = BOWGUN_MES[100:106]                 # READ 0x35c45c: Bowgun_mes 100 + record +0x15
ARCS = MENU[450:453]                         # Menu 450 + record +0x17: Blast Focus Wide
RELOADS = BOWGUN_MES[0:10]                   # READ 0x9015a0 / 0x90178c: index = clamp(s8 +8 + 3, 0, 9)
RECOILS = BOWGUN_MES[16:23]                  # READ 0x91d4c4 / 0x36027c: index = clamp(s8 +7 or 1, 0, 6)
DEV_SPLIT = [(0, 0), (1, 1), (2, 1), (1, 2), (2, 2), (1, 3), (2, 3)]  # READ 0x57cc08: (strength, side)
DEVIATIONS = ['None'] + ['%s %s' % (BOWGUN_MES[32 + d], BOWGUN_MES[29 + s]) for s, d in DEV_SPLIT[1:]]
AMMO_FIRST_ITEM = 93     # bowgun ammo slot i = item 93 + i (Normal S Lv1 ...); bit i of +0x30, capacity +0x38 + i
UPGRADE_TABLES = 0xc06bb4  # per class: 0x1c-byte records indexed by weapon id: 4 x (item, qty) to upgrade INTO it,
                           # then 6 x u16 weapons it upgrades into
CREATE_TABLES = 0xc06b64   # per class: 24-byte records {u16, u16 weapon id, 4 x (item, qty), u32}
ARMOR_RECIPES = 0xc06b48   # per item type: the same 24-byte records keyed by armour id

# Bow coatings: bit n of +0x30 = Menu 502 + n (Power, Poison, Paralysis, Sleep, C-Range, Paint,
# Exhaust, Slime). Each is drawn with its item's own icon and colour from the item table
# (READ 0x57ab4c: [0xcb9954] = 0xb92a78, 20-byte records, +4 icon cell, +5 colour index into the
# boot-built palette at 0xcb9964 via 0x57abe8). Bit -> item by name: the menu label is the
# item name less " Coating" (C-Range = C.Range).
ITEM_TABLE = 0xb92a78
ITEM_PALETTE = 0xcb9964
COATING_ITEMS = {1: 'Power Coating', 2: 'Poison Coating', 3: 'Para Coating', 4: 'Sleep Coating',
                 5: 'C.Range Coating', 6: 'Paint Coating', 7: 'Exhaust Coating', 8: 'Slime Coating'}
COATINGS = {bit: [MENU[502 + bit], 'coat_%d' % bit] for bit in COATING_ITEMS}

PROFILES = [struct.unpack_from('<7I', CODE, SHARP_TABLE - BASE + 28 * i) for i in range(91)]


def ammo_name(slot):
    """Slots 0-41 follow the item list from Normal S Lv1 (item 93) to WyvernFire (item 134, the
    Heavy Bowgun-only shot every HBG carries). Slot 42 does not: item 135 is UW Ballista Ammo,
    while the slot is the game's Slime ammo (Bowgun_mes 71), so it is named from that label."""
    if slot == 42:
        return BOWGUN_MES[71] + ' S'
    return ITEMS[AMMO_FIRST_ITEM + slot]


def sharp_bar(profile, length):
    out, prev = [], 0
    for end in PROFILES[profile]:
        end = min(end, length)
        out.append(max(0, end - prev))
        prev = max(prev, end)
    return out


def top_colour(bar):
    return max((i for i, v in enumerate(bar) if v), default=0)


def mat_pairs(b):
    return [(ITEMS[i], q) for i, q in struct.iter_unpack('<HH', b) if i]


def recipes(table_va, count, max_id):
    """Read up to `count` records; the last table in memory has no neighbour to bound it, so stop
    at the first record whose target or items are out of range."""
    out = {}
    for k in range(count):
        r = raw(table_va + 24 * k, 24)
        tid = struct.unpack_from('<H', r, 2)[0]
        if tid >= max_id or any(i >= len(ITEMS) for i, _ in struct.iter_unpack('<HH', r[4:20])):
            break
        m = mat_pairs(r[4:20])
        if tid and m:
            out.setdefault(tid, m)
    return out


def table_count(ptr_table, n, here):
    """How many 24-byte records a recipe table holds: up to the next table in memory."""
    nxt = sorted(v for v in (word(ptr_table + 4 * k) for k in range(n)) if v > here)
    return ((nxt[0] if nxt else here + 24 * 400) - here) // 24


def weapon_class(cls, key, msg):
    names = gmd(msg)
    label, mult100 = MENU[236 + cls], word(MULT100 + 4 * cls)
    tab, n = word(WEAPON_TABLES + 4 * cls), word(COUNTS + 4 * (6 + cls))
    stride = 0x64 if cls in GUNNER else 0x1c
    recs = [raw(tab + i * stride, stride) for i in range(n)]
    upg = word(UPGRADE_TABLES + 4 * cls)
    cre = word(CREATE_TABLES + 4 * cls)
    create = recipes(cre, table_count(CREATE_TABLES, 13, cre), n)
    children, upgrade = {}, {}
    for i in range(n):
        u = raw(upg + 0x1c * i, 0x1c)
        upgrade[i] = mat_pairs(u[:16])
        children[i] = [c for c in struct.unpack_from('<6H', u, 16) if 0 < c < n]
    parent = {}
    for p, cs in children.items():
        for c in cs:
            parent.setdefault(c, p)

    keep = [i for i in range(1, n) if i < len(names) and names[i] and not names[i].startswith('DUMMY')
            and names[i] != '(None)']
    keep_set = set(keep)
    # Tree order: each root in id order, then its upgrades depth-first.
    order, seen = {}, set()
    def walk(i):
        if i in seen or i not in keep_set:
            return
        seen.add(i)
        order[i] = len(order) + 1
        for c in children.get(i, []):
            walk(c)
    for i in keep:
        if parent.get(i) not in keep_set:
            walk(i)
    for i in keep:
        walk(i)

    entries, stats, mats_create = [], {}, {}
    for i in keep:
        b = recs[i]
        name, rar = names[i], b[2] + 1
        st = {'rar': rar}
        cx = {}
        ele_mask = awk_mask = 0     # every element/status it carries; the ones that need Awaken
        if cls in GUNNER:
            atk = struct.unpack_from('<H', b, 4)[0]
            aff, dfn, slots = 0, 0, b[0x11]
            if cls == 10:
                cx['a'] = b[0x17]
                st['arc'] = ARCS[b[0x17]] if b[0x17] < 3 else None
                # Charges: Menu 487 + code; the 4th (index 3) only with Load Up -- READ 0x8e0c68
                # caps the charge index at 3 with skill 0xac (Load Up), else 2.
                st['charges'] = [[MENU[487 + c], 1 if k == 3 else 0]
                                 for k, c in enumerate(struct.unpack_from('<4I', b, 0x1c)) if c < 15]
                st['coatings'] = [COATINGS[bit] for bit in range(1, 9) if b[0x30] >> bit & 1]
                # One attribute: +0x14 code, +0x15 s8 value / 10 (negative = Awaken), READ 0x57d770.
                # Code 4 is Dragon, except with bit 0x2000 of the u32 at +0x30 set it is Slime
                # (READ 0x57d81c, 0x57fea0 -- the Dios and Kelbi bows).
                t, v = b[0x14], b[0x15]
                if t:
                    slime = t == 4 and struct.unpack_from('<I', b, 0x30)[0] & 0x2000
                    code = 9 if slime else t
                    st['ele'] = [[ATTR_NAME[code], abs(s8(v)) * 10, 1 if s8(v) < 0 else 0]]
                    ele_mask |= 1 << (code - 1)
                    if s8(v) < 0:
                        awk_mask |= 1 << (code - 1)
                else:
                    st['ele'] = []
            else:
                rl = min(max(s8(b[8]) + 3, 0), 9)
                rc = min(max(s8(b[7]) or 1, 0), 6)
                cx.update(r=rl, rc=rc, d=b[0x10])
                st.update(reload=RELOADS[rl], recoil=RECOILS[rc], deviation=DEVIATIONS[b[0x10]] if b[0x10] < 7 else '?')
                st['ammo'] = [[ammo_name(s), b[0x38 + s]] for s in range(44)
                              if b[0x30 + s // 8] >> (s % 8) & 1 and b[0x38 + s]]
        else:
            atk = struct.unpack_from('<H', b, 0xa)[0]
            aff, dfn, slots = s8(b[0xd]), b[0xc], b[0x14]
            ele = []
            for t, v, base in ((b[0xe], b[0xf], 0), (b[0x10], b[0x11], 0), (b[0x12], b[0x13], 5)):
                if t:
                    ele.append([ATTR_NAME[base + t], abs(s8(v)) * 10, 1 if s8(v) < 0 else 0])
                    ele_mask |= 1 << (base + t - 1)
                    if s8(v) < 0:
                        awk_mask |= 1 << (base + t - 1)
            st['ele'] = ele
            length = 150 + 50 * b[9]
            bars = [sharp_bar(b[8], length), sharp_bar(b[8], min(length + 50, 450))]
            st['sh'] = bars
            cx['sh'] = top_colour(bars[0]) << 3 | top_colour(bars[1])
            if cls == 12:
                notes = list(raw(HH_NOTES + 3 * b[0x15], 3))
                st['notes'] = [NOTE_COLOURS.get(x, '?') for x in notes]
                cx['n'] = notes[0] << 8 | notes[1] << 4 | notes[2]
            elif cls == 9:
                cx.update(s=b[0x15] % 3, sl=b[0x15] // 3 + 1)
                st['shell'] = '%s Lv%d' % (GL_SHELLS[b[0x15] % 3], b[0x15] // 3 + 1)
            elif cls == 8:
                cx['p'] = b[0x15]
                st['phial'] = PHIALS[b[0x15]] if b[0x15] < len(PHIALS) else '?'
        attack = atk * mult100 // 100
        st.update(atk=attack, aff=aff, def_=dfn, slots=slots)
        st['def'] = st.pop('def_')
        par = parent.get(i) if parent.get(i) in keep_set else None
        st['parent'] = par
        st['children'] = [c for c in children.get(i, []) if c in keep_set]
        stats[str(i)] = st
        rec = {}
        if i in create:
            rec['d'] = create[i]
        if par is not None and upgrade.get(i):
            rec['f'] = [par, None, upgrade[i]]
        if rec:
            mats_create[i] = rec
        entries.append([i, name, rar, par if par is not None else 0, order.get(i, 0), ele_mask,
                        [attack, aff, dfn, slots], cx, awk_mask])
    return label, mult100, entries, stats, mats_create


# ── Armour ────────────────────────────────────────────────────────────────
ARMOR_SLOTS = [  # item type, key, message file; label = the five slot names the game uses
    (5, 'head', 'Helm', 'Head'), (1, 'chest', 'Body', 'Chest'), (2, 'arms', 'Arm', 'Arms'),
    (3, 'waist', 'Waist', 'Waist'), (4, 'legs', 'Leg', 'Legs'),
]
ARMOR_PTRS = 0xbc0038     # [data manager +0x84]: 0x18-byte records (READ 0x892ffc)
ARMOR_INFO = 0xbc0050     # [data manager +0x88]: 0x20-byte records (READ 0x89393c)
DEF_STEP = 0xc40748       # READ 0x8943fc: u16 [curve][tier] defence gained per level
# Upgrade cost, READ: 0x893070 gives the tier of the NEXT level -- from 0-based level x it compares
# x + 1 against info +3..+8 and returns the first k with x + 1 <= info[3 + k]. 0x60116c turns the
# tier into ONE sphere (item 0xee Armor Sphere, 0xef +, 0xf0 Adv, 0xf1 Hrd, 0xf2 Hvy, 0xf4 Tru) and
# 0x5f7e7c into zenny: trunc(b + a * (info +0xc u32 * 2.0)), (a, b) = float pair at 0xc06da0[tier].
UPGRADE_SPHERES = [0xee, 0xef, 0xf0, 0xf1, 0xf2, 0xf4]
UPGRADE_ZENNY = 0xc06da0


def armor_levels(base, info):
    """Defence at every level, the way 0x8943fc computes it: tier = first of info +3..+8 >= level."""
    steps = struct.unpack_from('<6H', CODE, DEF_STEP - BASE + 12 * info[2])
    tiers, top = list(info[3:8]), info[8]
    out, d = [base], base
    for lv in range(1, top):
        d += steps[sum(1 for x in tiers if x <= lv)]
        out.append(d)
    return out


def armor_upgrades(info):
    """[(sphere item name, zenny)] for Lv1->2, Lv2->3, ... up to the max level (info +8)."""
    tiers, top = list(info[3:9]), info[8]
    price = struct.unpack_from('<I', info, 0xc)[0]
    out = []
    for x in range(top - 1):                       # x = current 0-based level
        tier = next((k for k, t in enumerate(tiers) if x + 1 <= t), 0)
        a, b = struct.unpack_from('<2f', CODE, UPGRADE_ZENNY - BASE + 8 * tier)
        out.append((ITEMS[UPGRADE_SPHERES[tier]], int(b + a * (price * 2.0))))
    return out


def armor_slot(typ, key, msg):
    names = gmd(msg)
    n = word(COUNTS + 4 * (typ - 1))
    tab, info = word(ARMOR_PTRS + 4 * (typ - 1)), word(ARMOR_INFO + 4 * (typ - 1))
    rt = word(ARMOR_RECIPES + 4 * typ)
    create = recipes(rt, table_count(ARMOR_RECIPES, 7, rt), n)
    entries, stats, mats_create = [], {}, {}
    for i in range(1, n):
        name = names[i] if i < len(names) else ''
        if not name or name.startswith('DUMMY'):
            continue
        r, t = raw(tab + 0x18 * i, 0x18), raw(info + 0x20 * i, 0x20)
        m, f, blade, gunner = (r[6] >> k & 1 for k in range(4))   # READ 0x5dcb8c
        gender = 2 if m and f else 0 if m else 1 if f else 2
        cls = 'A' if blade and gunner else 'B' if blade else 'G' if gunner else 'A'
        lv = armor_levels(r[0], t)
        skills = [[SKILL_TREES[r[0xe + 2 * k]], s8(r[0xf + 2 * k])] for k in range(5) if r[0xe + 2 * k]]
        rar = r[7] + 1
        stats[str(i)] = {'def': [lv[0], lv[-1]], 'lv': lv, 'res': [s8(x) for x in r[8:13]],
                         'slots': r[0xd], 'sk': skills, 'rar': rar}
        mats_create[i] = {'create': create.get(i), 'up': armor_upgrades(t)}
        entries.append([i, name, rar, len(lv), gender, cls])
    return entries, stats, mats_create


# ── Icons and rarity colours ─────────────────────────────────────────────
ICON_BY_TYPE = 0xb9154e   # READ 0x51d6cc: u8 icon index per item type; atlas cell = (index % 10, index // 10), 22 px
RARE_COLOURS = 0xcb986c   # READ 0x51d5dc: ten RGBA name colours, built at boot (.bss)


def rarity_colours():
    import mh3u_static_init as S
    m = S.run_all()
    b = m.raw(RARE_COLOURS, 40)
    return ['#%02x%02x%02x' % tuple(b[4 * k:4 * k + 3]) for k in range(10)]


def write_icons(colours):
    import numpy as np
    from PIL import Image
    import pica_tex
    atlas, _ = pica_tex.decode(open(ICON_TEX, 'rb').read())
    types = {c[1]: 7 + c[0] for c in CLASSES}
    types.update({'armor_' + key: typ for typ, key, _, _ in ARMOR_SLOTS})
    out = os.path.join(DOCS, 'assets', 'icons')
    os.makedirs(out, exist_ok=True)
    # Coating bottles: the item's own icon in its own colour.
    import mh3u_static_init as S
    pal = S.run_all().raw(ITEM_PALETTE, 64)
    cdir = os.path.join(DOCS, 'assets', 'coatings')
    os.makedirs(cdir, exist_ok=True)
    item_ids = {n: i for i, n in enumerate(ITEMS)}
    for bit, item in COATING_ITEMS.items():
        rec = CODE[ITEM_TABLE - BASE + 20 * item_ids[item]:][:20]
        icon, col = rec[4], rec[5]
        x, y = icon % 10 * 22, icon // 10 * 22
        cell = atlas[y:y + 22, x:x + 22].astype(np.float32)
        cell[..., :3] *= [pal[4 * col + j] / 255 for j in range(3)]
        Image.fromarray(cell.clip(0, 255).astype(np.uint8)).resize((44, 44), Image.NEAREST).save(
            os.path.join(cdir, 'coat_%d.png' % bit))
        COATINGS[bit].append('#%02x%02x%02x' % tuple(pal[4 * col:4 * col + 3]))
    for slug, typ in types.items():
        idx = CODE[ICON_BY_TYPE - BASE + typ]
        x, y = idx % 10 * 22, idx // 10 * 22
        cell = atlas[y:y + 22, x:x + 22].astype(np.float32)
        for k, hexc in enumerate([None] + colours):
            img = cell.copy()
            if hexc:   # the icon is a grey mask; the game multiplies it by the rarity colour
                rgb = [int(hexc[j:j + 2], 16) / 255 for j in (1, 3, 5)]
                img[..., :3] *= rgb
            name = 'icon_%s%s.png' % (slug, '_r%d' % k if k else '')
            Image.fromarray(img.clip(0, 255).astype(np.uint8)).resize((44, 44), Image.NEAREST).save(os.path.join(out, name))


def dump(path, obj):
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'))


def materials_file(create, pairs_of):
    names, index = [], {}
    def ix(n):
        if n not in index:
            index[n] = len(names)
            names.append(n)
        return index[n]
    out = {}
    for i, rec in sorted(create.items()):
        out[str(i)] = pairs_of(rec, ix)
    return {'mats': names, 'create': out, 'byId': {}}


def main():
    colours = rarity_colours()
    catalog = {'version': 1, 'rarityColors': colours,
               'labels': {'elements': ELEMENTS, 'phial': PHIALS, 'shell': GL_SHELLS, 'arc': ARCS,
                          'reload': RELOADS, 'recoil': RECOILS, 'deviation': DEVIATIONS,
                          'notes': NOTE_COLOURS, 'sharp': ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'White', 'Purple']},
               'weapons': {}, 'armor': {}}
    sd, md = os.path.join(DOCS, 'data', 'stats'), os.path.join(DOCS, 'data', 'materials')
    os.makedirs(sd, exist_ok=True)
    os.makedirs(md, exist_ok=True)
    totals = {}
    write_icons(colours)    # first: it also fills in the coating colours the bow stats carry
    for cls, key, msg in CLASSES:
        label, mult, entries, stats, create = weapon_class(cls, key, msg)
        catalog['weapons'][key] = {'label': label, 'icon': key, 'mult': mult / 100, 'entries': entries}
        dump(os.path.join(sd, key + '.json'), {'class': key, 'byId': stats})
        dump(os.path.join(md, key + '.json'), materials_file(create, lambda rec, ix: {
            k: ([v[0], v[1], [[ix(n), q] for n, q in v[2]]] if k == 'f' else [[ix(n), q] for n, q in v])
            for k, v in rec.items()}))
        totals[key] = len(entries)
    for typ, key, msg, label in ARMOR_SLOTS:
        entries, stats, create = armor_slot(typ, key, msg)
        catalog['armor'][key] = {'label': label, 'icon': 'armor_' + key, 'entries': entries}
        dump(os.path.join(sd, 'armor_%s.json' % key), {'slot': key, 'byId': stats})
        # create[id] = recipe pairs; upgrade[id] = [[sphere index, zenny], ...], entry k = Lv k+1 -> k+2.
        names, index = [], {}
        def ix(n):
            if n not in index:
                index[n] = len(names)
                names.append(n)
            return index[n]
        mf = {'mats': names, 'create': {}, 'upgrade': {}}
        for i, rec in sorted(create.items()):
            if rec['create']:
                mf['create'][str(i)] = [[ix(n), q] for n, q in rec['create']]
            if rec['up']:
                mf['upgrade'][str(i)] = [[ix(n), z] for n, z in rec['up']]
        dump(os.path.join(md, 'armor_%s.json' % key), mf)
        totals['armor_' + key] = len(entries)
    with open(os.path.join(DOCS, 'data', 'catalog.js'), 'w', encoding='utf-8') as fh:
        fh.write('window.CATALOG = ' + json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(totals, sum(totals.values()), 'pieces')


if __name__ == '__main__':
    main()
