#!/usr/bin/env python3
"""Generate supabase/migrations/20260908100000_catalog_pass.sql from the approved
Stage 3 catalog-pass sheets.

Deterministic: reads only the three committed CSVs under docs/superpowers/audit/
and always emits byte-identical output for the same inputs. Run from the repo root:

    python3 scripts/movement-model/generate_catalog_pass.py

The script first cross-validates the classification sheet (catalog-pass-2026-08.csv)
and the dictionary seed sheet (new-attributes-2026-08.csv) against the user-blessed
final-state projection (catalog-final-2026-08.csv) by simulating the identity engine
offline. It refuses to emit SQL on any mismatch, so the generated migration can only
ever encode a state the user has approved.
"""
import csv
import os
import re
import sys
import uuid
import collections

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AUDIT = os.path.join(REPO, 'docs', 'superpowers', 'audit')
PASS_CSV = os.path.join(AUDIT, 'catalog-pass-2026-08.csv')
FINAL_CSV = os.path.join(AUDIT, 'catalog-final-2026-08.csv')
SEED_CSV = os.path.join(AUDIT, 'new-attributes-2026-08.csv')
OUT = os.path.join(REPO, 'supabase', 'migrations', '20260908100000_catalog_pass.sql')

MIGRATION_NAME = '20260908100000_catalog_pass.sql'

# ---------------------------------------------------------------------------
# Naming dictionary (fragment, band) — mirrors the live attribute dictionary
# (20260826100000) plus this migration's additions. Used ONLY to validate the
# sheets against the final projection before emitting; the database engine is
# the runtime authority.
# ---------------------------------------------------------------------------
FRAG = {}


def _frag(kind, name, fragment, order):
    FRAG[(kind, name)] = (fragment, order)


for _n in ['Back', 'Bear Hug', 'Carry', 'Double Front Rack', 'Double Overhead', 'Front', 'Goblet',
           'Hang', 'Offset', 'Overhead', 'Single Front Rack', 'Single Overhead', 'Suitcase', 'Waiter', 'Zercher']:
    _frag('load_position', _n, _n, 45)
for _n in ['Athletic', 'Half-Kneeling', 'Kneeling', 'Prone', 'Seated', 'Single-Leg', 'Split', 'Staggered', 'Supine']:
    _frag('stance', _n, _n, 30)
_frag('stance', 'Wide (Sumo)', 'Wide-Stance', 30)
_frag('stance', 'Narrow', 'Narrow-Stance', 30)
_frag('stance', 'Standard', None, None)
_frag('stance', 'Supine / Prone', None, None)
for _n in ['Box', 'Parallel', 'Partial', 'Quarter', 'Three-Quarter']:
    _frag('range_depth', _n, _n, 20)
_frag('range_depth', 'ATG (Ass to Grass)', 'ATG', 20)
_frag('range_depth', 'Lockout Only', 'Lockout', 20)
_frag('range_depth', 'Full', None, None)
_frag('symmetry', 'Alternating', 'Alternating', 35)
_frag('symmetry', 'Cross-Body / Rotational', 'Cross-Body', 35)  # amended by this migration
for _n in ['Bilateral', 'Contralateral', 'Offset', 'Unilateral']:
    _frag('symmetry', _n, None, None)
_frag('grip_orientation', 'Pronated', None, None)
_frag('grip_orientation', 'Supinated', 'Underhand', 25)
_frag('grip_orientation', 'Neutral', 'Neutral-Grip', 25)
_frag('grip_orientation', 'Mixed', 'Mixed-Grip', 25)
_frag('grip_orientation', 'Hook', None, None)
_frag('grip_orientation', 'False', 'False-Grip', 25)
_frag('grip_width', 'Standard', None, None)
_frag('grip_width', 'Wide', 'Wide-Grip', 25)
_frag('grip_width', 'Close', 'Close-Grip', 25)
_frag('style', 'Assisted', 'Assisted', 10)
_frag('style', 'Weighted', 'Weighted', 10)
_frag('style', 'Deficit', 'Deficit', 10)
_frag('style', 'Strict', 'Strict', 12)
_frag('style', 'Kipping', 'Kipping', 14)
_frag('style', 'Butterfly', 'Butterfly', 14)
_frag('style', 'Plyometric (Explosive)', 'Plyo', 14)
EQUIPMENT_ALL = ['Bands', 'Bar', 'Barbell', 'Bench', 'Bike', 'Bodyweight', 'Box', 'Dumbbell', 'Floor',
                 'Foam Roller', 'GHD', 'Jump Rope', 'Kettlebell', 'Massage Ball', 'Mat', 'Med Ball',
                 'Parallettes', 'Plate', 'Rings', 'Rope', 'Rower', 'Sandbag', 'Ski', 'Sled',
                 'Stability Ball', 'Trap Bar', 'Treadmill', 'Wall', 'Weight Vest', 'Yoga Block']
for _n in EQUIPMENT_ALL:
    _frag('equipment', _n, _n, 40)
_frag('equipment', 'Weight Vest', 'Vest', 40)
_frag('equipment', 'Parallettes', 'Parallette', 40)
_frag('equipment', 'Bodyweight', None, None)
_frag('equipment', 'Jump Rope', None, None)

# Implied-equipment suppressions (load position / range depth already live;
# bench angle added by this migration).
IMPLIES = {('load_position', 'Back'): 'Barbell', ('load_position', 'Front'): 'Barbell',
           ('load_position', 'Overhead'): 'Barbell', ('load_position', 'Zercher'): 'Barbell',
           ('range_depth', 'Box'): 'Box'}

STYLE_MAP = {'Plyometric': 'Plyometric (Explosive)'}

ABBREV = {'alt': 'alternating', 'bb': 'barbell', 'bmu': 'bar muscle up', 'bw': 'bodyweight',
          'c2b': 'chest to bar', 'db': 'dumbbell', 'du': 'double under', 'dus': 'double unders',
          'ghd': 'glute ham developer', 'hs': 'handstand', 'hspu': 'handstand push up',
          'kb': 'kettlebell', 'kbs': 'kettlebell swing', 'mu': 'muscle up', 'oh': 'overhead',
          'ohs': 'overhead squat', 'rdl': 'romanian deadlift', 'rmu': 'ring muscle up',
          'sa': 'single arm', 'sdhp': 'sumo deadlift high pull', 'sl': 'single leg', 'sq': 'squat',
          't2b': 'toes to bar', 'ttb': 'toes to bar', 'wb': 'wall ball'}


def normalize_alias(s):
    """Mirror public.normalize_alias (lower, strip punctuation, expand abbreviations)."""
    words = [w for w in re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip().split(' ') if w]
    return ' '.join(ABBREV.get(w, w) for w in words)


def new_core_uuid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'fittracker:catalog-pass:new-core:' + name))


def q(s):
    """SQL single-quoted literal."""
    if s is None:
        return 'NULL'
    return "'" + s.replace("'", "''") + "'"


def qarr(items):
    if not items:
        return "'{}'::text[]"
    return 'ARRAY[' + ','.join(q(x) for x in items) + ']::text[]'


def qbool(b):
    return 'true' if b else 'false'


def qint(n):
    return 'NULL' if n is None else str(n)


# ---------------------------------------------------------------------------
# Load sheets
# ---------------------------------------------------------------------------
pass_rows = list(csv.DictReader(open(PASS_CSV)))
final_rows = list(csv.DictReader(open(FINAL_CSV)))
seed_rows = list(csv.DictReader(open(SEED_CSV)))

if len(pass_rows) != 307:
    sys.exit('expected 307 classification rows, got %d' % len(pass_rows))
if len(final_rows) != 287:
    sys.exit('expected 287 final rows, got %d' % len(final_rows))

# Dictionary seeds from new-attributes-2026-08.csv
seeds = collections.defaultdict(list)
for r in seed_rows:
    seeds[r['attribute_table']].append(r)

DIRECTIONS = [(r['value_name'], r['name_fragment'] or None, int(r['name_order']))
              for r in seeds['directions (NEW TABLE)']]
SUPPORTS = [(r['value_name'], r['name_fragment'] or None, int(r['name_order']))
            for r in seeds['support_positions (NEW TABLE)']]
ARM_POSITIONS = [(r['value_name'], r['name_fragment'] or None, int(r['name_order']))
                 for r in seeds['arm_positions (NEW TABLE)']]
BENCH_ANGLES = [(r['value_name'], r['name_fragment'] or None, int(r['name_order']),
                 r['implies_equipment'] or None) for r in seeds['bench_angles (NEW TABLE)']]
NEW_STANCES = [(r['value_name'], r['name_fragment'] or None, int(r['name_order']))
               for r in seeds['stances (EXISTING TABLE)']]
NEW_EQUIPMENT = [(r['value_name'], r['category_if_any'], r['name_fragment'] or None, int(r['name_order']))
                 for r in seeds['equipment (EXISTING TABLE)']]
NEW_STYLES = [(r['value_name'], r['category_if_any'], r['name_fragment'] or None, int(r['name_order']))
              for r in seeds['movement_styles (EXISTING TABLE)']]
VARIANT_SEEDS = []
for r in seeds['variant_labels (NEW TABLE)']:
    m = re.match(r'core scope: (.+)$', r['category_if_any'])
    if not m:
        sys.exit('variant label %s has no core scope' % r['value_name'])
    VARIANT_SEEDS.append((r['value_name'], m.group(1), r['name_fragment'], int(r['name_order'])))
NEW_CORE_SEEDS = {}
for r in seeds['exercises (NEW CORE ROW)']:
    m = re.search(r'core_default_equipment="([^"]*)"', r['notes'])
    if not m:
        sys.exit('new core %s: no core_default_equipment in notes' % r['value_name'])
    deq = m.group(1)
    NEW_CORE_SEEDS[r['value_name']] = None if deq == 'none' else ', '.join(x.strip() for x in deq.split(','))

# fold seeds into the validation dictionary
for name, fragment, order in DIRECTIONS:
    _frag('direction', name, fragment, order if fragment else None)
for name, fragment, order in SUPPORTS:
    _frag('support_position', name, fragment, order if fragment else None)
for name, fragment, order in ARM_POSITIONS:
    _frag('arm_position', name, fragment, order if fragment else None)
for name, fragment, order, implies in BENCH_ANGLES:
    _frag('bench_angle', name, fragment, order if fragment else None)
    if implies:
        IMPLIES[('bench_angle', name)] = implies
for name, fragment, order in NEW_STANCES:
    _frag('stance', name, fragment, order)
for name, cat, fragment, order in NEW_EQUIPMENT:
    _frag('equipment', name, fragment, order)
    EQUIPMENT_ALL.append(name)
for name, cat, fragment, order in NEW_STYLES:
    _frag('style', name, fragment, order)
for slug, scope, fragment, order in VARIANT_SEEDS:
    _frag('variant', slug, fragment, order)

# ---------------------------------------------------------------------------
# Build the classification model
# ---------------------------------------------------------------------------
class Row:
    pass


rows = []            # alive rows (cores + derives + outliers), pass-sheet order then new cores
merges = []          # (loser_id, loser_name, winner_final_name)
core_default = {}    # final core name -> default equipment string or None
by_final_name = {}

