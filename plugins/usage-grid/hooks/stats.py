"""Totals Claude Code token usage per local day from ~/.claude/projects/**/*.jsonl. Prints JSON."""
import collections, datetime, glob, json, os
import re, sys

if len(sys.argv) == 3 and sys.argv[1] == 'title':
    # The chat's name: the newest custom title, else the newest AI title.
    sid = sys.argv[2]
    if not re.fullmatch(r'[0-9a-fA-F-]{8,64}', sid):
        print(json.dumps({'title': None})); sys.exit(0)
    custom = ai = None
    for f in glob.glob(os.path.expanduser('~/.claude/projects/*/' + sid + '.jsonl')):
        with open(f, errors='ignore') as fh:
            for line in fh:
                if '"custom-title"' in line or '"ai-title"' in line:
                    try:
                        o = json.loads(line)
                    except ValueError:
                        continue
                    custom = o.get('customTitle') or custom
                    ai = o.get('aiTitle') or ai
    print(json.dumps({'title': custom or ai})); sys.exit(0)

STOP = set("""the and for with this that from your you are was were will have has into about what when where which while then than them they their there here also just only more most some such very can not but all any our out use used using make made like file files folder code project projects readme claude docs plan status todo note notes test tests src true false none null http https www com html json yaml main index page pages build run runs step steps each other over under after before should would could must need needs""".split())

def keywords(path, name):
    """Words that say what a project is about: its name (weighted) and its README/CLAUDE/PLAN text."""
    words = collections.Counter()
    for fn in ('README.md', 'CLAUDE.md', 'AGENTS.md', 'docs/PLAN.md', 'HANDOFF.md', 'package.json'):
        fp = os.path.join(path, fn)
        try:
            with open(fp, errors='ignore') as fh:
                text = fh.read(6000).lower()
        except OSError:
            continue
        for w in re.findall(r'[a-z][a-z0-9]{2,}', text):
            if w not in STOP:
                words[w] += 1
    name_words = [w for w in re.findall(r'[a-z0-9]+', name.lower()) if len(w) >= 3]
    return name_words, [w for w, _ in words.most_common(60)]

root = os.path.expanduser('~/.claude/projects')
days = collections.defaultdict(lambda: {'in': 0, 'out': 0, 'cr': 0, 'cw': 0, 's': set()})
models = collections.Counter()
seen = set()
envs = {}
for f in glob.glob(root + '/**/*.jsonl', recursive=True):
    try:
        fh = open(f, errors='ignore')
    except OSError:
        continue
    with fh:
        for line in fh:
            if '"cwd"' in line and '"timestamp"' in line:
                try:
                    o0 = json.loads(line)
                    c, ts0 = o0.get('cwd'), o0.get('timestamp')
                    if isinstance(c, str) and isinstance(ts0, str) and ts0 > envs.get(c, ''):
                        envs[c] = ts0
                except ValueError:
                    pass
            if '"usage"' not in line:
                continue
            try:
                o = json.loads(line)
            except ValueError:
                continue
            m = o.get('message')
            if not isinstance(m, dict) or not isinstance(m.get('usage'), dict):
                continue
            k = (m.get('id'), o.get('requestId'))
            if k[0] and k in seen:
                continue
            seen.add(k)
            ts = o.get('timestamp')
            if not ts:
                continue
            try:
                day = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00')).astimezone().date().isoformat()
            except ValueError:
                continue
            u = m['usage']
            d = days[day]
            d['in'] += u.get('input_tokens') or 0
            d['out'] += u.get('output_tokens') or 0
            d['cr'] += u.get('cache_read_input_tokens') or 0
            d['cw'] += u.get('cache_creation_input_tokens') or 0
            d['s'].add(f)
            mod = m.get('model')
            if mod and not mod.startswith('<'):
                models[mod] += u.get('output_tokens') or 0

# A folder counts once: a subfolder a session moved into belongs to its project.
cands = {c for c in envs if os.path.isdir(c) and 'scratch-workspaces' not in c and '/.' not in c and not c.startswith(('/tmp', '/private/'))}
home = os.path.expanduser('~')
general = {home} | {os.path.join(home, n) for n in ('Documents', 'Desktop', 'Downloads', 'Library')}
# General places (home, Documents...) stay as their own entry but never swallow a project inside them.
parents = {k for k in cands if k not in general}
roots = {c for c in cands if not any(c.startswith(k.rstrip('/') + '/') for k in parents if k != c)}
for c in list(envs):
    for k in roots - general:
        if c.startswith(k.rstrip('/') + '/') and envs[c] > envs[k]:
            envs[k] = envs[c]

# Projects first (a README, git, CLAUDE.md...), newest first; then home and Documents.
# Places that are not environments (Downloads, Pictures, Desktop, Library...) are left out.
NOT_ENVS = tuple(os.path.join(home, n) for n in ('Downloads', 'Pictures', 'Desktop', 'Library', 'Movies', 'Music', 'Public', 'Applications'))
MARKERS = ('.git', 'README.md', 'CLAUDE.md', 'AGENTS.md', 'package.json', 'pyproject.toml', 'docs')
def is_project(c):
    return any(os.path.exists(os.path.join(c, mk)) for mk in MARKERS)
usable = [(c, ts) for c, ts in envs.items() if c in roots and not any(c == n or c.startswith(n + '/') for n in NOT_ENVS)]
ranked = sorted([x for x in usable if x[0] not in general and is_project(x[0])], key=lambda kv: kv[1], reverse=True)
ranked += sorted([x for x in usable if x[0] not in general and not is_project(x[0])], key=lambda kv: kv[1], reverse=True)
ranked += sorted([x for x in usable if x[0] in general], key=lambda kv: kv[1], reverse=True)

out = {
    'today': datetime.date.today().isoformat(),
    'days': {k: {'in': v['in'], 'out': v['out'], 'cr': v['cr'], 'cw': v['cw'], 'sessions': len(v['s'])}
             for k, v in sorted(days.items())},
    'models': models.most_common(6),
    # Recent project folders, newest first; app-made scratch folders and temp folders left out.
    'envs': [dict(zip(('path', 'last', 'name', 'words'), (c, ts, *keywords(c, os.path.basename(c.rstrip('/')) or c))))
             for c, ts in ranked][:6],
}
text = json.dumps(out)
# Last result, so a new chat's dashboard shows at once while a fresh scan runs.
try:
    cache_dir = os.path.expanduser('~/.claude/usage-grid')
    os.makedirs(cache_dir, exist_ok=True)
    tmp = os.path.join(cache_dir, 'stats.json.tmp')
    with open(tmp, 'w') as fh:
        fh.write(text)
    os.replace(tmp, os.path.join(cache_dir, 'stats.json'))
except OSError:
    pass
print(text)
