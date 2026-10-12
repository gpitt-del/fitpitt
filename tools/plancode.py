#!/usr/bin/env python3
"""FitPitt plan codes: check a plan written as JSON, then turn it into a code and a link.

    python3 plancode.py plan.json          check the plan, print the code and the link
    python3 plancode.py --read FP1.xxxx    turn a code (or a link) back into JSON

The checks mirror the app's own (n.js), so a plan that passes here loads on the phone.
A code is "FP1." + base64url (no padding) of the plan's JSON, raw-deflated (zlib wbits -15).
"""
import base64, json, re, sys, zlib

SITE = 'https://gpitt-del.github.io/fitpitt/'
GROUPS = ['chest', 'back', 'press', 'sdelt', 'rdelt', 'trap', 'tri', 'bi', 'quad', 'ham', 'glute', 'calf', 'add', 'abd', 'abs', 'other']


def isint(v):
    return isinstance(v, int) and not isinstance(v, bool)


def check(p):
    """Returns (errors, notes). Errors stop the plan loading; notes are fixes the app makes on its own."""
    errs, notes = [], []
    if not isinstance(p, dict):
        return ['This is not a FitPitt plan.'], notes
    if p.get('fitpitt') != 1:
        errs.append('It needs "fitpitt": 1.')
    if not str(p.get('name') or '').strip():
        errs.append('The plan needs a name.')
    for k, n in (('name', 40), ('for', 40), ('goal', 120), ('line', 140), ('effort', 300), ('deload', 300)):
        if len(str(p.get(k) or '')) > n:
            notes.append('%s is longer than %d characters and gets cut.' % (k, n))
    if p.get('made') and not re.match(r'^\d{4}-\d{2}-\d{2}$', str(p['made'])):
        notes.append('"made" should be YYYY-MM-DD. It is left off.')
    days = p.get('days') if isinstance(p.get('days'), list) else []
    if not days:
        errs.append('The plan needs at least one day of exercises.')
    if len(days) > 6:
        errs.append('Six days at most in the rotation.')
    pw = p.get('perWeek', len(days))
    if not (isint(pw) and 1 <= pw <= 7):
        errs.append('perWeek must be a whole number from 1 to 7.')
    if p.get('measure') not in (None, 'body', 'tests'):
        notes.append('measure can be "body" or "tests". Body scans are used.')
    rules = p.get('rules') or []
    if not isinstance(rules, list) or len(rules) > 8:
        notes.append('rules is a list of up to 8 strings. Extra ones are dropped.')
    for di, d in enumerate(days[:6]):
        at = 'Day %d' % (di + 1)
        if not isinstance(d, dict):
            errs.append(at + ' is not written as a day.'); continue
        ex = d.get('ex') if isinstance(d.get('ex'), list) else []
        if not ex:
            errs.append(at + ' has no exercises.')
        if len(ex) > 14:
            errs.append(at + ' has more than 14 exercises.')
        if isinstance(d.get('warmup'), list) and len(d['warmup']) > 6:
            notes.append(at + ': only the first 6 warm-up lines are kept.')
        for ei, e in enumerate(ex[:14]):
            label = '%s, exercise %d' % (at, ei + 1)
            if not isinstance(e, dict):
                errs.append(label + ' is not written as an exercise.'); continue
            names = e.get('name') if isinstance(e.get('name'), list) else [e.get('name')]
            names = [str(n).strip() for n in names if str(n or '').strip()]
            if not names:
                errs.append(label + ' needs a name.')
            else:
                label += ' (%s)' % names[0]
                if len(names) > 3:
                    notes.append(label + ': only the first 3 names are used.')
                if any(len(n) > 60 for n in names):
                    notes.append(label + ': a name is over 60 characters and gets cut.')
            if e.get('g') not in GROUPS:
                notes.append(label + ': muscle group %r is not known, so it counts as Other.' % e.get('g'))
            s = e.get('sets')
            if not (isint(s) and 1 <= s <= 8):
                errs.append(label + ': sets must be a whole number from 1 to 8.')
            r = e.get('reps')
            lo, hi = (r[0], r[1] if len(r) > 1 else r[0]) if isinstance(r, list) and r else (r, r)
            top = 600 if e.get('hold') else 100
            if not (isint(lo) and isint(hi) and 1 <= lo <= hi <= top):
                errs.append(label + ': reps must be a number or [low, high], low at most high, up to %d.' % top)
            rest = e.get('rest')
            if rest is not None and rest not in ('long', 'short') and not (isint(rest) and 10 <= rest <= 600):
                notes.append(label + ': rest should be "long", "short" or seconds from 10 to 600. The default is used.')
            if e.get('per') not in (None, '', 'leg', 'side', 'arm'):
                notes.append(label + ': per can be leg, side or arm. It is left off.')
            if len(str(e.get('cue') or '')) > 160:
                notes.append(label + ': the cue is over 160 characters and gets cut.')
    return errs, notes


def encode(p):
    raw = json.dumps(p, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    return 'FP1.' + base64.urlsafe_b64encode(c.compress(raw) + c.flush()).decode().rstrip('=')


def decode(text):
    m = re.search(r'FP1\.([A-Za-z0-9_-]+)', re.sub(r'\s+', '', text))
    if not m:
        raise SystemExit('No FP1 code found.')
    b = m.group(1) + '=' * (-len(m.group(1)) % 4)
    return json.loads(zlib.decompress(base64.urlsafe_b64decode(b), -15))


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--read':
        print(json.dumps(decode(sys.argv[2]), indent=1, ensure_ascii=False)); sys.exit(0)
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    plan = json.load(open(sys.argv[1], encoding='utf-8'))
    errs, notes = check(plan)
    for n in notes:
        print('note:', n)
    if errs:
        for e in errs:
            print('ERROR:', e)
        sys.exit(1)
    code = encode(plan)
    assert decode(code) == plan
    print('\nCode (%d characters):\n%s\n\nLink:\n%s#plan=%s' % (len(code), code, SITE, code))