for r in pass_rows:
    d = r['disposition']
    if d.startswith('duplicate-of:'):
        merges.append((r['exercise_id'], r['name'], d[len('duplicate-of:'):]))
        continue
    e = Row()
    e.id = r['exercise_id']
    e.old_name = r['name']
    e.kind = 'core' if d.startswith('core:') else ('outlier' if d == 'outlier' else 'derive')
    e.core_name = d[5:] if e.kind == 'core' else (d[8:] if e.kind == 'derive' else None)
    na = r['name_action']
    if na == 'keep-custom':
        e.final_name, e.custom = r['name'], True
    elif na == 'adopt-generated':
        e.final_name, e.custom = r['generated_name_preview'], False
    elif na.startswith('rename-to:'):
        e.final_name, e.custom = na[len('rename-to:'):], True  # custom resolved after gen names
    else:
        sys.exit('unexpected name_action %r on %s' % (na, r['name']))
    e.is_movement = r['is_movement'] == 'true'
    e.family, e.modality = r['family'], r['modality']
    e.equipment = sorted(filter(None, r['equipment'].split(';')))
    e.load_position = r['load_position'] or None
    e.stance = r['stance'] or None
    e.range_depth = r['range_depth'] or None
    e.symmetry = r['symmetry'] or None
    e.grip_orientation = r['grip_orientation'] or None
    e.grip_width = r['grip_width'] or None
    e.bench_angle = r['bench_angle'] or None
    e.styles = sorted(STYLE_MAP.get(s, s) for s in filter(None, r['identity_styles'].split(';')))
    e.direction = e.support_position = e.arm_position = None
    e.variant = r['variant_label'] or None
    for t in filter(None, r['new_attributes'].split(';')):
        k, _, v = t.partition(':')
        if k == 'direction':
            e.direction = v
        elif k in ('support', 'support_position'):
            e.support_position = v
        elif k == 'arm_position':
            e.arm_position = v
        elif k == 'variant' and v != e.variant:
            sys.exit('variant token/column mismatch on %s' % r['name'])
    e.goals = [g for g in r['goals'].split(';') if g]
    e.primary_muscles = sorted(filter(None, r['primary_muscles'].split(';')))
    e.secondary_muscles = sorted(filter(None, r['secondary_muscles'].split(';')))
    e.note_wilds = []
    m = re.search(r'wild-alias:([^;]+?)(?:$|[.;])', r['note'])
    if m:
        e.note_wilds.append(m.group(1).strip())
    e.suppress_generated_alias = 'GENERATED ALIAS SUPPRESSED' in r['note']
    if e.kind == 'core':
        e.final_name = e.core_name
        cde = None
        for t in filter(None, r['new_attributes'].split(';')):
            if t.startswith('core_default_equipment:'):
                v = t.split(':', 1)[1]
                cde = None if v == '(none)' else ', '.join(x.strip() for x in v.split(','))
        core_default[e.core_name] = cde
    e.core_default_equipment = core_default.get(e.core_name) if e.kind == 'core' else None
    e.is_new = False
    rows.append(e)

final_by_name = {r['display_name']: r for r in final_rows}
if len(final_by_name) != len(final_rows):
    sys.exit('final CSV display names are not unique')

# five new cores
for name, deq in sorted(NEW_CORE_SEEDS.items()):
    fr = final_by_name[name]
    e = Row()
    e.id = new_core_uuid(name)
    e.old_name = None
    e.kind = 'core'
    e.core_name = name
    e.final_name = name
    e.custom = True
    e.is_movement = fr['movements_tab'] == 'yes'
    e.family, e.modality = fr['family'], fr['modality']
    e.equipment, e.styles, e.goals, e.primary_muscles, e.secondary_muscles = [], [], [], [], []
    e.load_position = e.stance = e.range_depth = e.symmetry = None
    e.grip_orientation = e.grip_width = e.bench_angle = None
    e.direction = e.support_position = e.arm_position = e.variant = None
    e.note_wilds = []
    e.suppress_generated_alias = False
    e.core_default_equipment = deq
    core_default[name] = deq
    e.is_new = True
    rows.append(e)

for e in rows:
    if e.final_name in by_final_name:
        sys.exit('duplicate final display name %r' % e.final_name)
    by_final_name[e.final_name] = e

# resolve merge winners to ids
merge_resolved = []
for loser_id, loser_name, winner_name in merges:
    if winner_name not in by_final_name:
        sys.exit('merge winner %r (loser %r) not found among final rows' % (winner_name, loser_name))
    merge_resolved.append((loser_id, loser_name, by_final_name[winner_name].id, winner_name))

# ---------------------------------------------------------------------------
# Simulate generated names and validate against the final projection
# ---------------------------------------------------------------------------
def attr_pairs(e):
    pairs = [('equipment', n) for n in e.equipment] + [('style', n) for n in e.styles]
    for kind in ['load_position', 'stance', 'range_depth', 'symmetry', 'grip_orientation',
                 'grip_width', 'bench_angle', 'direction', 'support_position', 'arm_position']:
        v = getattr(e, kind)
        if v:
            pairs.append((kind, v))
    if e.variant:
        pairs.append(('variant', e.variant))
    return pairs


def gen_name(e):
    if e.kind != 'derive':
        return e.final_name
    default_eq = set()
    if core_default.get(e.core_name):
        default_eq = {x.strip() for x in core_default[e.core_name].split(',')}
    pairs = attr_pairs(e)
    implied = {IMPLIES[p] for p in pairs if p in IMPLIES}
    frags = []
    for kind, name in pairs:
        if (kind, name) not in FRAG:
            sys.exit('no naming metadata for %s %r (row %s)' % (kind, name, e.final_name))
        fragment, order = FRAG[(kind, name)]
        if fragment is None:
            continue
        if kind == 'equipment' and (name in implied or name in default_eq):
            continue
        frags.append((order, fragment))
    frags.sort()
    return ' '.join([f for _, f in frags] + [e.core_name])


fails = []
for e in rows:
    e.gen = gen_name(e)
    if e.custom and e.kind == 'derive' and e.final_name == e.gen:
        e.custom = False  # rename-to that equals the generated name is not custom
    fr = final_by_name.get(e.final_name)
    if fr is None:
        fails.append('final row missing: %r' % e.final_name)
        continue
    exp_section = {'core': 'core', 'derive': 'derive', 'outlier': 'outlier'}[e.kind]
    if fr['section'] != exp_section:
        fails.append('section mismatch %r: %s vs %s' % (e.final_name, exp_section, fr['section']))
    exp_gen = fr['generated_name'].replace(' (suppressed)', '') if fr['section'] != 'outlier' else e.final_name
    if e.gen != exp_gen:
        fails.append('generated name mismatch %r: model %r vs final %r' % (e.final_name, e.gen, exp_gen))
    if e.kind == 'derive' and fr['derived_from'] != e.core_name:
        fails.append('core mismatch %r: %s vs %s' % (e.final_name, e.core_name, fr['derived_from']))
    e.expected_tier = int(fr['tier']) if fr['tier'] != '' else None
    e.expected_parent_name = (fr['parent'] or fr['derived_from']) if fr['section'] == 'derive' else None

for e in rows:
    e.expected_parent_id = by_final_name[e.expected_parent_name].id if e.expected_parent_name else None
    e.core_id = by_final_name[e.core_name].id if e.core_name else None

# fingerprint uniqueness within each core
seen = {}
for e in rows:
    if e.kind != 'derive':
        continue
    key = (e.core_name, frozenset(attr_pairs(e)))
    if key in seen:
        fails.append('fingerprint collision in %s: %r vs %r' % (e.core_name, e.final_name, seen[key]))
    seen[key] = e.final_name

# expected aliases (per the blessed projection): old display names, note wilds,
# legacy array aliases and merge-loser names arrive as kind=wild; a row whose
# generated name differs from its display name mints kind=generated (except the
# documented Powerbomb suppression). Generated aliases are minted BEFORE the
# wild inserts in the migration, so a string that is both must classify as
# generated — assert the projection never carries a variant spelling of a row's
# own generated name (that would make the kind ambiguous).
expected_aliases = []          # (exercise_id, alias, kind)
alias_norm_owner = {}
for fr in final_rows:
    e = by_final_name[fr['display_name']]
    seen_norms = set()
    for alias in filter(None, [x.strip() for x in fr['aliases'].split(';')]):
        kind = 'generated' if (e.kind == 'derive' and alias == e.gen and e.final_name != e.gen
                               and not e.suppress_generated_alias) else 'wild'
        norm = normalize_alias(alias)
        if kind == 'wild' and e.kind == 'derive' and norm == normalize_alias(e.gen) and e.final_name != e.gen:
            fails.append('ambiguous alias kind (variant spelling of own generated name): %r on %r'
                         % (alias, e.final_name))
        if norm in alias_norm_owner and alias_norm_owner[norm] != e.id:
            fails.append('global alias collision: %r' % alias)
        if norm in seen_norms:
            fails.append('within-row duplicate normalized alias: %r on %r' % (alias, e.final_name))
        seen_norms.add(norm)
        alias_norm_owner[norm] = e.id
        expected_aliases.append((e.id, alias, kind))

# every model-side alias source must appear in the projection, and vice versa
model_alias = collections.defaultdict(dict)
def _add_alias(target, alias):
    if alias.strip() == target.final_name:
        return
    n = normalize_alias(alias)
    if n:
        model_alias[target.id].setdefault(n, alias)


for loser_id, loser_name, winner_id, winner_name in merge_resolved:
    _add_alias(by_final_name[winner_name], loser_name)
for e in rows:
    if e.old_name:
        _add_alias(e, e.old_name)
    for w in e.note_wilds:
        _add_alias(e, w)
    if e.kind == 'derive' and e.gen != e.final_name and not e.suppress_generated_alias:
        model_alias[e.id].setdefault(normalize_alias(e.gen), e.gen)
# NOTE: legacy exercises.aliases array contents are folded in at runtime (they live in
# the DB, not the sheets); the projection's alias column already includes them, so the
# subset check below is one-directional: everything the model derives from the sheets
# must be present in the projection.
proj_alias = collections.defaultdict(set)
for ex_id, alias, kind in expected_aliases:
    proj_alias[ex_id].add(normalize_alias(alias))
for ex_id, norms in model_alias.items():
    missing = set(norms) - proj_alias[ex_id]
    if missing:
        fails.append('sheet-derived aliases absent from projection for %s: %s' % (ex_id, sorted(missing)))

# counts
n_core = sum(1 for e in rows if e.kind == 'core')
n_derive = sum(1 for e in rows if e.kind == 'derive')
n_outlier = sum(1 for e in rows if e.kind == 'outlier')
if (len(rows), n_core, n_derive, n_outlier, len(merge_resolved)) != (287, 48, 187, 52, 25):
    fails.append('count mismatch: %s' % [(len(rows), n_core, n_derive, n_outlier, len(merge_resolved))])
tier_counts = collections.Counter(e.expected_tier for e in rows)
if dict(tier_counts) != {0: 48, 1: 144, 2: 38, 3: 5, None: 52}:
    fails.append('tier distribution mismatch: %s' % dict(tier_counts))

# declared within-core generated-name collisions (silent attributes) — everything else
# must be unique per core
gen_dupes = collections.Counter()
for e in rows:
    if e.kind == 'derive':
        gen_dupes[(e.core_name, e.gen)] += 1
declared_pairs = sorted((core, gen, n) for (core, gen), n in gen_dupes.items() if n > 1)

if fails:
    for f in fails:
        print('VALIDATION FAIL:', f, file=sys.stderr)
    sys.exit(1)

powerbomb = [e for e in rows if e.suppress_generated_alias]
if len(powerbomb) != 1 or powerbomb[0].final_name != 'Single-Arm Overhead Triceps Extension':
    sys.exit('expected exactly one documented generated-alias suppression (Powerbomb)')
powerbomb = powerbomb[0]
overhead_ext = by_final_name['Overhead Extension']

outlier_ids = sorted(e.id for e in rows if e.kind == 'outlier')

# The Bent-Over Row canonical slug is currently held by merge loser 'Bent Over Row';
# insert with an interim slug, flip after the merges free it.
NEW_CORE_SLUGS = {'Plank': 'plank', 'Carry': 'carry', 'Bent-Over Row': 'bent-over-row',
                  'Lat Pulldown': 'lat-pulldown', 'Raise': 'raise'}
SLUG_HELD_BY_LOSER = {'Bent-Over Row'}

# ---------------------------------------------------------------------------
# Emit SQL
# ---------------------------------------------------------------------------
out = []
w = out.append

