'use strict';
/* ================= Programs ================= */
const GROUPS = {
  chest: 'Chest', back: 'Back', press: 'Overhead press', sdelt: 'Side delts', rdelt: 'Rear delts', trap: 'Traps',
  tri: 'Triceps', bi: 'Biceps', quad: 'Quads', ham: 'Hamstrings', glute: 'Glutes', calf: 'Calves', add: 'Adductors', abd: 'Abductors', abs: 'Abs',
  jump: 'Jumps and landings', throw: 'Med-ball throws', lower: 'Leg strength', upper: 'Upper-body strength', armor: 'Shoulders, ankles, core', other: 'Other',
};
const PRIORITY = ['chest', 'back', 'sdelt', 'rdelt', 'tri', 'bi', 'quad', 'ham', 'glute', 'calf', 'abs'];

// X(id, group, sets, low reps, high reps, kind, names, extra). kind 'c' = long rest, 'i' = short rest. names: one per rotation.
const X = (id, g, sets, lo, hi, k, names, o) => Object.assign({ id, g, sets, lo, hi, k, names: typeof names === 'string' ? [names, names, names] : names }, o);
// Youth drill types: no load progression on landings, jumps, throws and holds.
const LAND = cue => ({ t: 'land', nw: 1, rest: 45, cue }), JUMP = cue => ({ t: 'jump', nw: 1, rest: 60, cue }), THROW = cue => ({ t: 'throw', rest: 60, cue });
const STR = (cue, o) => Object.assign({ t: 'str', rest: 90, cue }, o), HOLD = (cue, o) => Object.assign({ t: 'hold', nw: 1, unit: 'sec', rest: 45, cue }, o);

const EFFORT = {
  last: 'Leave one rep on the early sets. Take the last set of each exercise to failure, then add partials where marked.',
  all: 'Every set to failure, then partials where marked. Romanian deadlifts stay 1 or 2 reps short.',
};
const YOUTH_RULES = [
  '<b>An adult watches every session.</b> Technique comes first, and the weight only goes up when every rep looks the same.',
  '<b>Jumps and throws at full effort,</b> with full rest. Stop the set when height or speed drops.',
  '<b>Land quietly.</b> Knees track over the toes and every landing holds for 2 seconds.',
  '<b>Strength sets end with 2 or 3 good reps left.</b> Nothing goes to failure and there are no max lifts.',
  '<b>Twice a week,</b> never the day before a tournament.',
  '<b>Sore knees, shins or heels when jumping:</b> skip the jumps that day and tell a parent or coach.',
  '<b>Easy week:</b> half the sets, then re-test.',
];

