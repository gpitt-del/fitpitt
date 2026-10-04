'use strict';
/* ================= Muscles and variations (standalone site only) =================
   Adds to the how-to sheet: which muscles an exercise works, and how common variations shift the work.
   Drawn from anatomy and muscle-activity studies. A named study means a training study measured growth. */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE) return;
  // First match wins, so the specific patterns come before the general ones.
  const KIND = [
    [/face pull/, 'facepull'], [/pull-apart|rear-delt|reverse pec deck|reverse fl/, 'rfly'], [/fly|pec deck/, 'fly'], [/dips?\b/, 'dip'], [/push-up/, 'pushup'], [/pallof/, 'pallof'],
    [/pushdown|cross-body cable extension/, 'pushdown'], [/overhead cable/, 'tri_oh'], [/lying extension|skull/, 'skull'],
    [/lying leg curl/, 'legcurl_lying'], [/leg curl/, 'legcurl'], [/bayesian/, 'curl_bayes'], [/preacher/, 'curl_preacher'], [/incline.*curl/, 'curl_incline'], [/(cable|rope).*curl/, 'curl_cable'], [/curl/, 'curl'],
    [/lateral raise/, 'lateral'], [/shrug/, 'shrug'], [/pull-up|chin-up/, 'pullup'], [/straight-arm|pullover/, 'sa_pulldown'], [/pulldown/, 'pulldown'],
    [/chest-supported row/, 'row_cs'], [/(single-arm|one-arm).*\brow\b/, 'row_1a'], [/\brow\b/, 'row'],
    [/landmine/, 'landmine'], [/half-kneeling/, 'hk_press'], [/incline.*press/, 'incline'], [/shoulder press/, 'ohp_seat'], [/military/, 'ohp'],
    [/calf/, 'calf'], [/leg press/, 'legpress'], [/press/, 'bench'], [/hack/, 'hack'], [/bulgarian/, 'bulg'], [/lateral lunge/, 'latlunge'], [/split squat|lunge/, 'splitsq'],
    [/squat to a box/, 'squat_box'], [/back squat|smith squat/, 'squat_bb'], [/squat/, 'squat'], [/pull-through/, 'pullthrough'], [/back extension/, 'backext'], [/deadlift/, 'rdl'], [/step-up/, 'stepup'],
    [/leg extension/, 'legext'], [/adductor/, 'adductor'], [/abductor/, 'abductor'], [/crunch/, 'crunch'], [/leg raise/, 'hangraise'], [/side plank/, 'sideplank'], [/dead bug/, 'deadbug'],
    [/single-leg balance/, 'balance'], [/single-leg reach/, 'reach'], [/bear/, 'bear'], [/crab/, 'crab'], [/external rotation/, 'ext_rot'],
    [/snap-down to a single-leg/, 'snap1'], [/snap-down/, 'snap'], [/drop landing|step off/, 'drop'], [/box jump/, 'boxjump'], [/broad jump/, 'broad'], [/jump/, 'cmj'],
    [/skater/, 'skater'], [/pogo/, 'pogo'], [/hop/, 'linehop'], [/slam/, 'slam'], [/overhead throw/, 'oh_throw'], [/side (throw|toss)/, 'side_throw'], [/scoop/, 'scoop'], [/backward/, 'back_toss'], [/chest pass/, 'chest'],
    [/hip thrust/, 'hipthrust'], [/bridge/, 'bridge'],
  ];
  const kindOf = name => { const n = String(name).toLowerCase(); const hit = KIND.find(k => k[0].test(n)); return hit ? hit[1] : ''; };
  // kind: [muscles worked, [how variations shift the work]]. A string points at another entry.
  const NOTES = {
    bench: ['Chest, with front delts and triceps.', ['Raising the bench shifts work toward the upper chest and front delts.', 'Elbows tucked or a narrower grip shifts work toward the triceps.', 'Dumbbells allow a deeper stretch than a bar or machine.']],
    incline: ['Upper chest and front delts, with triceps.', ['About 30° keeps it on the upper chest. Steeper turns it into a shoulder press.', 'Dumbbells allow a deeper stretch than a bar or machine.']],
    fly: ['Chest, with front delts helping.', ['A low-to-high path favors the upper chest. High-to-low favors the lower chest.', 'The arms-wide stretch is the part that counts. Keep a slight bend in the elbows.']],
    dip: ['Lower chest, triceps and front delts.', ['Leaning forward with elbows out favors the chest.', 'Staying upright with elbows in favors the triceps.']],
    tri_oh: ['Triceps, the long head most.', ['Arms overhead stretch the long head. That position grew it about 1.5 times more than pushdowns in one 12-week study (Maeo 2022).', 'One arm at a time evens out the two sides.']],
    skull: ['All three heads of the triceps.', ['Lowering the bar behind the head, not to the forehead, adds stretch on the long head.']],
    pushdown: ['Triceps, the lateral and medial heads most.', ['A rope lets the hands spread at the bottom. A bar lets you load heavier. No study shows one grows more.', 'Keep the elbows at your sides. Letting them drift forward brings the lats in.']],
    curl: ['Biceps, brachialis and brachioradialis.', ['Palms up favors the biceps.', 'Thumbs up, the hammer grip, shifts work to the brachialis and brachioradialis.', 'Palms down shifts it further to the brachioradialis and forearm.']],
    curl_incline: ['Biceps, stretched at the bottom, with the brachialis.', ['Leaning back puts the arm behind the body, which lengthens the biceps.', 'A steeper lean means more stretch and less weight.']],
    curl_preacher: ['Biceps and brachialis.', ['The pad stops any swing and makes the stretched bottom the hardest part.', 'Lower all the way. Stopping short removes the point of the exercise.']],
    curl_cable: ['Biceps, brachialis and brachioradialis.', ['The cable keeps tension on through the whole rep.', 'A rope with thumbs up makes it a hammer curl: more brachialis and brachioradialis.']],
    curl_bayes: ['Biceps, worked from a stretch.', ['Facing away with the arm behind the body lengthens the biceps at the start.', 'Keep the elbow back. Letting it drift forward removes the stretch.']],
    lateral: ['Side delts. The upper traps join in near the top.', ['Dumbbells are hardest at the top. A cable from the far side is hardest at the bottom, where the muscle is longer.', 'Raising slightly in front of the body is easier on the shoulder joint.', 'Shrugging as you lift moves work to the traps.']],
    pullup: ['Lats and teres major, with biceps, rear delts and lower traps.', ['Underhand or neutral grips bring in more biceps and usually allow more reps.', 'Grip width changes lat work very little in the studies on pulldowns.']],
    pulldown: ['Lats and teres major, with biceps, rear delts and lower traps.', ['Grip width changes little: narrow, medium and wide grips gave similar lat activity (Andersen 2014).', 'Overhand worked the lats a bit more than underhand (Lusk 2010). Underhand adds biceps.', 'Leaning far back turns it into a row.']],
    row: ['Lats, mid traps, rhomboids and rear delts, with biceps.', ['Elbows close, pulling to the belly, favors the lats.', 'Elbows out, pulling to the chest, favors the upper back and rear delts.', 'Chest support takes the lower back out of it.']],
    row_cs: 'row', row_1a: 'row',
    sa_pulldown: ['Lats and teres major, with the long head of the triceps and rear delts.', ['A rope or narrow grip lets the hands pass the hips: a longer range for the lats.', 'A wide grip on a bar shortens the range and brings in a little more rear delt and teres major.', 'No study has compared grips on this lift. Expect small differences.']],
    ohp: ['Front and side delts, triceps and upper chest.', ['Standing adds trunk work. Seated with back support lets the shoulders do more.', 'Dumbbells let the arms find their own path, which most shoulders prefer.']],
    ohp_seat: 'ohp',
    hk_press: ['Delts and triceps on one side, with the trunk resisting the lean.', ['Half kneeling stops you arching the low back to cheat the press.']],
    landmine: ['Front delts, upper chest and triceps.', ['The arc of the bar is easier on a sore shoulder than a straight overhead press.']],
    facepull: ['Rear delts, mid and lower traps, and the rotator cuff.', ['Pull to the forehead with elbows high, then rotate the hands back. The rotation is the cuff work.', 'Pulling low to the chest turns it into a row.']],
    rfly: ['Rear delts, with mid traps and rhomboids.', ['Reach out wide, not back. Squeezing the shoulder blades hard moves work to the traps.', 'Keep a slight bend in the elbows and stop when the arms are in line with the shoulders.']],
    shrug: ['Upper traps.', ['A slight forward lean lines the pull up with the upper trap fibers.', 'Pause at the top. Rolling the shoulders adds nothing.']],
    squat: ['Quads, glutes and adductors, with the trunk bracing.', ['A more upright torso or raised heels shifts work to the quads.', 'Going deeper adds glutes and adductors (Kubo 2019).', 'Holding the weight in front keeps you more upright than a bar on the back.']],
    squat_bb: 'squat', squat_box: 'squat',
    hack: ['Quads, with glutes.', ['Feet low on the platform means more knee bend and more quads.', 'Feet high shifts work toward the glutes and hamstrings.', 'Depth matters more than load.']],
    legpress: 'hack',
    rdl: ['Hamstrings and glutes, with the lower back holding position.', ['Knees almost straight puts more stretch on the hamstrings.', 'More knee bend shifts work to the glutes.', 'Dumbbells and bars train the same muscles. Use what lets you keep a flat back.']],
    backext: ['Glutes, hamstrings and spinal erectors.', ['A rounded upper back with the chin tucked favors the glutes.', 'A flat back favors the erectors.']],
    pullthrough: ['Glutes and hamstrings.', ['It is a hinge with the load pulling backward, so the squeeze at the top is harder than in a deadlift.']],
    splitsq: ['Quads, glutes and adductors.', ['A short stride with an upright torso favors the quads.', 'A long stride with a forward lean favors the glutes.']],
    bulg: 'splitsq',
    stepup: ['Quads and glutes.', ['A higher box means more glute work.', 'Push through the top foot. Bouncing off the bottom foot cheats it.']],
    latlunge: ['Adductors, glutes and quads.', ['Sitting the hips back loads the glutes and adductors. Staying upright loads the quads.']],
    legcurl: ['Hamstrings, with the calves helping.', ['Seated stretches the hamstrings more than lying and grew them more over 12 weeks (Maeo 2021).', 'Pointing the toes takes the calves out, so the hamstrings do more.']],
    legcurl_lying: 'legcurl',
    legext: ['Quads, including the rectus femoris that squats barely grow (Kubo 2019).', ['Leaning back lengthens the rectus femoris.', 'Pause at the top and lower slowly.']],
    calf: ['Calves: gastrocnemius and soleus.', ['A straight knee works the gastrocnemius most. A bent knee, as on a seated machine, shifts work to the soleus.', 'Pause in the bottom stretch. The stretched half grew the calf more in one study (Kassiano 2023).']],
    adductor: ['Inner thigh: the adductors.', ['Use the full range and control the way out. The stretch is the useful part.']],
    abductor: ['Glute medius and minimus, on the outside of the hip.', ['Pause with the legs apart and control the way back.']],
    crunch: ['Abs, with the obliques.', ['Curl the ribs toward the pelvis. Pulling with the hips or arms takes the abs out of it.', 'Add load over time, as with any other muscle.']],
    hangraise: ['Abs and hip flexors.', ['Bent knees are easier. Straight legs are harder.', 'The abs work when the pelvis curls up at the top. Without that it is mostly hip flexors.']],
    sideplank: ['Obliques and the muscles on the side of the hip.', ['Knees down is easier. Lifting the top leg is harder.']],
    deadbug: ['Deep abs, holding the lower back flat.', ['The lower the arm and leg reach, the harder it is. Stop where the back starts to arch.']],
    pallof: ['Obliques and deep abs, resisting rotation.', ['Standing farther from the anchor or pressing farther out makes it harder.']],
    balance: ['Ankle and hip stabilizers.', ['Eyes closed or catching a ball makes it harder.']],
    reach: ['Glutes, hamstrings and ankle stabilizers.', ['Reaching farther or lower makes it harder.']],
    bear: ['Shoulders, trunk and quads.', ['Knees closer to the floor and slower steps make it harder.']],
    crab: ['Triceps, shoulders, glutes and hamstrings.', ['Keeping the hips high makes it harder.']],
    ext_rot: ['Rotator cuff: infraspinatus and teres minor, with the rear delt.', ['Elbow at the side is the gentlest position.', 'Elbow at shoulder height matches the hitting position and is harder.']],
    snap: ['Quads, glutes and calves, absorbing the landing.', ['One leg is harder than two.', 'A higher box means a harder landing. Add height last.']],
    snap1: 'snap', drop: 'snap',
    cmj: ['Glutes, quads and calves, working fast.', ['A quick dip uses the stretch reflex. A pause at the bottom removes it and trains the push alone.', 'Landing on a box cuts the landing force.']],
    boxjump: 'cmj', broad: 'cmj',
    skater: ['The side of the hip, quads and adductors.', ['A longer bound is harder. Holding the landing longer trains control.']],
    linehop: ['Calves and ankles, with the side of the hip.', ['Faster, or on one leg, is harder.']],
    pogo: ['Calves and Achilles tendon, working like a spring.', ['Knees stay almost straight. Bending them turns it into a squat jump.']],
    slam: ['Lats, abs and triceps, with the hips.', ['A lighter ball thrown faster trains power better than a heavy ball thrown slowly.']],
    oh_throw: ['Abs, lats and triceps, driven from the hips.', ['Stepping into the throw adds the legs.']],
    side_throw: ['Hips and obliques, the same chain as a swing.', ['Half kneeling takes the legs out and isolates the trunk.', 'A step behind adds momentum from the legs.']],
    scoop: ['Glutes, hamstrings and back, extending together as in a jump.', ['Throwing for height trains the jump. Throwing backward adds the back.']],
    back_toss: 'scoop',
    chest: ['Chest, triceps and front delts.', ['Stepping into the pass adds the legs and hips.']],
    pushup: ['Chest, triceps and front delts, with the trunk holding a plank.', ['Hands raised is easier. Feet raised is harder and shifts work toward the upper chest and shoulders.', 'Hands closer together shifts work to the triceps.']],
    bridge: ['Glutes, with hamstrings.', ['Feet close to the hips favors the glutes. Feet farther away favors the hamstrings.']],
    hipthrust: 'bridge',
  };
  const noteFor = name => { let n = NOTES[kindOf(name)]; if (typeof n === 'string') n = NOTES[n]; return n || null; };
  window.FP_KIND = kindOf; // used by the check that every exercise has a note
  const sheet = ACT.how;
  ACT.how = t => {
    sheet(t);
    const body = document.querySelector('.sheet-body'), h2 = body && body.querySelector('h2'), n = noteFor(t.dataset.name || ''); if (!h2 || !n) return;
    const el = document.createElement('div'); el.style.marginBottom = '14px';
    el.innerHTML = '<p style="margin-bottom:8px"><b>Works:</b> ' + esc(n[0]) + '</p><p class="small muted">How variations change it</p><ul class="steps">' + n[1].map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    (body.querySelector('svg.sk') || h2).after(el);
  };
})();