w(f"""-- {MIGRATION_NAME}
-- Stage 3 catalog pass: applies the user-approved classification of all 307 live
-- exercises (decision records: docs/superpowers/audit/catalog-pass-2026-08.csv,
-- new-attributes-2026-08.csv; end state blessed in catalog-final-2026-08.csv).
--
-- GENERATED FILE — do not edit by hand. Regenerate with:
--     python3 scripts/movement-model/generate_catalog_pass.py
-- The generator is deterministic; regeneration must produce this identical file.
--
-- Every section is idempotent (re-run converges to the same state). Safe under
-- `psql -1` / `db push` (no explicit transaction control in-file). Ends with
-- self-verify DO blocks that RAISE EXCEPTION, with observed values, on any
-- violated invariant (standing data-migration rule).
--
-- End state (from the blessed projection): 287 exercises = 48 cores + 187
-- derivations + 52 outliers; 25 duplicates merged away; tiers 48/144/38/5.

-- ============================================================================
-- 1) New reference tables: directions, support_positions, arm_positions,
--    bench_angles (standing rule: every CREATE TABLE ships RLS + policies in
--    the same migration)
-- ============================================================================""")

for table, label in [('directions', 'Directions'), ('support_positions', 'Support positions'),
                     ('arm_positions', 'Arm positions'), ('bench_angles', 'Bench angles')]:
    implies_col = ('\n  implies_equipment_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,'
                   if table == 'bench_angles' else '')
    w(f"""CREATE TABLE IF NOT EXISTS public.{table} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  name_fragment TEXT,
  name_order INTEGER,{implies_col}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = '{table}'
                   AND policyname = '{label} are viewable by everyone') THEN
    CREATE POLICY "{label} are viewable by everyone" ON public.{table} FOR SELECT USING (true);
  END IF;
END $$;
""")

w("-- Seeds (silent values carry NULL fragment AND NULL order, house convention).")
for i, (name, fragment, order) in enumerate(DIRECTIONS, 1):
    w(f"INSERT INTO public.directions (name, display_order, name_fragment, name_order)\n"
      f"SELECT {q(name)}, {i}, {q(fragment)}, {qint(order if fragment else None)}\n"
      f" WHERE NOT EXISTS (SELECT 1 FROM public.directions WHERE name = {q(name)});")
for i, (name, fragment, order) in enumerate(SUPPORTS, 1):
    w(f"INSERT INTO public.support_positions (name, display_order, name_fragment, name_order)\n"
      f"SELECT {q(name)}, {i}, {q(fragment)}, {qint(order if fragment else None)}\n"
      f" WHERE NOT EXISTS (SELECT 1 FROM public.support_positions WHERE name = {q(name)});")
for i, (name, fragment, order) in enumerate(ARM_POSITIONS, 1):
    w(f"INSERT INTO public.arm_positions (name, display_order, name_fragment, name_order)\n"
      f"SELECT {q(name)}, {i}, {q(fragment)}, {qint(order if fragment else None)}\n"
      f" WHERE NOT EXISTS (SELECT 1 FROM public.arm_positions WHERE name = {q(name)});")
for i, (name, fragment, order, implies) in enumerate(BENCH_ANGLES, 1):
    imp = (f"(SELECT id FROM public.equipment WHERE name = {q(implies)})" if implies else 'NULL')
    w(f"INSERT INTO public.bench_angles (name, display_order, name_fragment, name_order, implies_equipment_id)\n"
      f"SELECT {q(name)}, {i}, {q(fragment)}, {qint(order if fragment else None)}, {imp}\n"
      f" WHERE NOT EXISTS (SELECT 1 FROM public.bench_angles WHERE name = {q(name)});")
w("-- Re-run convergence: Incline/Decline must imply Bench even if the rows pre-exist.")
w("UPDATE public.bench_angles SET implies_equipment_id = (SELECT id FROM public.equipment WHERE name = 'Bench')\n"
  " WHERE name IN ('Incline','Decline') AND implies_equipment_id IS NULL;")

w("""
-- ============================================================================
-- 2) variant_labels: G1 reference table (no free text on exercises), G2 each
--    label scoped to exactly ONE core via core_movement_id. Seeded in section 7
--    after the new core rows exist. G4 (wizard affordance) is a Stage 5 concern.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.variant_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  core_movement_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  name_fragment TEXT NOT NULL,
  name_order INTEGER NOT NULL DEFAULT 48,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (core_movement_id, slug)
);
ALTER TABLE public.variant_labels ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'variant_labels'
                   AND policyname = 'Variant labels are viewable by everyone') THEN
    CREATE POLICY "Variant labels are viewable by everyone" ON public.variant_labels FOR SELECT USING (true);
  END IF;
END $$;

-- ============================================================================
-- 3) Existing dictionaries: new stances, new equipment, Crush style,
--    Cross-Body symmetry fragment amendment
-- ============================================================================""")
for name, fragment, order in NEW_STANCES:
    w(f"INSERT INTO public.stances (name, display_order, name_fragment, name_order)\n"
      f"SELECT {q(name)}, (SELECT COALESCE(max(display_order), 0) + 1 FROM public.stances), {q(fragment)}, {order}\n"
      f" WHERE NOT EXISTS (SELECT 1 FROM public.stances WHERE name = {q(name)});")
for name, cat, fragment, order in NEW_EQUIPMENT:
    w(f"INSERT INTO public.equipment (name, category, display_order, name_fragment, name_order)\n"
      f"SELECT {q(name)}, {q(cat)},\n"
      f"       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.equipment WHERE category = {q(cat)}),\n"
      f"       {q(fragment)}, {order}\n"
      f" WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE name = {q(name)});")
for name, cat, fragment, order in NEW_STYLES:
    w(f"-- {name}: identity style, Execution band {order} per the approved seed sheet.\n"
      f"INSERT INTO public.movement_styles (name, category, display_order, is_identity, name_fragment, name_order)\n"
      f"SELECT {q(name)}, 'Execution Control',\n"
      f"       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.movement_styles),\n"
      f"       true, {q(fragment)}, {order}\n"
      f" WHERE NOT EXISTS (SELECT 1 FROM public.movement_styles WHERE name = {q(name)});")
w("""-- Cross-Body / Rotational now speaks (amendment): unambiguous, unlike Unilateral.
UPDATE public.symmetries SET name_fragment = 'Cross-Body', name_order = 35
 WHERE name = 'Cross-Body / Rotational'
   AND (name_fragment IS DISTINCT FROM 'Cross-Body' OR name_order IS DISTINCT FROM 35);

-- ============================================================================
-- 4) exercises: five attribute FK columns + core_default_equipment.
--    core_default_equipment is naming-only (suppression, mirrors
--    load_positions.implies_equipment_id) — it is NOT part of the fingerprint.
-- ============================================================================
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS direction_id UUID REFERENCES public.directions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS support_position_id UUID REFERENCES public.support_positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS arm_position_id UUID REFERENCES public.arm_positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bench_angle_id UUID REFERENCES public.bench_angles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_label_id UUID REFERENCES public.variant_labels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS core_default_equipment TEXT;
CREATE INDEX IF NOT EXISTS exercises_direction_idx ON public.exercises (direction_id);
CREATE INDEX IF NOT EXISTS exercises_support_position_idx ON public.exercises (support_position_id);
CREATE INDEX IF NOT EXISTS exercises_arm_position_idx ON public.exercises (arm_position_id);
CREATE INDEX IF NOT EXISTS exercises_bench_angle_idx ON public.exercises (bench_angle_id);
CREATE INDEX IF NOT EXISTS exercises_variant_label_idx ON public.exercises (variant_label_id);

-- Grip category guard (Stage 2 hand-off): the two grip FK columns must stay in
-- their categories. Trigger, matching house style (CHECK cannot subquery).
CREATE OR REPLACE FUNCTION public.enforce_grip_categories() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.grip_orientation_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM grips g WHERE g.id = NEW.grip_orientation_id AND g.category = 'Orientation') THEN
    RAISE EXCEPTION 'grip_orientation_id % on % is not an Orientation grip', NEW.grip_orientation_id, NEW.name;
  END IF;
  IF NEW.grip_width_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM grips g WHERE g.id = NEW.grip_width_id AND g.category = 'Width') THEN
    RAISE EXCEPTION 'grip_width_id % on % is not a Width grip', NEW.grip_width_id, NEW.name;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS exercises_grip_categories ON public.exercises;
CREATE TRIGGER exercises_grip_categories
  BEFORE INSERT OR UPDATE OF grip_orientation_id, grip_width_id ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION enforce_grip_categories();

-- ============================================================================
-- 5) Engine amendments (CREATE OR REPLACE; recompute_exercise_identity is
--    untouched — SECURITY DEFINER, search_path pinning, FOR UPDATE locking,
--    stale-alias cleanup and parent preservation stay as shipped in 20260825150000)
-- ============================================================================

-- exercise_identity_attrs gains direction, support position, arm position,
-- bench angle AND the variant label: all five are identity.
CREATE OR REPLACE FUNCTION public.exercise_identity_attrs(p_id UUID) RETURNS UUID[]
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(array_agg(v ORDER BY v), '{}') FROM (
    SELECT e.load_position_id AS v FROM exercises e WHERE e.id = p_id AND e.load_position_id IS NOT NULL
    UNION ALL SELECT e.stance_id       FROM exercises e WHERE e.id = p_id AND e.stance_id IS NOT NULL
    UNION ALL SELECT e.range_depth_id  FROM exercises e WHERE e.id = p_id AND e.range_depth_id IS NOT NULL
    UNION ALL SELECT e.symmetry_id     FROM exercises e WHERE e.id = p_id AND e.symmetry_id IS NOT NULL
    UNION ALL SELECT e.grip_orientation_id FROM exercises e WHERE e.id = p_id AND e.grip_orientation_id IS NOT NULL
    UNION ALL SELECT e.grip_width_id   FROM exercises e WHERE e.id = p_id AND e.grip_width_id IS NOT NULL
    UNION ALL SELECT e.direction_id    FROM exercises e WHERE e.id = p_id AND e.direction_id IS NOT NULL
    UNION ALL SELECT e.support_position_id FROM exercises e WHERE e.id = p_id AND e.support_position_id IS NOT NULL
    UNION ALL SELECT e.arm_position_id FROM exercises e WHERE e.id = p_id AND e.arm_position_id IS NOT NULL
    UNION ALL SELECT e.bench_angle_id  FROM exercises e WHERE e.id = p_id AND e.bench_angle_id IS NOT NULL
    UNION ALL SELECT e.variant_label_id FROM exercises e WHERE e.id = p_id AND e.variant_label_id IS NOT NULL
    UNION ALL SELECT ee.equipment_id   FROM exercise_equipment ee WHERE ee.exercise_id = p_id
    UNION ALL SELECT ems.movement_style_id
              FROM exercise_movement_styles ems
              JOIN movement_styles ms ON ms.id = ems.movement_style_id AND ms.is_identity
              WHERE ems.exercise_id = p_id
  ) s(v);
$$;

-- generate_exercise_name gains the new fragment bands (22 direction, 24 support,
-- 26 arm position, 28 bench angle, 48 variant — existing band order preserved:
-- 10/12/14 styles, 20 range, 25 grip, 30 stance, 35 alternating symmetry,
-- 40 equipment, 45 load position), the bench-angle implied-equipment suppression
-- (Incline/Decline imply Bench) alongside the load-position/range implications,
-- and CORE-DEFAULT EQUIPMENT SUPPRESSION: equipment named in the core's
-- core_default_equipment (comma-separated) is silent in derivation names.
-- Identity/fingerprint are unaffected by either suppression.
CREATE OR REPLACE FUNCTION public.generate_exercise_name(p_id UUID) RETURNS TEXT
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_core UUID; v_noun TEXT; v_implied UUID[]; v_default_eq TEXT[]; v_frags TEXT;
BEGIN
  SELECT core_movement_id INTO v_core FROM exercises WHERE id = p_id;
  IF v_core IS NULL THEN
    RETURN (SELECT name FROM exercises WHERE id = p_id);      -- outliers keep their name
  END IF;
  SELECT c.name,
         COALESCE((SELECT array_agg(btrim(x)) FROM unnest(string_to_array(c.core_default_equipment, ',')) x
                    WHERE btrim(x) <> ''), '{}')
    INTO v_noun, v_default_eq
    FROM exercises c WHERE c.id = v_core;
  IF v_core = p_id THEN RETURN v_noun; END IF;                -- core row IS the noun

  SELECT COALESCE(array_agg(imp), '{}') INTO v_implied FROM (
    SELECT lp.implies_equipment_id AS imp
      FROM exercises e JOIN load_positions lp ON lp.id = e.load_position_id
     WHERE e.id = p_id AND lp.implies_equipment_id IS NOT NULL
    UNION ALL
    SELECT rd.implies_equipment_id
      FROM exercises e JOIN range_depths rd ON rd.id = e.range_depth_id
     WHERE e.id = p_id AND rd.implies_equipment_id IS NOT NULL
    UNION ALL
    SELECT ba.implies_equipment_id
      FROM exercises e JOIN bench_angles ba ON ba.id = e.bench_angle_id
     WHERE e.id = p_id AND ba.implies_equipment_id IS NOT NULL
  ) s(imp);

  SELECT string_agg(f.frag, ' ' ORDER BY f.ord, f.frag) INTO v_frags FROM (
    SELECT lp.name_fragment AS frag, lp.name_order AS ord
      FROM exercises e JOIN load_positions lp ON lp.id = e.load_position_id WHERE e.id = p_id
    UNION ALL
    SELECT st.name_fragment, st.name_order
      FROM exercises e JOIN stances st ON st.id = e.stance_id WHERE e.id = p_id
    UNION ALL
    SELECT rd.name_fragment, rd.name_order
      FROM exercises e JOIN range_depths rd ON rd.id = e.range_depth_id WHERE e.id = p_id
    UNION ALL
    SELECT sy.name_fragment, sy.name_order
      FROM exercises e JOIN symmetries sy ON sy.id = e.symmetry_id WHERE e.id = p_id
    UNION ALL
    SELECT go.name_fragment, go.name_order
      FROM exercises e JOIN grips go ON go.id = e.grip_orientation_id WHERE e.id = p_id
    UNION ALL
    SELECT gw.name_fragment, gw.name_order
      FROM exercises e JOIN grips gw ON gw.id = e.grip_width_id WHERE e.id = p_id
    UNION ALL
    SELECT d.name_fragment, d.name_order
      FROM exercises e JOIN directions d ON d.id = e.direction_id WHERE e.id = p_id
    UNION ALL
    SELECT sp.name_fragment, sp.name_order
      FROM exercises e JOIN support_positions sp ON sp.id = e.support_position_id WHERE e.id = p_id
    UNION ALL
    SELECT ap.name_fragment, ap.name_order
      FROM exercises e JOIN arm_positions ap ON ap.id = e.arm_position_id WHERE e.id = p_id
    UNION ALL
    SELECT ba.name_fragment, ba.name_order
      FROM exercises e JOIN bench_angles ba ON ba.id = e.bench_angle_id WHERE e.id = p_id
    UNION ALL
    SELECT vl.name_fragment, vl.name_order
      FROM exercises e JOIN variant_labels vl ON vl.id = e.variant_label_id WHERE e.id = p_id
    UNION ALL
    SELECT ms.name_fragment, ms.name_order
      FROM exercise_movement_styles ems JOIN movement_styles ms
        ON ms.id = ems.movement_style_id AND ms.is_identity
      WHERE ems.exercise_id = p_id
    UNION ALL
    SELECT q.name_fragment, q.name_order
      FROM exercise_equipment ee JOIN equipment q ON q.id = ee.equipment_id
      WHERE ee.exercise_id = p_id
        AND NOT (q.id = ANY (v_implied))                      -- implied-equipment suppression
        AND NOT (q.name = ANY (v_default_eq))                 -- core-default suppression
  ) f WHERE f.frag IS NOT NULL AND f.frag <> '';

  RETURN trim(concat_ws(' ', v_frags, v_noun));
END $$;

-- The five new identity columns must fire the recompute trigger. (A core's
-- core_default_equipment is deliberately absent from the list: changing it
-- affects the CHILDREN's names, not the core's own row — callers recompute
-- descendants explicitly, as this migration does.)
DROP TRIGGER IF EXISTS exercises_identity_recompute ON public.exercises;
CREATE TRIGGER exercises_identity_recompute
  AFTER INSERT OR UPDATE OF core_movement_id, is_core, load_position_id, stance_id,
    range_depth_id, symmetry_id, grip_orientation_id, grip_width_id,
    direction_id, support_position_id, arm_position_id, bench_angle_id,
    variant_label_id, name_is_custom ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION trg_exercise_identity();

-- ============================================================================
-- 6) Classification staging data (temp tables; dropped at the end of the file)
-- ============================================================================
CREATE TEMP TABLE _cp_rows (
  exercise_id UUID PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('core','derive','outlier')),
  is_new_core BOOLEAN NOT NULL,
  old_name TEXT,                      -- NULL for the five new core rows
  final_name TEXT NOT NULL,
  name_is_custom BOOLEAN NOT NULL,
  core_id UUID,
  is_movement BOOLEAN NOT NULL,
  family TEXT NOT NULL,
  modality TEXT NOT NULL,
  load_position TEXT, stance TEXT, range_depth TEXT, symmetry TEXT,
  grip_orientation TEXT, grip_width TEXT, bench_angle TEXT,
  direction TEXT, support_position TEXT, arm_position TEXT, variant_slug TEXT,
  equipment TEXT[] NOT NULL,
  styles TEXT[] NOT NULL,
  goals TEXT[] NOT NULL,
  primary_muscles TEXT[] NOT NULL,
  secondary_muscles TEXT[] NOT NULL,
  core_default_equipment TEXT,
  note_wild_aliases TEXT[] NOT NULL,
  suppress_generated_alias BOOLEAN NOT NULL,
  expected_generated TEXT NOT NULL,
  expected_tier INTEGER,
  expected_parent_id UUID
);""")