const PROGRAMS = {
  build: {
    name: 'Muscle year', line: 'Three-day split, six days a week. The 52-week size plan.', perWeek: 6, freq: 2, measure: 'body', effortSetting: 1,
    days: { A: ['Chest + arms', 'Chest, arms'], B: ['Back + shoulders', 'Back, delts'], C: ['Legs + abs', 'Legs, abs'] },
    effort: () => EFFORT[S.meta.effort],
    deload: 'Deload week: half the sets, same loads, stop 3 or 4 reps short. No failure, drops or partials.',
    rules: () => [
      '<b>Log every working set.</b> Warm-ups do not count, and partials go in their own row. ' + (S.meta.effort === 'all' ? 'When the first set reaches the top of the rep range and the rest stay inside it, add weight next time.' : 'When every set reaches the top of the rep range, add weight next time.'),
      '<b>' + (S.meta.effort === 'all' ? 'Every set to failure.' : 'Leave one rep on the early sets, then take the last set to failure.') + '</b> Add partials in the stretched half where marked. No partials on free presses, dips, squats or split squats. Romanian deadlifts always stop 1 or 2 short.',
      '<b>Lower for 2 to 3 seconds</b> into a full stretch.',
      '<b>Rest 2 to 3 minutes</b> on presses, pulls, squats and hinges, and 60 to 90 seconds on the rest.',
      '<b>Deload week:</b> same lifts and loads, half the sets, 3 or 4 reps short. No failure, drops or partials.',
      '<b>Day 7:</b> core class or Zone 2, no lifting.',
    ],
    slots: {
      A: [
        X('A1', 'chest', 3, 6, 10, 'c', ['Flat DB press', 'Barbell bench press', 'Machine chest press'], { cue: 'No drops or partials.' }),
        X('A2', 'chest', 3, 8, 12, 'c', ['Incline DB press, 30°', 'Incline Smith press', 'Incline DB press, 45°'], { cue: 'No partials.' }),
        X('A3', 'chest', 2, 10, 15, 'i', ['Incline cable fly', 'Pec deck', 'Seated cable fly'], { drop: 1, pp: 1 }),
        X('A4', 'chest', 2, 8, 12, 'c', 'Weighted dips', { drop: 1, bw: 1, cue: 'Last set: strip the weight and keep going. No partials.' }),
        X('A5', 'tri', 3, 10, 15, 'i', ['Overhead cable triceps extension', 'EZ-bar lying extension, behind the head', 'Single-arm overhead cable extension'], { pp: 1 }),
        X('A6', 'tri', 2, 10, 15, 'i', ['Rope pushdown', 'Straight-bar pushdown', 'Cross-body cable extension'], { drop: 1, pp: 1 }),
        X('A7', 'bi', 3, 8, 12, 'i', ['Incline DB curl', 'Bayesian cable curl', 'Preacher curl'], { pp: 1 }),
        X('A8', 'bi', 2, 10, 15, 'i', ['Cross-body hammer curl', 'Rope hammer curl', 'Reverse EZ-bar curl'], { pp: 1 }),
        X('A9', 'sdelt', 3, 12, 20, 'i', ['DB lateral raise', 'Cable lateral raise', 'Machine lateral raise'], { pp: 1 }),
      ],
      B: [
        X('B1', 'back', 3, 6, 10, 'c', ['Weighted pull-up', 'Weighted neutral-grip pull-up', 'Weighted chin-up'], { drop: 1, bw: 1, pp: 1, cue: 'Last set: drop the weight and finish at bodyweight.' }),
        X('B2', 'back', 3, 8, 12, 'c', ['Seated cable row', 'Chest-supported row', 'Single-arm DB row'], { pp: 1 }),
        X('B3', 'back', 2, 10, 12, 'c', ['Wide-grip lat pulldown', 'Neutral-grip lat pulldown', 'Single-arm cable pulldown'], { pp: 1 }),
        X('B4', 'back', 2, 12, 15, 'i', ['Straight-arm pulldown', 'Cable pullover', 'Straight-arm pulldown'], { pp: 1 }),
        X('B5', 'press', 3, 6, 10, 'c', ['Standing military press', 'Seated DB shoulder press', 'Machine shoulder press'], { cue: 'No partials.' }),
        X('B6', 'sdelt', 4, 12, 20, 'i', ['DB lateral raise', 'Cable lateral raise', 'Machine lateral raise'], { drop: 1, pp: 1, cue: 'Last set: your drop and 5-second holds.' }),
        X('B7', 'rdelt', 3, 12, 20, 'i', ['Face pull', 'Reverse pec deck', 'Cable rear-delt fly'], { pp: 1 }),
        X('B8', 'trap', 2, 10, 15, 'i', ['DB shrug', 'Barbell shrug', 'DB shrug'], { pp: 1 }),
      ],
      C: [
        X('C1', 'quad', 3, 6, 10, 'c', ['Hack squat', 'Leg press', 'High-bar back squat'], { cue: 'No partials.' }),
        X('C2', 'ham', 3, 8, 12, 'c', ['Romanian deadlift', '45° back extension, weighted', 'DB Romanian deadlift'], { cue: 'Stop 1 or 2 reps short on every set.' }),
        X('C3', 'quad', 2, 8, 12, 'c', ['Bulgarian split squat', 'Walking lunge', 'Reverse lunge'], { per: 'leg', cue: 'No partials.' }),
        X('C4', 'ham', 3, 10, 15, 'i', ['Seated leg curl', 'Lying leg curl', 'Seated leg curl'], { drop: 1, pp: 1 }),
        X('C5', 'quad', 3, 10, 15, 'i', ['Leg extension', 'Single-leg leg extension', 'Leg extension'], { drop: 1, pp: 1 }),
        X('C6', 'calf', 4, 10, 15, 'i', ['Standing calf raise', 'Leg-press calf raise', 'Standing calf raise'], { pp: 1, cue: 'Pause 2 seconds at the bottom.' }),
        X('C7', 'add', 2, 12, 15, 'i', 'Adductor machine', { pp: 1 }),
        X('C10', 'abd', 2, 12, 15, 'i', 'Abductor machine', { pp: 1, cue: 'Back to back with the adductor machine.' }),
        X('C8', 'abs', 3, 10, 15, 'i', ['Cable crunch', 'Machine crunch', 'Cable crunch'], { pp: 1 }),
        X('C9', 'abs', 2, 8, 15, 'i', ['Hanging leg raise', "Captain's chair leg raise", 'Hanging leg raise'], { bw: 1, pp: 1 }),
      ],
    },
  },
  shape: {
    name: 'Shape', line: 'Three full-body days a week for muscle and shape.', perWeek: 3, freq: 1, measure: 'body',
    days: { A: ['Squat + push', 'Squat, push'], B: ['Glutes + pull', 'Glutes, pull'], C: ['Legs + arms', 'Legs, arms'] },
    effort: () => 'Stop each set 1 or 2 reps short of failure. Lower for 2 to 3 seconds into a full stretch.',
    deload: 'Deload week: half the sets, same loads, stop 3 or 4 reps short.',
    rules: () => [
      '<b>Log every working set.</b> Warm-ups do not count. When every set reaches the top of the rep range, add weight next time.',
      '<b>Stop 1 or 2 reps short of failure.</b> The last rep should be slow but clean.',
      '<b>Lower for 2 to 3 seconds</b> into a full stretch.',
      '<b>Rest about 2 minutes</b> on squats, hinges, presses and rows, and about a minute on the rest.',
      '<b>Three sessions is the floor.</b> A fourth or fifth day just continues the rotation and adds weekly volume.',
      '<b>Deload week:</b> same lifts and loads, half the sets.',
    ],
    slots: {
      A: [
        X('A1', 'quad', 3, 8, 12, 'c', ['Leg press', 'Goblet squat', 'Hack squat']),
        X('A2', 'ham', 3, 8, 12, 'c', ['DB Romanian deadlift', 'Barbell Romanian deadlift', 'DB Romanian deadlift'], { cue: 'Flat back, weights close to the legs.' }),
        X('A3', 'chest', 3, 8, 12, 'c', ['DB bench press', 'Machine chest press', 'Incline DB press']),
        X('A4', 'back', 3, 8, 12, 'c', ['Lat pulldown', 'Assisted pull-up', 'Neutral-grip lat pulldown']),
        X('A5', 'sdelt', 3, 12, 20, 'i', ['DB lateral raise', 'Cable lateral raise', 'Machine lateral raise']),
        X('A6', 'abs', 2, 10, 15, 'i', ['Cable crunch', 'Machine crunch', 'Cable crunch']),
      ],
      B: [
        X('B1', 'glute', 3, 8, 12, 'c', ['Hip thrust', 'Machine hip thrust', 'Barbell glute bridge'], { cue: 'Pause 1 second at the top.' }),
        X('B2', 'quad', 2, 8, 12, 'c', ['Bulgarian split squat', 'Reverse lunge', 'Walking lunge'], { per: 'leg' }),
        X('B3', 'back', 3, 8, 12, 'c', ['Seated cable row', 'Chest-supported row', 'Single-arm DB row']),
        X('B4', 'press', 3, 8, 12, 'c', ['Seated DB shoulder press', 'Machine shoulder press', 'Seated DB shoulder press']),
        X('B5', 'ham', 3, 10, 15, 'i', ['Seated leg curl', 'Lying leg curl', 'Seated leg curl']),
        X('B6', 'rdelt', 2, 12, 20, 'i', ['Face pull', 'Reverse pec deck', 'Cable rear-delt fly']),
      ],
      C: [
        X('C1', 'quad', 3, 8, 12, 'c', ['Hack squat', 'Leg press', 'Smith squat']),
        X('C2', 'glute', 3, 10, 15, 'c', ['45° back extension', 'Cable pull-through', '45° back extension'], { cue: 'Squeeze the glutes at the top without arching the low back.' }),
        X('C3', 'chest', 2, 8, 12, 'c', ['Incline DB press', 'Incline machine press', 'DB bench press']),
        X('C4', 'back', 2, 8, 12, 'c', ['Single-arm DB row', 'Seated cable row', 'Chest-supported row']),
        X('C5', 'abd', 2, 12, 20, 'i', 'Abductor machine'),
        X('C6', 'tri', 2, 10, 15, 'i', ['Rope pushdown', 'Overhead cable triceps extension', 'Rope pushdown']),
        X('C7', 'bi', 2, 10, 15, 'i', ['DB curl', 'Cable curl', 'Incline DB curl']),
      ],
    },
  },
  vb2: {
    name: 'Volleyball power', line: 'Ages 13 and up. Jumps, throws and light strength, twice a week.', perWeek: 2, freq: 1, measure: 'tests', youth: 1,
    days: { A: ['Jump + slam', 'Jump, slam'], B: ['Bound + rotate', 'Bound, rotate'] },
    effort: () => 'Fast, crisp reps. Stop every set with 2 or 3 good ones left. Nothing goes to failure.',
    deload: 'Easy week: half the sets, same weights. This is also re-test week.',
    rules: () => YOUTH_RULES,
    slots: {
      A: [
        X('A1', 'jump', 2, 5, 5, 'i', ['Snap-down, stick the landing', 'Drop landing from a low box', 'Snap-down to a single-leg stick'], LAND('Land quietly, knees over toes, hold 2 seconds.')),
        X('A2', 'jump', 3, 4, 4, 'i', ['Countermovement jump', 'Box jump, step down', 'Approach jump, stick the landing'], JUMP('Jump as high as you can and reset between reps.')),
        X('A3', 'throw', 3, 6, 6, 'i', ['Med-ball overhead slam', 'Med-ball overhead throw to a wall', 'Med-ball slam, step into it'], THROW('Light ball, full speed. Reach tall, then throw through the floor.')),
        X('A4', 'throw', 3, 5, 5, 'i', ['Med-ball side throw to a wall', 'Med-ball side throw, step behind', 'Med-ball side throw, half kneeling'], Object.assign(THROW('Hips turn first, arms last.'), { per: 'side' })),
        X('A5', 'lower', 3, 8, 10, 'c', ['Goblet squat', 'DB front squat', 'Goblet squat, 3-second lower'], STR('Chest up, knees track over the toes.')),
        X('A6', 'upper', 3, 8, 10, 'c', ['Seated cable row', 'One-arm DB row, each arm', 'Lat pulldown'], STR('Pull the elbows back, shoulders stay down.')),
        X('A7', 'upper', 2, 6, 12, 'i', ['Push-up', 'Push-up, feet elevated', 'Push-up, 3-second lower'], STR('Straight line from head to heels.', { bw: 1, rest: 75 })),
        X('A8', 'armor', 2, 12, 15, 'i', ['Band external rotation, each arm', 'Side-lying DB external rotation, each arm', 'Band external rotation, elbow at shoulder height'], STR('Slow and smooth. This looks after the hitting shoulder.', { rest: 45 })),
        X('A9', 'armor', 2, 30, 30, 'i', ['Single-leg balance, eyes closed', 'Single-leg balance with a ball toss', 'Single-leg reach to a cone'], HOLD('Knee soft, hips level.', { per: 'leg' })),
        X('A10', 'armor', 2, 20, 30, 'i', ['Side plank', 'Dead bug', 'Pallof press hold'], HOLD('Ribs down, no sagging.', { per: 'side' })),
      ],
      B: [
        X('B1', 'jump', 2, 4, 4, 'i', ['Skater hop, stick the landing', 'Hop over a line, stick the landing', 'Skater hop, hold 3 seconds'], Object.assign(LAND('Land on one leg, knee over toes, no wobble.'), { per: 'side' })),
        X('B2', 'jump', 2, 10, 10, 'i', ['Pogo hops', 'Line hops, side to side', 'Pogo hops'], JUMP('Quick off the floor, stiff ankles.')),
        X('B3', 'jump', 3, 3, 3, 'i', ['Broad jump, stick the landing', 'Broad jump', 'Broad jump, stick the landing'], JUMP('Swing the arms and land soft.')),
        X('B4', 'throw', 3, 5, 5, 'i', ['Med-ball scoop toss', 'Med-ball backward overhead toss', 'Med-ball scoop toss'], THROW('Dip and drive from the legs. Throw for height.')),
        X('B5', 'throw', 3, 6, 6, 'i', ['Med-ball chest pass to a wall', 'Med-ball overhead throw, split stance', 'Med-ball chest pass, step into it'], THROW('Snap it off the chest as fast as you can.')),
        X('B6', 'lower', 3, 8, 10, 'c', ['DB Romanian deadlift', 'Kettlebell deadlift', 'DB Romanian deadlift'], STR('Hips back, flat back, weights close to the legs.')),
        X('B7', 'lower', 2, 8, 8, 'c', ['Split squat', 'Reverse lunge', 'Lateral lunge'], STR('Front knee tracks over the toes.', { bw: 1, per: 'leg' })),
        X('B8', 'upper', 2, 8, 10, 'i', ['Half-kneeling one-arm DB press, each arm', 'Landmine press, each arm', 'Half-kneeling one-arm DB press, each arm'], STR('Ribs down, press straight up.', { rest: 75 })),
        X('B9', 'armor', 2, 12, 15, 'i', ['Band pull-apart', 'Face pull', 'Band pull-apart'], STR('Squeeze the shoulder blades together.', { rest: 45 })),
        X('B10', 'armor', 2, 10, 12, 'i', ['Single-leg calf raise', 'Single-leg calf raise, 3-second lower', 'Single-leg calf raise'], STR('All the way up, slow down.', { bw: 1, per: 'leg', rest: 45 })),
      ],
    },
  },
  vb1: {
    name: 'Volleyball foundations', line: 'Ages 9 to 12. Landings, throws and bodyweight strength, twice a week.', perWeek: 2, freq: 1, measure: 'tests', youth: 1,
    days: { A: ['Jump + slam', 'Jump, slam'], B: ['Hop + throw', 'Hop, throw'] },
    effort: () => 'Fast, crisp and fun. Stop while every rep still looks good.',
    deload: 'Easy week: half the sets. This is also re-test week.',
    rules: () => YOUTH_RULES,
    slots: {
      A: [
        X('A1', 'jump', 2, 5, 5, 'i', ['Snap-down, stick the landing', 'Step off a low box, stick the landing', 'Snap-down, stick the landing'], LAND('Land quietly, knees over toes, hold 2 seconds.')),
        X('A2', 'jump', 3, 3, 3, 'i', ['Jump and stick', 'Jump and reach', 'Jump and stick'], JUMP('Jump high, land soft.')),
        X('A3', 'throw', 3, 5, 5, 'i', ['Med-ball slam', 'Med-ball overhead throw to a wall', 'Med-ball slam'], THROW('Light ball. Reach tall, throw hard.')),
        X('A4', 'throw', 3, 6, 6, 'i', ['Med-ball chest pass', 'Med-ball chest pass, step into it', 'Med-ball chest pass'], THROW('Push it fast off the chest.')),
        X('A5', 'lower', 2, 8, 10, 'i', ['Squat to a box', 'Goblet squat with a light weight', 'Squat to a box'], STR('Chest up, knees over toes.', { bw: 1, rest: 60 })),
        X('A6', 'upper', 2, 5, 10, 'i', ['Push-up, hands on a bench', 'Push-up', 'Push-up, hands on a bench'], STR('Straight line from head to heels.', { bw: 1, rest: 60 })),
        X('A7', 'upper', 2, 10, 12, 'i', ['Band row', 'One-arm DB row with a light weight', 'Band row'], STR('Pull the elbows back.', { rest: 60 })),
        X('A8', 'armor', 2, 20, 20, 'i', ['Single-leg balance', 'Single-leg balance, eyes closed', 'Single-leg balance with a ball toss'], HOLD('Stand tall, knee soft.', { per: 'leg' })),
      ],
      B: [
        X('B1', 'jump', 2, 4, 4, 'i', ['Skater hop, stick the landing', 'Hop over a line, stick the landing', 'Skater hop, stick the landing'], Object.assign(LAND('Land on one leg and freeze.'), { per: 'side' })),
        X('B2', 'jump', 2, 10, 10, 'i', ['Pogo hops', 'Line hops, side to side', 'Pogo hops'], JUMP('Quick, bouncy feet.')),
        X('B3', 'throw', 3, 5, 5, 'i', ['Med-ball side throw to a wall', 'Med-ball side toss to a partner', 'Med-ball side throw to a wall'], Object.assign(THROW('Turn the hips, then throw.'), { per: 'side' })),
        X('B4', 'throw', 3, 5, 5, 'i', ['Med-ball scoop toss', 'Med-ball backward overhead toss', 'Med-ball scoop toss'], THROW('Dip, then throw it as high as you can.')),
        X('B5', 'lower', 2, 8, 10, 'i', ['Kettlebell deadlift', 'Glute bridge', 'Kettlebell deadlift'], STR('Hips back, flat back.', { rest: 60 })),
        X('B6', 'lower', 2, 6, 8, 'i', ['Split squat', 'Step-up', 'Split squat'], STR('Front knee over the toes.', { bw: 1, per: 'leg', rest: 60 })),
        X('B7', 'armor', 2, 20, 20, 'i', ['Bear crawl', 'Crab walk', 'Bear crawl'], HOLD('Hips low, small steps.')),
        X('B8', 'armor', 2, 15, 20, 'i', ['Side plank', 'Dead bug', 'Side plank'], HOLD('Ribs down, no sagging.', { per: 'side' })),
      ],
    },
  },
};
const MEASURES = {
  body: {
    tab: 'Body', title: 'Body composition', lede: 'Scan at baseline, then every deload week.', word: 'scan', first: 'Baseline scan', none: 'No baseline scan yet.',
    why: 'Record one before your first workout so the year has a starting point.', due: 'Deload weeks are when you re-measure. Same machine, morning, before training.',
    fields: [['weight', 'Body weight', 'lb', 0], ['muscle', 'Muscle mass', 'lb', 1], ['fat', 'Body fat', '%', -1], ['waist', 'Waist', 'in'], ['chest', 'Chest', 'in'], ['arm', 'Upper arm', 'in'], ['thigh', 'Thigh', 'in']],
    tiles: ['muscle', 'fat', 'weight', 'lean'], charts: ['muscle', 'fat', 'weight'], need: ['weight', 'muscle', 'fat'],
    hint: 'Tape numbers are optional. Enter the muscle number your machine prints and use that same number every time.',
    how: ['Same machine every time.', 'Morning, before training and before eating.', 'Normal water the day before, no alcohol the night before.', 'Read the trend across three or more scans. One reading can swing a pound or two on water alone.'],
  },
  tests: {
    tab: 'Tests', title: 'Jump and throw tests', lede: 'Test at the start, then every easy week.', word: 'test day', first: 'First test day', none: 'No test day yet.',
    why: 'Record one before the first workout so there is a starting point to beat.', due: 'Easy weeks are when you re-test. Fresh legs, same ball, same wall.',
    fields: [['vert', 'Standing vertical', 'in', 1], ['approach', 'Approach jump', 'in', 1], ['broad', 'Broad jump', 'in', 1], ['toss', 'Overhead throw', 'ft', 1]],
    tiles: ['vert', 'approach', 'broad', 'toss'], charts: ['vert', 'approach', 'broad', 'toss'], need: ['vert', 'approach', 'broad', 'toss'],
    hint: 'Three tries each. Log the best one.',
    how: ['Test fresh, not after practice or a tournament.', 'Same ball, same wall, same shoes every time.', 'Jumps: highest touch minus standing reach, in inches.', 'Throw: two hands, overhead, feet planted. Measure to where the ball lands.'],
  },
};
const BLOCK_WEEKS = [7, 7, 7, 7, 8, 8, 8]; // 52 weeks; the last week of each block is the deload
const YEAR_WEEKS = 52;