w("INSERT INTO _cp_rows VALUES")
vals = []
for e in sorted(rows, key=lambda x: x.id):
    vals.append('  (' + ', '.join([
        q(e.id), q(e.kind), qbool(e.is_new), q(e.old_name), q(e.final_name), qbool(e.custom),
        q(e.core_id), qbool(e.is_movement), q(e.family), q(e.modality),
        q(e.load_position), q(e.stance), q(e.range_depth), q(e.symmetry),
        q(e.grip_orientation), q(e.grip_width), q(e.bench_angle),
        q(e.direction), q(e.support_position), q(e.arm_position), q(e.variant),
        qarr(e.equipment), qarr(e.styles), qarr(e.goals),
        qarr(e.primary_muscles), qarr(e.secondary_muscles),
        q(e.core_default_equipment), qarr(e.note_wilds), qbool(e.suppress_generated_alias),
        q(e.gen), qint(e.expected_tier), q(e.expected_parent_id),
    ]) + ')')
w(',\n'.join(vals) + ';')

w("""
CREATE TEMP TABLE _cp_merges (
  loser_id UUID PRIMARY KEY,
  loser_name TEXT NOT NULL,
  winner_id UUID NOT NULL
);""")
w("INSERT INTO _cp_merges VALUES")
w(',\n'.join(f'  ({q(l)}, {q(n)}, {q(wn)})' for l, n, wn, _ in sorted(merge_resolved)) + ';')

w("""
-- Wild aliases captured from merge losers at merge time (name + legacy array);
-- re-asserted after the generated-alias purge so ordering accidents cannot lose them.
CREATE TEMP TABLE _cp_merge_wilds (
  winner_id UUID NOT NULL,
  alias TEXT NOT NULL
);

-- Fail fast if any staged reference value does not resolve (a silent NULL here
-- would otherwise masquerade as a deliberate blank).
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(bad.v, '; ' ORDER BY bad.v) INTO v_observed FROM (
    SELECT 'family: ' || s.family AS v FROM _cp_rows s
      WHERE NOT EXISTS (SELECT 1 FROM public.movement_families f WHERE f.name = s.family)
    UNION SELECT 'modality: ' || s.modality FROM _cp_rows s
      WHERE NOT EXISTS (SELECT 1 FROM public.movement_categories c WHERE c.name = s.modality)
    UNION SELECT 'load_position: ' || s.load_position FROM _cp_rows s
      WHERE s.load_position IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.load_positions x WHERE x.name = s.load_position)
    UNION SELECT 'stance: ' || s.stance FROM _cp_rows s
      WHERE s.stance IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stances x WHERE x.name = s.stance)
    UNION SELECT 'range_depth: ' || s.range_depth FROM _cp_rows s
      WHERE s.range_depth IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.range_depths x WHERE x.name = s.range_depth)
    UNION SELECT 'symmetry: ' || s.symmetry FROM _cp_rows s
      WHERE s.symmetry IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.symmetries x WHERE x.name = s.symmetry)
    UNION SELECT 'grip_orientation: ' || s.grip_orientation FROM _cp_rows s
      WHERE s.grip_orientation IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grips g WHERE g.name = s.grip_orientation AND g.category = 'Orientation')
    UNION SELECT 'grip_width: ' || s.grip_width FROM _cp_rows s
      WHERE s.grip_width IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grips g WHERE g.name = s.grip_width AND g.category = 'Width')
    UNION SELECT 'bench_angle: ' || s.bench_angle FROM _cp_rows s
      WHERE s.bench_angle IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bench_angles x WHERE x.name = s.bench_angle)
    UNION SELECT 'direction: ' || s.direction FROM _cp_rows s
      WHERE s.direction IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.directions x WHERE x.name = s.direction)
    UNION SELECT 'support_position: ' || s.support_position FROM _cp_rows s
      WHERE s.support_position IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.support_positions x WHERE x.name = s.support_position)
    UNION SELECT 'arm_position: ' || s.arm_position FROM _cp_rows s
      WHERE s.arm_position IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.arm_positions x WHERE x.name = s.arm_position)
    UNION SELECT 'equipment: ' || n FROM _cp_rows s CROSS JOIN LATERAL unnest(s.equipment) n
      WHERE NOT EXISTS (SELECT 1 FROM public.equipment x WHERE x.name = n)
    UNION SELECT 'style: ' || n FROM _cp_rows s CROSS JOIN LATERAL unnest(s.styles) n
      WHERE NOT EXISTS (SELECT 1 FROM public.movement_styles x WHERE x.name = n AND x.is_identity)
    UNION SELECT 'goal: ' || n FROM _cp_rows s CROSS JOIN LATERAL unnest(s.goals) n
      WHERE NOT EXISTS (SELECT 1 FROM public.goal_types x WHERE x.name = n)
    UNION SELECT 'muscle: ' || n FROM _cp_rows s CROSS JOIN LATERAL unnest(s.primary_muscles || s.secondary_muscles) n
      WHERE NOT EXISTS (SELECT 1 FROM public.muscle_regions x WHERE x.name = n)
  ) bad(v);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: staged values with no reference row: %', v_observed;
  END IF;

  -- every staged pre-existing exercise must exist with its sheet name (sanity:
  -- ids and names captured together on the approved sheet)
  SELECT string_agg(s.exercise_id::TEXT || ' (' || s.old_name || ')', '; ') INTO v_observed
    FROM _cp_rows s
   WHERE NOT s.is_new_core
     AND NOT EXISTS (SELECT 1 FROM public.exercises e
                      WHERE e.id = s.exercise_id AND e.name IN (s.old_name, s.final_name));
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: sheet rows not matching live exercises by id+name: %', v_observed;
  END IF;

  SELECT string_agg(m.loser_id::TEXT || ' (' || m.loser_name || ')', '; ') INTO v_observed
    FROM _cp_merges m
   WHERE EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = m.loser_id)
     AND NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = m.loser_id AND e.name = m.loser_name);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: merge losers not matching live exercises by id+name: %', v_observed;
  END IF;
END $$;

-- ============================================================================
-- 7) Core pass: five new core rows, promotions, curated renames, core-default
--    equipment. Descendants are recomputed in section 11 (a core rename does
--    not retrigger children on its own — the trigger has no name column).
-- ============================================================================""")
for name in sorted(NEW_CORE_SEEDS):
    e = by_final_name[name]
    slug = NEW_CORE_SLUGS[name]
    interim = slug + '-core' if name in SLUG_HELD_BY_LOSER else slug
    comment = (' (canonical slug is freed by the merges below, then claimed in section 8)'
               if name in SLUG_HELD_BY_LOSER else '')
    w(f"""-- new core: {name}{comment}
INSERT INTO public.exercises (id, name, slug, is_core, is_official, is_movement, name_is_custom,
                              movement_family_id, movement_category_id, core_default_equipment)
SELECT {q(e.id)}, {q(name)}, {q(interim)}, true, true, {qbool(e.is_movement)}, true,
       (SELECT id FROM public.movement_families WHERE name = {q(e.family)}),
       (SELECT id FROM public.movement_categories WHERE name = {q(e.modality)}),
       {q(e.core_default_equipment)}
 WHERE NOT EXISTS (SELECT 1 FROM public.exercises WHERE id = {q(e.id)});""")

w("""
-- Promote + rename the 43 sheet cores (9 already core from Stage 1). The BEFORE
-- trigger self-references core_movement_id; the AFTER trigger recomputes.
UPDATE public.exercises e
   SET is_core = true,
       parent_exercise_id = NULL,      -- check_core_no_parent: a core sheds its legacy parent
       name = s.final_name,
       name_is_custom = s.name_is_custom,
       core_default_equipment = s.core_default_equipment,
       updated_at = now()
  FROM _cp_rows s
 WHERE s.exercise_id = e.id AND s.kind = 'core' AND NOT s.is_new_core
   AND (NOT e.is_core
        OR e.parent_exercise_id IS NOT NULL
        OR e.name IS DISTINCT FROM s.final_name
        OR e.name_is_custom IS DISTINCT FROM s.name_is_custom
        OR e.core_default_equipment IS DISTINCT FROM s.core_default_equipment);

-- ============================================================================
-- 8) variant_labels seed (G2: each label scoped to exactly one core, by id)
-- ============================================================================""")
core_id_by_name = {name: by_final_name[name].id for name in core_default}
for slug, scope, fragment, order in sorted(VARIANT_SEEDS):
    if scope not in core_id_by_name:
        sys.exit('variant label %s scoped to unknown core %r' % (slug, scope))
    w(f"INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)\n"
      f"SELECT {q(core_id_by_name[scope])}, {q(slug)}, {q(fragment)}, {order}  -- core: {scope}\n"
      f" WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels\n"
      f"                    WHERE core_movement_id = {q(core_id_by_name[scope])} AND slug = {q(slug)});")

w("""
-- ============================================================================
-- 9) Merges: 25 duplicate rows fold into their winners. The repoint is driven
--    by pg_constraint at runtime — every FK that references exercises(id) is
--    discovered and repointed (dedupe-skip against any unique index containing
--    the FK column), so a schema addition can never silently orphan rows.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_exercise_into(p_loser UUID, p_winner UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fk RECORD;
  idx RECORD;
  v_cond TEXT;
  v_loser_name TEXT;
  v_winner_name TEXT;
BEGIN
  IF p_loser = p_winner THEN
    RAISE EXCEPTION 'merge_exercise_into: loser and winner are the same row (%)', p_loser;
  END IF;
  SELECT name INTO v_winner_name FROM exercises WHERE id = p_winner FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_exercise_into: winner % does not exist', p_winner;
  END IF;
  SELECT name INTO v_loser_name FROM exercises WHERE id = p_loser FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;                                                   -- already merged (idempotent)
  END IF;

  -- The loser's display name and its legacy array aliases survive as wild
  -- aliases on the winner (never one that trim-equals the winner's own name).
  INSERT INTO exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
  SELECT p_winner, a.alias, normalize_alias(a.alias), 'wild', 'seed'
    FROM (SELECT v_loser_name AS alias
          UNION
          SELECT unnest(l.aliases) FROM exercises l WHERE l.id = p_loser) a
   WHERE btrim(a.alias) <> v_winner_name
     AND normalize_alias(a.alias) <> ''
  ON CONFLICT (alias_normalized) DO NOTHING;

  FOR fk IN
    SELECT c.oid AS con_oid, c.conrelid::regclass AS tbl, a.attname AS col,
           c.conrelid = 'public.exercises'::regclass::oid AS self_ref,
           cardinality(c.conkey) AS ncols
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.confrelid = 'public.exercises'::regclass
     ORDER BY c.conrelid::regclass::text, a.attname
  LOOP
    IF fk.ncols <> 1 THEN
      RAISE EXCEPTION 'merge_exercise_into: multi-column FK % on % is not supported', fk.con_oid::regclass, fk.tbl;
    END IF;

    -- Dedupe-skip: for every unique index containing this column, drop loser
    -- rows whose repointed image already exists on the winner.
    FOR idx IN
      SELECT i.indexrelid,
             (SELECT string_agg(format('t2.%1$I IS NOT DISTINCT FROM t1.%1$I', a2.attname), ' AND ')
                FROM unnest(i.indkey[0:i.indnkeyatts-1]) k(attnum)
                JOIN pg_attribute a2 ON a2.attrelid = i.indrelid AND a2.attnum = k.attnum
               WHERE a2.attname <> fk.col) AS other_cols
        FROM pg_index i
       WHERE i.indrelid = fk.tbl AND i.indisunique
         AND i.indpred IS NULL AND i.indexprs IS NULL
         AND EXISTS (SELECT 1 FROM unnest(i.indkey[0:i.indnkeyatts-1]) k(attnum)
                       JOIN pg_attribute a2 ON a2.attrelid = i.indrelid AND a2.attnum = k.attnum
                      WHERE a2.attname = fk.col)
       ORDER BY i.indexrelid
    LOOP
      EXECUTE format(
        'DELETE FROM %s t1 WHERE t1.%I = $1 AND EXISTS (SELECT 1 FROM %s t2 WHERE t2.%I = $2 AND %s)',
        fk.tbl, fk.col, fk.tbl, fk.col, COALESCE(idx.other_cols, 'true'))
      USING p_loser, p_winner;
    END LOOP;

    EXECUTE format('UPDATE %s SET %I = $2 WHERE %I = $1%s',
                   fk.tbl, fk.col, fk.col,
                   CASE WHEN fk.self_ref THEN ' AND id <> $1' ELSE '' END)
    USING p_loser, p_winner;
  END LOOP;

  -- Scaling links that became self-referential collapse away.
  IF to_regclass('public.movement_scaling_links') IS NOT NULL THEN
    DELETE FROM movement_scaling_links WHERE from_exercise_id = to_exercise_id;
  END IF;

  DELETE FROM exercises WHERE id = p_loser;
END $$;

DO $$
DECLARE
  m RECORD;
BEGIN
  FOR m IN SELECT * FROM _cp_merges ORDER BY loser_name LOOP
    IF NOT EXISTS (SELECT 1 FROM public.exercises WHERE id = m.winner_id) THEN
      RAISE EXCEPTION 'catalog pass FAIL: merge winner % for loser % missing', m.winner_id, m.loser_name;
    END IF;
    -- capture the loser''s wild-alias contributions before it disappears, so the
    -- alias rebuild (section 14) can re-assert them after the generated purge
    INSERT INTO _cp_merge_wilds (winner_id, alias)
    SELECT m.winner_id, a.alias
      FROM public.exercises l
      CROSS JOIN LATERAL (SELECT l.name AS alias UNION SELECT unnest(l.aliases)) a
     WHERE l.id = m.loser_id
       AND btrim(a.alias) <> (SELECT name FROM public.exercises WHERE id = m.winner_id)
       AND public.normalize_alias(a.alias) <> '';
    PERFORM public.merge_exercise_into(m.loser_id, m.winner_id);
  END LOOP;
END $$;
""")

# canonical slug flips for new cores whose slug was held by a merge loser
for name in sorted(SLUG_HELD_BY_LOSER):
    e = by_final_name[name]
    slug = NEW_CORE_SLUGS[name]
    w(f"""-- the merges above freed the canonical slug for {name}
UPDATE public.exercises SET slug = {q(slug)}
 WHERE id = {q(e.id)} AND slug IS DISTINCT FROM {q(slug)};""")

w("""
-- ============================================================================
-- 10) Classification: every surviving row gets its approved attribute set,
--     display name and flags in one row-update (the identity trigger recomputes
--     per row once the statement completes), then the junctions are synced.
-- ============================================================================
UPDATE public.exercises e
   SET is_core = (s.kind = 'core'),
       core_movement_id = s.core_id,
       is_movement = s.is_movement,
       name = s.final_name,
       name_is_custom = s.name_is_custom,
       core_default_equipment = s.core_default_equipment,
       movement_family_id = (SELECT id FROM public.movement_families WHERE name = s.family),
       movement_category_id = (SELECT id FROM public.movement_categories WHERE name = s.modality),
       goal_type_id = (SELECT id FROM public.goal_types WHERE name = s.goals[1]),
       load_position_id = (SELECT id FROM public.load_positions WHERE name = s.load_position),
       stance_id = (SELECT id FROM public.stances WHERE name = s.stance),
       range_depth_id = (SELECT id FROM public.range_depths WHERE name = s.range_depth),
       symmetry_id = (SELECT id FROM public.symmetries WHERE name = s.symmetry),
       grip_orientation_id = (SELECT id FROM public.grips WHERE name = s.grip_orientation AND category = 'Orientation'),
       grip_width_id = (SELECT id FROM public.grips WHERE name = s.grip_width AND category = 'Width'),
       bench_angle_id = (SELECT id FROM public.bench_angles WHERE name = s.bench_angle),
       direction_id = (SELECT id FROM public.directions WHERE name = s.direction),
       support_position_id = (SELECT id FROM public.support_positions WHERE name = s.support_position),
       arm_position_id = (SELECT id FROM public.arm_positions WHERE name = s.arm_position),
       variant_label_id = (SELECT id FROM public.variant_labels
                            WHERE slug = s.variant_slug AND core_movement_id = s.core_id),
       -- outliers keep no machine hierarchy: the legacy hand-set parents the
       -- engine preserves for coreless rows retire with this pass
       parent_exercise_id = CASE WHEN s.kind = 'outlier' THEN NULL ELSE e.parent_exercise_id END,
       updated_at = now()
  FROM _cp_rows s
 WHERE s.exercise_id = e.id;

-- Equipment junction := the approved per-row set (cores carry none — the new
-- convention; their defaults live in core_default_equipment as naming metadata).
DELETE FROM public.exercise_equipment ee
 USING _cp_rows s
 WHERE ee.exercise_id = s.exercise_id
   AND NOT EXISTS (SELECT 1 FROM unnest(s.equipment) n
                    JOIN public.equipment q ON q.name = n
                   WHERE q.id = ee.equipment_id);
INSERT INTO public.exercise_equipment (exercise_id, equipment_id)
SELECT s.exercise_id, q.id
  FROM _cp_rows s
 CROSS JOIN LATERAL unnest(s.equipment) n
  JOIN public.equipment q ON q.name = n
ON CONFLICT (exercise_id, equipment_id) DO NOTHING;

-- Identity styles := the approved per-row set. Modifier-style junction rows
-- (Tempo, Pause, …) are prescription metadata and stay untouched.
DELETE FROM public.exercise_movement_styles ems
 USING _cp_rows s, public.movement_styles ms
 WHERE ems.exercise_id = s.exercise_id
   AND ms.id = ems.movement_style_id AND ms.is_identity
   AND NOT (ms.name = ANY (s.styles));
INSERT INTO public.exercise_movement_styles (exercise_id, movement_style_id)
SELECT s.exercise_id, ms.id
  FROM _cp_rows s
 CROSS JOIN LATERAL unnest(s.styles) n
  JOIN public.movement_styles ms ON ms.name = n AND ms.is_identity
ON CONFLICT (exercise_id, movement_style_id) DO NOTHING;

-- Goals := the approved per-row set (legacy goal_type_id was set to the first
-- listed goal above; the junction carries the full set).
DELETE FROM public.exercise_goal_types x
 USING _cp_rows s
 WHERE x.exercise_id = s.exercise_id
   AND NOT EXISTS (SELECT 1 FROM unnest(s.goals) n
                    JOIN public.goal_types g ON g.name = n
                   WHERE g.id = x.goal_type_id);
INSERT INTO public.exercise_goal_types (exercise_id, goal_type_id)
SELECT s.exercise_id, g.id
  FROM _cp_rows s
 CROSS JOIN LATERAL unnest(s.goals) n
  JOIN public.goal_types g ON g.name = n
ON CONFLICT (exercise_id, goal_type_id) DO NOTHING;

-- Muscles := the approved per-row sets with the primary/secondary split.
DELETE FROM public.exercise_muscle_regions x
 USING _cp_rows s
 WHERE x.exercise_id = s.exercise_id
   AND NOT EXISTS (SELECT 1 FROM unnest(s.primary_muscles || s.secondary_muscles) n
                    JOIN public.muscle_regions m ON m.name = n
                   WHERE m.id = x.muscle_region_id);
UPDATE public.exercise_muscle_regions x
   SET is_primary = (m.name = ANY (s.primary_muscles))
  FROM _cp_rows s, public.muscle_regions m
 WHERE x.exercise_id = s.exercise_id AND m.id = x.muscle_region_id
   AND x.is_primary IS DISTINCT FROM (m.name = ANY (s.primary_muscles));
INSERT INTO public.exercise_muscle_regions (exercise_id, muscle_region_id, is_primary)
SELECT s.exercise_id, m.id, (m.name = ANY (s.primary_muscles))
  FROM _cp_rows s
 CROSS JOIN LATERAL unnest(s.primary_muscles || s.secondary_muscles) n
  JOIN public.muscle_regions m ON m.name = n
ON CONFLICT (exercise_id, muscle_region_id) DO NOTHING;

-- ============================================================================
-- 11) Deterministic full recompute, ascending identity-attribute cardinality:
--     parents always finalize before their children, so the machine-derived
--     parent/tier chain lands in one pass (covers the core renames too).
-- ============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.exercises
    ORDER BY cardinality(public.exercise_identity_attrs(id)) ASC, created_at ASC, id ASC
  LOOP
    PERFORM public.recompute_exercise_identity(r.id);
  END LOOP;
END $$;

-- ============================================================================
-- 12) Legacy equipment_types array: kept in place (it drops in Stage 6) but
--     updated to the canonical final state so the array and the junction agree
--     — for cores that means their core-default equipment (the array still
--     feeds the app's equipment filters; an empty array would blank them).
-- ============================================================================
UPDATE public.exercises e
   SET equipment_types = v.arr
  FROM (SELECT s.exercise_id,
               CASE WHEN s.kind = 'core'
                    THEN COALESCE((SELECT array_agg(btrim(x)) FROM unnest(string_to_array(s.core_default_equipment, ',')) x
                                    WHERE btrim(x) <> ''), '{}')
                    ELSE s.equipment
               END AS arr
          FROM _cp_rows s) v
 WHERE e.id = v.exercise_id
   AND e.equipment_types IS DISTINCT FROM v.arr;

-- ============================================================================
-- 13) Legacy 'Supine / Prone' stance retires: the classification above is the
--     only writer of stance_id, so zero references must remain.
-- ============================================================================
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_observed
    FROM public.exercises e
    JOIN public.stances s ON s.id = e.stance_id
   WHERE s.name = 'Supine / Prone';
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: rows still on legacy Supine / Prone stance: %', v_observed;
  END IF;
END $$;
-- legacy dual-store junction debris goes with it (the FK would cascade anyway;
-- explicit for the record — 1 row on the 2026-08-24 snapshot)
DELETE FROM public.exercise_stances es
 USING public.stances s
 WHERE s.id = es.stance_id AND s.name = 'Supine / Prone';
DELETE FROM public.stances WHERE name = 'Supine / Prone';

-- ============================================================================
-- 14) Alias purge + rebuild. Order matters: purge ALL generated aliases (the
--     per-row recomputes above minted every intermediate name as debris; the
--     merge-time wilds landed before the purge and are re-asserted after it),
--     then re-mint generated aliases from the final generated names — only for
--     rows whose generated name differs from their display name — and finally
--     insert the wild set (old display names, sheet-note wilds, legacy array
--     aliases, merge-loser contributions). Generated aliases mint first so a
--     string that is both a row's generated name and one of its wild sources
--     lands as kind='generated'. A mint collision with an alias owned by
--     another exercise routes to exercise_match_reviews instead of failing,
--     except the documented Single-Arm Powerbomb suppression (its generated
--     alias would duplicate sibling Overhead Extension's, because Unilateral
--     is silent in names).
-- ============================================================================
DELETE FROM public.exercise_aliases WHERE kind = 'generated';

-- re-mint generated aliases
DO $$
DECLARE
  r RECORD;
  v_n INTEGER;
  v_norm TEXT;
  v_user UUID;
BEGIN
  FOR r IN
    SELECT e.id, e.name, e.generated_name, e.created_by
      FROM public.exercises e
      JOIN _cp_rows s ON s.exercise_id = e.id
     WHERE e.core_movement_id IS NOT NULL              -- never read generated_name off a coreless row
       AND e.generated_name IS NOT NULL AND e.generated_name <> ''
       AND e.generated_name <> e.name
       AND NOT s.suppress_generated_alias              -- the documented Powerbomb suppression
     ORDER BY e.name, e.id
  LOOP
    v_norm := public.normalize_alias(r.generated_name);
    INSERT INTO public.exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
    VALUES (r.id, r.generated_name, v_norm, 'generated', 'seed')
    ON CONFLICT (alias_normalized) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 AND NOT EXISTS (SELECT 1 FROM public.exercise_aliases
                                WHERE exercise_id = r.id AND alias_normalized = v_norm) THEN
      -- collision with an alias owned elsewhere: route to review, never fail
      SELECT COALESCE(r.created_by, (SELECT u.id FROM auth.users u ORDER BY u.created_at, u.id LIMIT 1))
        INTO v_user;
      IF v_user IS NULL THEN
        RAISE EXCEPTION 'catalog pass FAIL: generated-alias collision for % (%) and no auth user to own the review row',
          r.name, r.generated_name;
      END IF;
      INSERT INTO public.exercise_match_reviews (user_id, raw_name, raw_name_normalized, context, candidates, status)
      SELECT v_user, r.generated_name, v_norm,
             'catalog-pass generated-alias collision (exercise ' || r.id || ')',
             '[]'::jsonb, 'pending'
       WHERE NOT EXISTS (SELECT 1 FROM public.exercise_match_reviews
                          WHERE raw_name_normalized = v_norm
                            AND context = 'catalog-pass generated-alias collision (exercise ' || r.id || ')');
      RAISE WARNING 'catalog pass: generated alias % for % collided; routed to exercise_match_reviews',
        r.generated_name, r.name;
    END IF;
  END LOOP;
END $$;

-- old display names become wild aliases (skip exact keep-names: a trim-equal
-- alias of the row's own final name carries no information)
INSERT INTO public.exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
SELECT s.exercise_id, s.old_name, public.normalize_alias(s.old_name), 'wild', 'seed'
  FROM _cp_rows s
 WHERE s.old_name IS NOT NULL
   AND btrim(s.old_name) <> s.final_name
   AND public.normalize_alias(s.old_name) <> ''
ON CONFLICT (alias_normalized) DO NOTHING;

-- sheet-note wild aliases (wild-alias: markers on the approved sheet)
INSERT INTO public.exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
SELECT s.exercise_id, a, public.normalize_alias(a), 'wild', 'seed'
  FROM _cp_rows s
 CROSS JOIN LATERAL unnest(s.note_wild_aliases) a
 WHERE public.normalize_alias(a) <> ''
ON CONFLICT (alias_normalized) DO NOTHING;

-- legacy exercises.aliases array contents become wild aliases (the array drops
-- in Stage 6; from here the alias table is the single source of truth)
INSERT INTO public.exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
SELECT e.id, a, public.normalize_alias(a), 'wild', 'seed'
  FROM public.exercises e
 CROSS JOIN LATERAL unnest(e.aliases) a
 WHERE btrim(a) <> e.name
   AND public.normalize_alias(a) <> ''
ON CONFLICT (alias_normalized) DO NOTHING;

-- merge-loser contributions, re-asserted post-purge
INSERT INTO public.exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
SELECT mw.winner_id, mw.alias, public.normalize_alias(mw.alias), 'wild', 'seed'
  FROM _cp_merge_wilds mw
ON CONFLICT (alias_normalized) DO NOTHING;
""")

# ---------------------------------------------------------------------------
# Self-verify
# ---------------------------------------------------------------------------
w("""-- ============================================================================
-- 15) SELF-VERIFY (standing rule): assert the achieved end state against the
--     blessed projection before the transaction commits; observed values in
--     every failure message. `db push` does not run the harness, so this file
--     fails the push closed on any drift.
-- ============================================================================

-- 15a) population: exactly the staged 287 rows survive, 48/187/52 by kind,
--      every merge loser gone, every winner present
DO $$
DECLARE
  v_observed TEXT;
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.exercises;
  IF v_count <> 287 THEN
    RAISE EXCEPTION 'catalog pass FAIL: exercises count % (expected 287)', v_count;
  END IF;

  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_observed
    FROM public.exercises e WHERE NOT EXISTS (SELECT 1 FROM _cp_rows s WHERE s.exercise_id = e.id);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: unstaged exercises present: %', v_observed;
  END IF;
  SELECT string_agg(s.final_name, ', ' ORDER BY s.final_name) INTO v_observed
    FROM _cp_rows s WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = s.exercise_id);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: staged exercises missing: %', v_observed;
  END IF;

  SELECT count(*) INTO v_count FROM public.exercises WHERE is_core;
  IF v_count <> 48 THEN
    RAISE EXCEPTION 'catalog pass FAIL: core count % (expected 48)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.exercises WHERE NOT is_core AND core_movement_id IS NOT NULL;
  IF v_count <> 187 THEN
    RAISE EXCEPTION 'catalog pass FAIL: derivation count % (expected 187)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.exercises WHERE core_movement_id IS NULL;
  IF v_count <> 52 THEN
    RAISE EXCEPTION 'catalog pass FAIL: outlier count % (expected 52)', v_count;
  END IF;

  SELECT string_agg(m.loser_name, ', ' ORDER BY m.loser_name) INTO v_observed
    FROM _cp_merges m WHERE EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = m.loser_id);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: merge losers still present: %', v_observed;
  END IF;
  SELECT string_agg(m.loser_name || ' -> ' || m.winner_id, ', ' ORDER BY m.loser_name) INTO v_observed
    FROM _cp_merges m WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = m.winner_id);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: merge winners missing: %', v_observed;
  END IF;
END $$;

-- 15b) per-row end state: display name, custom flag, generated name, core,
--      tier, machine parent, is_movement, family, modality — all 287 rows
--      against the blessed projection
DO $$
DECLARE
  v_bad INTEGER;
  v_observed TEXT;
BEGIN
  SELECT count(*),
         string_agg(bad.detail, E'\\n' ORDER BY bad.detail) FILTER (WHERE bad.rn <= 10)
    INTO v_bad, v_observed
  FROM (
    SELECT row_number() OVER (ORDER BY s.final_name) AS rn,
           s.final_name || ': ' ||
           concat_ws('; ',
             CASE WHEN e.name IS DISTINCT FROM s.final_name
                  THEN 'name=' || COALESCE(e.name, 'null') END,
             CASE WHEN e.name_is_custom IS DISTINCT FROM s.name_is_custom
                  THEN 'name_is_custom=' || e.name_is_custom::TEXT END,
             CASE WHEN e.generated_name IS DISTINCT FROM s.expected_generated
                  THEN 'generated=' || COALESCE(e.generated_name, 'null') || ' (expected ' || s.expected_generated || ')' END,
             CASE WHEN e.core_movement_id IS DISTINCT FROM s.core_id
                  THEN 'core=' || COALESCE(e.core_movement_id::TEXT, 'null') END,
             CASE WHEN e.is_core IS DISTINCT FROM (s.kind = 'core')
                  THEN 'is_core=' || e.is_core::TEXT END,
             CASE WHEN e.tier IS DISTINCT FROM s.expected_tier
                  THEN 'tier=' || COALESCE(e.tier::TEXT, 'null') || ' (expected ' || COALESCE(s.expected_tier::TEXT, 'null') || ')' END,
             CASE WHEN e.parent_exercise_id IS DISTINCT FROM s.expected_parent_id
                  THEN 'parent=' || COALESCE(e.parent_exercise_id::TEXT, 'null') || ' (expected ' || COALESCE(s.expected_parent_id::TEXT, 'null') || ')' END,
             CASE WHEN e.is_movement IS DISTINCT FROM s.is_movement
                  THEN 'is_movement=' || COALESCE(e.is_movement::TEXT, 'null') END,
             CASE WHEN f.name IS DISTINCT FROM s.family
                  THEN 'family=' || COALESCE(f.name, 'null') END,
             CASE WHEN mc.name IS DISTINCT FROM s.modality
                  THEN 'modality=' || COALESCE(mc.name, 'null') END,
             CASE WHEN e.core_movement_id IS NOT NULL AND e.identity_fingerprint IS NULL
                  THEN 'fingerprint=null' END
           ) AS detail
      FROM _cp_rows s
      JOIN public.exercises e ON e.id = s.exercise_id
      LEFT JOIN public.movement_families f ON f.id = e.movement_family_id
      LEFT JOIN public.movement_categories mc ON mc.id = e.movement_category_id
     WHERE e.name IS DISTINCT FROM s.final_name
        OR e.name_is_custom IS DISTINCT FROM s.name_is_custom
        OR e.generated_name IS DISTINCT FROM s.expected_generated
        OR e.core_movement_id IS DISTINCT FROM s.core_id
        OR e.is_core IS DISTINCT FROM (s.kind = 'core')
        OR e.tier IS DISTINCT FROM s.expected_tier
        OR e.parent_exercise_id IS DISTINCT FROM s.expected_parent_id
        OR e.is_movement IS DISTINCT FROM s.is_movement
        OR f.name IS DISTINCT FROM s.family
        OR mc.name IS DISTINCT FROM s.modality
        OR (e.core_movement_id IS NOT NULL AND e.identity_fingerprint IS NULL)
  ) bad;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'catalog pass FAIL: % rows diverge from the blessed projection (first 10):\\n%', v_bad, v_observed;
  END IF;
END $$;

-- 15c) attribute columns resolve to exactly the staged values (both directions:
--      a NULL where the sheet has a value is as fatal as the reverse)
DO $$
DECLARE
  v_bad INTEGER;
  v_observed TEXT;
BEGIN
  SELECT count(*), string_agg(bad.detail, E'\\n' ORDER BY bad.detail) FILTER (WHERE bad.rn <= 10)
    INTO v_bad, v_observed
  FROM (
    SELECT row_number() OVER (ORDER BY s.final_name) AS rn,
           s.final_name || ': ' ||
           concat_ws('; ',
             CASE WHEN lp.name IS DISTINCT FROM s.load_position THEN 'load_position=' || COALESCE(lp.name, 'null') || '<>' || COALESCE(s.load_position, 'null') END,
             CASE WHEN st.name IS DISTINCT FROM s.stance THEN 'stance=' || COALESCE(st.name, 'null') || '<>' || COALESCE(s.stance, 'null') END,
             CASE WHEN rd.name IS DISTINCT FROM s.range_depth THEN 'range_depth=' || COALESCE(rd.name, 'null') || '<>' || COALESCE(s.range_depth, 'null') END,
             CASE WHEN sy.name IS DISTINCT FROM s.symmetry THEN 'symmetry=' || COALESCE(sy.name, 'null') || '<>' || COALESCE(s.symmetry, 'null') END,
             CASE WHEN go.name IS DISTINCT FROM s.grip_orientation THEN 'grip_orientation=' || COALESCE(go.name, 'null') || '<>' || COALESCE(s.grip_orientation, 'null') END,
             CASE WHEN gw.name IS DISTINCT FROM s.grip_width THEN 'grip_width=' || COALESCE(gw.name, 'null') || '<>' || COALESCE(s.grip_width, 'null') END,
             CASE WHEN ba.name IS DISTINCT FROM s.bench_angle THEN 'bench_angle=' || COALESCE(ba.name, 'null') || '<>' || COALESCE(s.bench_angle, 'null') END,
             CASE WHEN di.name IS DISTINCT FROM s.direction THEN 'direction=' || COALESCE(di.name, 'null') || '<>' || COALESCE(s.direction, 'null') END,
             CASE WHEN sp.name IS DISTINCT FROM s.support_position THEN 'support=' || COALESCE(sp.name, 'null') || '<>' || COALESCE(s.support_position, 'null') END,
             CASE WHEN ap.name IS DISTINCT FROM s.arm_position THEN 'arm_position=' || COALESCE(ap.name, 'null') || '<>' || COALESCE(s.arm_position, 'null') END,
             CASE WHEN vl.slug IS DISTINCT FROM s.variant_slug THEN 'variant=' || COALESCE(vl.slug, 'null') || '<>' || COALESCE(s.variant_slug, 'null') END
           ) AS detail
      FROM _cp_rows s
      JOIN public.exercises e ON e.id = s.exercise_id
      LEFT JOIN public.load_positions lp ON lp.id = e.load_position_id
      LEFT JOIN public.stances st ON st.id = e.stance_id
      LEFT JOIN public.range_depths rd ON rd.id = e.range_depth_id
      LEFT JOIN public.symmetries sy ON sy.id = e.symmetry_id
      LEFT JOIN public.grips go ON go.id = e.grip_orientation_id
      LEFT JOIN public.grips gw ON gw.id = e.grip_width_id
      LEFT JOIN public.bench_angles ba ON ba.id = e.bench_angle_id
      LEFT JOIN public.directions di ON di.id = e.direction_id
      LEFT JOIN public.support_positions sp ON sp.id = e.support_position_id
      LEFT JOIN public.arm_positions ap ON ap.id = e.arm_position_id
      LEFT JOIN public.variant_labels vl ON vl.id = e.variant_label_id
     WHERE lp.name IS DISTINCT FROM s.load_position
        OR st.name IS DISTINCT FROM s.stance
        OR rd.name IS DISTINCT FROM s.range_depth
        OR sy.name IS DISTINCT FROM s.symmetry
        OR go.name IS DISTINCT FROM s.grip_orientation
        OR gw.name IS DISTINCT FROM s.grip_width
        OR ba.name IS DISTINCT FROM s.bench_angle
        OR di.name IS DISTINCT FROM s.direction
        OR sp.name IS DISTINCT FROM s.support_position
        OR ap.name IS DISTINCT FROM s.arm_position
        OR vl.slug IS DISTINCT FROM s.variant_slug
  ) bad;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'catalog pass FAIL: % rows with divergent attribute columns (first 10):\\n%', v_bad, v_observed;
  END IF;
END $$;

-- 15d) junction equality per row: equipment (equivalent to the sheet, which
--      already folds the implied-equipment canonicalization), identity styles,
--      goals, muscles with the primary/secondary split; plus no orphans and
--      the cores-carry-no-equipment convention
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(bad.v, E'\\n' ORDER BY bad.v) INTO v_observed FROM (
    SELECT s.final_name || ' equipment: {' ||
           COALESCE((SELECT string_agg(q.name, ',' ORDER BY q.name)
                       FROM public.exercise_equipment ee JOIN public.equipment q ON q.id = ee.equipment_id
                      WHERE ee.exercise_id = s.exercise_id), '') || '} expected {' ||
           array_to_string(s.equipment, ',') || '}' AS v
      FROM _cp_rows s
     WHERE COALESCE((SELECT array_agg(q.name ORDER BY q.name)
                       FROM public.exercise_equipment ee JOIN public.equipment q ON q.id = ee.equipment_id
                      WHERE ee.exercise_id = s.exercise_id), '{}')
           IS DISTINCT FROM (SELECT COALESCE(array_agg(x ORDER BY x), '{}') FROM unnest(s.equipment) x)
    UNION ALL
    SELECT s.final_name || ' identity styles: {' ||
           COALESCE((SELECT string_agg(ms.name, ',' ORDER BY ms.name)
                       FROM public.exercise_movement_styles x JOIN public.movement_styles ms
                         ON ms.id = x.movement_style_id AND ms.is_identity
                      WHERE x.exercise_id = s.exercise_id), '') || '} expected {' ||
           array_to_string(s.styles, ',') || '}'
      FROM _cp_rows s
     WHERE COALESCE((SELECT array_agg(ms.name ORDER BY ms.name)
                       FROM public.exercise_movement_styles x JOIN public.movement_styles ms
                         ON ms.id = x.movement_style_id AND ms.is_identity
                      WHERE x.exercise_id = s.exercise_id), '{}')
           IS DISTINCT FROM (SELECT COALESCE(array_agg(y ORDER BY y), '{}') FROM unnest(s.styles) y)
    UNION ALL
    SELECT s.final_name || ' goals: {' ||
           COALESCE((SELECT string_agg(g.name, ',' ORDER BY g.name)
                       FROM public.exercise_goal_types x JOIN public.goal_types g ON g.id = x.goal_type_id
                      WHERE x.exercise_id = s.exercise_id), '') || '} expected {' ||
           array_to_string(s.goals, ',') || '}'
      FROM _cp_rows s
     WHERE COALESCE((SELECT array_agg(g.name ORDER BY g.name)
                       FROM public.exercise_goal_types x JOIN public.goal_types g ON g.id = x.goal_type_id
                      WHERE x.exercise_id = s.exercise_id), '{}')
           IS DISTINCT FROM (SELECT COALESCE(array_agg(gg ORDER BY gg), '{}') FROM unnest(s.goals) gg)
    UNION ALL
    SELECT s.final_name || ' primary muscles diverge'
      FROM _cp_rows s
     WHERE COALESCE((SELECT array_agg(m.name ORDER BY m.name)
                       FROM public.exercise_muscle_regions x JOIN public.muscle_regions m ON m.id = x.muscle_region_id
                      WHERE x.exercise_id = s.exercise_id AND x.is_primary), '{}')
           IS DISTINCT FROM (SELECT COALESCE(array_agg(y ORDER BY y), '{}') FROM unnest(s.primary_muscles) y)
    UNION ALL
    SELECT s.final_name || ' secondary muscles diverge'
      FROM _cp_rows s
     WHERE COALESCE((SELECT array_agg(m.name ORDER BY m.name)
                       FROM public.exercise_muscle_regions x JOIN public.muscle_regions m ON m.id = x.muscle_region_id
                      WHERE x.exercise_id = s.exercise_id AND NOT x.is_primary), '{}')
           IS DISTINCT FROM (SELECT COALESCE(array_agg(y ORDER BY y), '{}') FROM unnest(s.secondary_muscles) y)
  ) bad(v);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: junction divergence from the sheet:\\n%', v_observed;
  END IF;

  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_observed
    FROM public.exercises e
   WHERE e.is_core AND EXISTS (SELECT 1 FROM public.exercise_equipment ee WHERE ee.exercise_id = e.id);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: cores carrying equipment junction rows: %', v_observed;
  END IF;

  SELECT count(*)::TEXT INTO v_observed
    FROM public.exercise_equipment ee
   WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = ee.exercise_id)
      OR NOT EXISTS (SELECT 1 FROM public.equipment q WHERE q.id = ee.equipment_id);
  IF v_observed <> '0' THEN
    RAISE EXCEPTION 'catalog pass FAIL: % orphaned exercise_equipment rows', v_observed;
  END IF;
END $$;
""")

pairs_sql = ',\n    '.join(
    f"({q(by_final_name[core].id)}, {q(gen)}, {n})" for core, gen, n in declared_pairs)
w(f"""-- 15e) identity invariants: no fingerprint duplicates within a core; the only
--      within-core generated-name duplicates are the five DECLARED silent-
--      attribute collisions on the blessed projection (Unilateral/Pronated are
--      silent in names, so the fingerprints differ while the names agree)
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(d.msg, '; ' ORDER BY d.msg) INTO v_observed FROM (
    SELECT 'core ' || c.name || ' fingerprint ' || e.identity_fingerprint || ' x' || count(*) AS msg
      FROM public.exercises e JOIN public.exercises c ON c.id = e.core_movement_id
     WHERE e.core_movement_id IS NOT NULL
     GROUP BY c.name, e.core_movement_id, e.identity_fingerprint
    HAVING count(*) > 1
  ) d;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: duplicate fingerprints within a core: %', v_observed;
  END IF;

  WITH dupes AS (
    SELECT e.core_movement_id, e.generated_name, count(*) AS n
      FROM public.exercises e
     WHERE e.core_movement_id IS NOT NULL AND NOT e.is_core
     GROUP BY e.core_movement_id, e.generated_name
    HAVING count(*) > 1
  ), declared(core_id, generated_name, n) AS (VALUES
    {pairs_sql}
  )
  SELECT string_agg(d.msg, '; ' ORDER BY d.msg) INTO v_observed FROM (
    SELECT 'undeclared: ' || dp.generated_name || ' x' || dp.n AS msg
      FROM dupes dp
     WHERE NOT EXISTS (SELECT 1 FROM declared dc
                        WHERE dc.core_id::uuid = dp.core_movement_id
                          AND dc.generated_name = dp.generated_name AND dc.n = dp.n)
    UNION ALL
    SELECT 'missing declared: ' || dc.generated_name
      FROM declared dc
     WHERE NOT EXISTS (SELECT 1 FROM dupes dp
                        WHERE dp.core_movement_id = dc.core_id::uuid
                          AND dp.generated_name = dc.generated_name AND dp.n = dc.n)
  ) d;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: within-core generated-name duplicates diverge from the declared set: %', v_observed;
  END IF;
END $$;
""")

outlier_sql = ',\n    '.join('(%s)' % q(i) for i in outlier_ids)
w(f"""-- 15f) every coreless row is one of the 52 explicit outliers (and no outlier
--      kept a legacy parent), tiers land exactly 48/144/38/5
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  WITH outliers(id) AS (VALUES
    {outlier_sql}
  )
  SELECT string_agg(d.msg, '; ' ORDER BY d.msg) INTO v_observed FROM (
    SELECT e.name || ' coreless but not a declared outlier' AS msg
      FROM public.exercises e
     WHERE e.core_movement_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM outliers o WHERE o.id::uuid = e.id)
    UNION ALL
    SELECT e.name || ' declared outlier but has a core'
      FROM public.exercises e JOIN outliers o ON o.id::uuid = e.id
     WHERE e.core_movement_id IS NOT NULL
    UNION ALL
    SELECT e.name || ' outlier with parent/tier'
      FROM public.exercises e JOIN outliers o ON o.id::uuid = e.id
     WHERE e.parent_exercise_id IS NOT NULL OR e.tier IS NOT NULL
  ) d;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: outlier set diverges: %', v_observed;
  END IF;

  SELECT string_agg(t.tier_label || '=' || t.n, ', ' ORDER BY t.tier_label) INTO v_observed
    FROM (SELECT COALESCE(tier::TEXT, 'null') AS tier_label, count(*) AS n
            FROM public.exercises GROUP BY tier) t;
  IF v_observed IS DISTINCT FROM '0=48, 1=144, 2=38, 3=5, null=52' THEN
    RAISE EXCEPTION 'catalog pass FAIL: tier distribution % (expected 0=48, 1=144, 2=38, 3=5, null=52)', v_observed;
  END IF;
END $$;

-- 15g) variant guardrails: G2 — every variant label belongs to the labelled
--      row's own core; G3 ceiling — no core carries more than 6 variant-
--      labelled children
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(e.name || ' (label ' || vl.slug || ' scoped to ' || c.name || ')', '; ' ORDER BY e.name)
    INTO v_observed
    FROM public.exercises e
    JOIN public.variant_labels vl ON vl.id = e.variant_label_id
    JOIN public.exercises c ON c.id = vl.core_movement_id
   WHERE vl.core_movement_id IS DISTINCT FROM e.core_movement_id;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: variant labels used outside their core scope (G2): %', v_observed;
  END IF;

  SELECT string_agg(c.name || ' x' || d.n, '; ' ORDER BY c.name) INTO v_observed
    FROM (SELECT e.core_movement_id, count(*) AS n
            FROM public.exercises e
           WHERE e.variant_label_id IS NOT NULL AND NOT e.is_core
           GROUP BY e.core_movement_id
          HAVING count(*) > 6) d
    JOIN public.exercises c ON c.id = d.core_movement_id;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: cores exceeding 6 variant-labelled children (G3): %', v_observed;
  END IF;
END $$;
""")

# brief-mandated generated-name samples, resolved to exercise ids
SAMPLE_GENS = ['Double Crunch', 'Cross-Body Elbow-Reach Crunch',
               'Crush Alternating Dumbbell Press', 'Alternating Dumbbell Grab-Reach-Pull Plank']
sample_lines = []
for sample in SAMPLE_GENS:
    owners = [e for e in rows if e.kind == 'derive' and e.gen == sample]
    if len(owners) != 1:
        sys.exit('sample generated name %r resolves to %d rows' % (sample, len(owners)))
    o = owners[0]
    sep = '    UNION ALL\n' if sample_lines else ''
    sample_lines.append(
        f"{sep}    SELECT {q(o.final_name + ' -> ')} || COALESCE((SELECT generated_name FROM public.exercises WHERE id = {q(o.id)}), 'MISSING')\n"
        f"     WHERE COALESCE((SELECT generated_name FROM public.exercises WHERE id = {q(o.id)}), '') <> {q(sample)}")
sample_checks = '\n'.join(sample_lines)

# expected alias staging + checks
w("""-- 15h) alias table: exactly the blessed set — every merge-loser name, every
--      renamed-away name, the sheet-note wilds, the legacy array aliases and
--      the re-minted generated aliases; the Powerbomb suppression holds
CREATE TEMP TABLE _cp_expected_aliases (
  exercise_id UUID NOT NULL,
  alias TEXT NOT NULL,
  kind TEXT NOT NULL
);""")
w("INSERT INTO _cp_expected_aliases VALUES")
w(',\n'.join(f'  ({q(ex_id)}, {q(alias)}, {q(kind)})'
             for ex_id, alias, kind in sorted(expected_aliases)) + ';')
w(f"""
DO $$
DECLARE
  v_observed TEXT;
  v_count INTEGER;
BEGIN
  SELECT string_agg(d.msg, E'\\n' ORDER BY d.msg) INTO v_observed FROM (
    SELECT 'missing: ' || x.alias || ' (' || x.kind || ') on ' || e.name AS msg
      FROM _cp_expected_aliases x
      JOIN public.exercises e ON e.id = x.exercise_id
     WHERE NOT EXISTS (SELECT 1 FROM public.exercise_aliases a
                        WHERE a.exercise_id = x.exercise_id
                          AND a.alias_normalized = public.normalize_alias(x.alias)
                          AND a.kind = x.kind)
    UNION ALL
    SELECT 'unexpected: ' || a.alias || ' (' || a.kind || ') on ' || COALESCE(e.name, a.exercise_id::TEXT)
      FROM public.exercise_aliases a
      LEFT JOIN public.exercises e ON e.id = a.exercise_id
     WHERE NOT EXISTS (SELECT 1 FROM _cp_expected_aliases x
                        WHERE x.exercise_id = a.exercise_id
                          AND public.normalize_alias(x.alias) = a.alias_normalized
                          AND x.kind = a.kind)
  ) d;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: alias table diverges from the blessed set:\\n%', v_observed;
  END IF;

  SELECT count(*) INTO v_count FROM public.exercise_aliases;
  IF v_count <> {len(expected_aliases)} THEN
    RAISE EXCEPTION 'catalog pass FAIL: alias count % (expected {len(expected_aliases)})', v_count;
  END IF;

  -- every merge-loser display name resolves via the alias table to its winner
  SELECT string_agg(m.loser_name, ', ' ORDER BY m.loser_name) INTO v_observed
    FROM _cp_merges m
   WHERE NOT EXISTS (SELECT 1 FROM public.exercise_aliases a
                      WHERE a.exercise_id = m.winner_id
                        AND a.alias_normalized = public.normalize_alias(m.loser_name)
                        AND a.kind = 'wild');
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: merge-loser names missing from the alias table: %', v_observed;
  END IF;

  -- documented Powerbomb suppression: the string aliases Overhead Extension ONLY,
  -- and the renamed Powerbomb row minted no generated alias
  SELECT count(*) INTO v_count FROM public.exercise_aliases
   WHERE alias_normalized = public.normalize_alias('Overhead Dumbbell Triceps Extension');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'catalog pass FAIL: ''Overhead Dumbbell Triceps Extension'' has % alias rows (expected exactly 1)', v_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exercise_aliases
                  WHERE exercise_id = {q(overhead_ext.id)}          -- Overhead Extension
                    AND alias_normalized = public.normalize_alias('Overhead Dumbbell Triceps Extension')
                    AND kind = 'generated') THEN
    RAISE EXCEPTION 'catalog pass FAIL: ''Overhead Dumbbell Triceps Extension'' does not alias Overhead Extension';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exercise_aliases
              WHERE exercise_id = {q(powerbomb.id)}                 -- Single-Arm Overhead Triceps Extension
                AND kind = 'generated') THEN
    SELECT string_agg(alias, ', ') INTO v_observed FROM public.exercise_aliases
     WHERE exercise_id = {q(powerbomb.id)} AND kind = 'generated';
    RAISE EXCEPTION 'catalog pass FAIL: Powerbomb row minted generated aliases despite the documented suppression: %', v_observed;
  END IF;
END $$;

-- 15i) dictionary + retirement spot checks and the brief-mandated name samples
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.stances WHERE name = 'Supine / Prone') THEN
    RAISE EXCEPTION 'catalog pass FAIL: legacy Supine / Prone stance still present (id=%)',
      (SELECT id FROM public.stances WHERE name = 'Supine / Prone');
  END IF;

  SELECT string_agg(bad.v, '; ') INTO v_observed FROM (
    SELECT 'directions=' || count(*)::TEXT AS v FROM public.directions HAVING count(*) <> {len(DIRECTIONS)}
    UNION ALL SELECT 'support_positions=' || count(*) FROM public.support_positions HAVING count(*) <> {len(SUPPORTS)}
    UNION ALL SELECT 'arm_positions=' || count(*) FROM public.arm_positions HAVING count(*) <> {len(ARM_POSITIONS)}
    UNION ALL SELECT 'bench_angles=' || count(*) FROM public.bench_angles HAVING count(*) <> {len(BENCH_ANGLES)}
    UNION ALL SELECT 'variant_labels=' || count(*) FROM public.variant_labels HAVING count(*) <> {len(VARIANT_SEEDS)}
  ) bad(v);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: dictionary seed counts off: %', v_observed;
  END IF;

  SELECT string_agg(bad.v, E'\\n') INTO v_observed FROM (
{sample_checks}
  ) bad(v);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: sampled generated names diverge:\\n%', v_observed;
  END IF;
END $$;

DROP TABLE _cp_rows;
DROP TABLE _cp_merges;
DROP TABLE _cp_merge_wilds;
DROP TABLE _cp_expected_aliases;""")

content = '\n'.join(out) + '\n'
with open(OUT, 'w') as f:
    f.write(content)
print('validated: 287 rows (48 cores / 187 derives / 52 outliers), 25 merges,')
print('           %d expected aliases, %d declared generated-name collisions' %
      (len(expected_aliases), len(declared_pairs)))
print('wrote %s (%d lines)' % (os.path.relpath(OUT, REPO), content.count('\n')))
