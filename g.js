'use strict';
/* ================= Exercise pictures (standalone site only) =================
   Start and finish photos plus written steps from the public-domain Free Exercise DB
   (github.com/yuhonas/free-exercise-db), loaded only when someone asks for them. */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE) return;
  const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
  // FitPitt exercise name -> library entry showing the same movement. Names without an entry get a web search instead.
  const MAP = {
    'Flat DB press': 'Dumbbell_Bench_Press', 'DB bench press': 'Dumbbell_Bench_Press', 'Barbell bench press': 'Barbell_Bench_Press_-_Medium_Grip', 'Machine chest press': 'Machine_Bench_Press',
    'Incline DB press, 30°': 'Incline_Dumbbell_Press', 'Incline DB press, 45°': 'Incline_Dumbbell_Press', 'Incline DB press': 'Incline_Dumbbell_Press', 'Incline Smith press': 'Smith_Machine_Incline_Bench_Press', 'Incline machine press': 'Leverage_Incline_Chest_Press',
    'Incline cable fly': 'Incline_Cable_Flye', 'Pec deck': 'Butterfly', 'Seated cable fly': 'Cable_Crossover', 'Weighted dips': 'Dips_-_Chest_Version',
    'Overhead cable triceps extension': 'Cable_Rope_Overhead_Triceps_Extension', 'Single-arm overhead cable extension': 'Cable_Rope_Overhead_Triceps_Extension', 'EZ-bar lying extension, behind the head': 'Lying_Close-Grip_Barbell_Triceps_Extension_Behind_The_Head',
    'Rope pushdown': 'Triceps_Pushdown_-_Rope_Attachment', 'Straight-bar pushdown': 'Triceps_Pushdown',
    'Incline DB curl': 'Incline_Dumbbell_Curl', 'Preacher curl': 'Preacher_Curl', 'Cross-body hammer curl': 'Cross_Body_Hammer_Curl', 'Rope hammer curl': 'Cable_Hammer_Curls_-_Rope_Attachment', 'Reverse EZ-bar curl': 'Reverse_Barbell_Curl', 'DB curl': 'Dumbbell_Bicep_Curl', 'Cable curl': 'Standing_Biceps_Cable_Curl',
    'DB lateral raise': 'Side_Lateral_Raise', 'Cable lateral raise': 'Standing_Low-Pulley_Deltoid_Raise',
    'Weighted pull-up': 'Weighted_Pull_Ups', 'Weighted neutral-grip pull-up': 'V-Bar_Pullup', 'Weighted chin-up': 'Chin-Up', 'Assisted pull-up': 'Band_Assisted_Pull-Up',
    'Seated cable row': 'Seated_Cable_Rows', 'Chest-supported row': 'Dumbbell_Incline_Row', 'Single-arm DB row': 'One-Arm_Dumbbell_Row', 'One-arm DB row, each arm': 'One-Arm_Dumbbell_Row', 'One-arm DB row with a light weight': 'One-Arm_Dumbbell_Row',
    'Wide-grip lat pulldown': 'Wide-Grip_Lat_Pulldown', 'Lat pulldown': 'Wide-Grip_Lat_Pulldown', 'Neutral-grip lat pulldown': 'V-Bar_Pulldown', 'Single-arm cable pulldown': 'One_Arm_Lat_Pulldown',
    'Straight-arm pulldown': 'Straight-Arm_Pulldown', 'Cable pullover': 'Rope_Straight-Arm_Pulldown',
    'Standing military press': 'Standing_Military_Press', 'Seated DB shoulder press': 'Seated_Dumbbell_Press', 'Machine shoulder press': 'Machine_Shoulder_Military_Press', 'Half-kneeling one-arm DB press, each arm': 'Dumbbell_One-Arm_Shoulder_Press',
    'Face pull': 'Face_Pull', 'Reverse pec deck': 'Reverse_Machine_Flyes', 'Cable rear-delt fly': 'Cable_Rear_Delt_Fly', 'DB shrug': 'Dumbbell_Shrug', 'Barbell shrug': 'Barbell_Shrug', 'Band pull-apart': 'Band_Pull_Apart',
    'Hack squat': 'Hack_Squat', 'Leg press': 'Leg_Press', 'High-bar back squat': 'Barbell_Full_Squat', 'Smith squat': 'Smith_Machine_Squat',
    'Goblet squat': 'Goblet_Squat', 'Goblet squat, 3-second lower': 'Goblet_Squat', 'Goblet squat with a light weight': 'Goblet_Squat', 'Squat to a box': 'Dumbbell_Squat_To_A_Bench',
    'Romanian deadlift': 'Romanian_Deadlift', 'Barbell Romanian deadlift': 'Romanian_Deadlift', 'DB Romanian deadlift': 'Stiff-Legged_Dumbbell_Deadlift',
    '45° back extension, weighted': 'Hyperextensions_Back_Extensions', '45° back extension': 'Hyperextensions_Back_Extensions',
    'Bulgarian split squat': 'Split_Squat_with_Dumbbells', 'Walking lunge': 'Bodyweight_Walking_Lunge', 'Reverse lunge': 'Dumbbell_Rear_Lunge', 'Step-up': 'Dumbbell_Step_Ups',
    'Seated leg curl': 'Seated_Leg_Curl', 'Lying leg curl': 'Lying_Leg_Curls', 'Leg extension': 'Leg_Extensions', 'Single-leg leg extension': 'Single-Leg_Leg_Extension',
    'Standing calf raise': 'Standing_Calf_Raises', 'Leg-press calf raise': 'Calf_Press_On_The_Leg_Press_Machine', 'Adductor machine': 'Thigh_Adductor', 'Abductor machine': 'Thigh_Abductor',
    'Hip thrust': 'Barbell_Hip_Thrust', 'Barbell glute bridge': 'Barbell_Glute_Bridge', 'Glute bridge': 'Butt_Lift_Bridge', 'Cable pull-through': 'Pull_Through',
    'Cable crunch': 'Cable_Crunch', 'Machine crunch': 'Ab_Crunch_Machine', 'Hanging leg raise': 'Hanging_Leg_Raise', "Captain's chair leg raise": 'Knee_Hip_Raise_On_Parallel_Bars',
    'Side plank': 'Side_Bridge', 'Dead bug': 'Dead_Bug', 'Pallof press hold': 'Pallof_Press',
    'Push-up': 'Pushups', 'Push-up, 3-second lower': 'Pushups', 'Push-up, feet elevated': 'Push-Ups_With_Feet_Elevated', 'Push-up, hands on a bench': 'Incline_Push-Up',
    'Band external rotation, each arm': 'External_Rotation_with_Band', 'Side-lying DB external rotation, each arm': 'External_Rotation',
    'Countermovement jump': 'Rocket_Jump', 'Jump and stick': 'Rocket_Jump', 'Jump and reach': 'Rocket_Jump', 'Box jump, step down': 'Front_Box_Jump',
    'Broad jump': 'Standing_Long_Jump', 'Broad jump, stick the landing': 'Standing_Long_Jump',
    'Skater hop, stick the landing': 'Lateral_Bound', 'Skater hop, hold 3 seconds': 'Lateral_Bound', 'Line hops, side to side': 'Lateral_Cone_Hops', 'Hop over a line, stick the landing': 'Lateral_Cone_Hops',
    'Med-ball overhead slam': 'Overhead_Slam', 'Med-ball slam': 'Overhead_Slam', 'Med-ball slam, step into it': 'Overhead_Slam',
    'Med-ball overhead throw to a wall': 'Catch_and_Overhead_Throw', 'Med-ball overhead throw, split stance': 'Catch_and_Overhead_Throw',
    'Med-ball scoop toss': 'Medicine_Ball_Scoop_Throw', 'Med-ball backward overhead toss': 'Backward_Medicine_Ball_Throw',
    'Med-ball chest pass': 'Medicine_Ball_Chest_Pass', 'Med-ball chest pass to a wall': 'Medicine_Ball_Chest_Pass', 'Med-ball chest pass, step into it': 'Medicine_Ball_Chest_Pass',
  };
  // No photos in the library for these, so the steps are written out here.
  const land = ['Stand on a box about shin height.', 'Step off. Do not jump off.', 'Land on both feet in a quarter squat, quiet and balanced, knees over toes.', 'Hold 2 seconds, then step back up.'];
  const calf = ['Stand on one foot on the edge of a step, holding something for balance.', 'Rise as high as you can onto the ball of the foot.', 'Lower slowly until the heel drops below the step.'];
  const STEPS = {
    'Snap-down, stick the landing': ['Stand tall on your toes with your arms reaching overhead.', 'Drop fast into a quarter squat and throw your arms down and back.', 'Land on flat feet, quietly, with knees over toes.', 'Freeze for 2 seconds before standing up.'],
    'Snap-down to a single-leg stick': ['Stand tall on your toes with your arms overhead.', 'Drop fast and land on one leg in a quarter squat.', 'Keep the knee over the toes and the hips level.', 'Hold 2 seconds, and switch legs on the next rep.'],
    'Drop landing from a low box': land, 'Step off a low box, stick the landing': land,
    'Approach jump, stick the landing': ['Take your normal hitting approach of three or four steps.', 'Plant both feet and swing both arms up hard.', 'Jump straight up and reach as high as you can.', 'Land on both feet, soft and balanced, and hold for 2 seconds.'],
    'Pogo hops': ['Stand tall with your hands on your hips.', 'Bounce on the balls of your feet with your legs almost straight.', 'Spend as little time on the floor as you can.', 'Keep the hops low and quick.'],
    'Med-ball side throw to a wall': ['Stand sideways to a wall, about three steps away, with the ball at your back hip.', 'Turn your hips toward the wall first.', 'Let the arms follow and throw the ball hard into the wall.', 'Reset each rep, and do both sides.'],
    'Med-ball side throw, step behind': ['Stand sideways to the wall with the ball at your back hip.', 'Step your back foot behind your front foot, then step out toward the wall.', 'Turn the hips and throw the ball into the wall.', 'Reset each rep, and do both sides.'],
    'Med-ball side throw, half kneeling': ['Kneel sideways to the wall with the inside knee down.', 'Hold the ball at the outside hip.', 'Turn your chest toward the wall and throw.', 'Stay tall through the hips, and do both sides.'],
    'Med-ball side toss to a partner': ['Stand sideways to your partner, a few steps apart.', 'Hold the ball at your back hip.', 'Turn the hips, then toss the ball to your partner.', 'Catch the return on the same side, and do both sides.'],
    'Single-leg balance': ['Stand on one leg with the knee slightly bent.', 'Keep the hips level and the standing foot flat.', 'Hold still for the time shown, then switch legs.'],
    'Single-leg balance, eyes closed': ['Stand on one leg with the knee slightly bent.', 'Close your eyes once you are steady.', 'Hold for the time shown, then switch legs.'],
    'Single-leg balance with a ball toss': ['Stand on one leg with the knee slightly bent.', 'Toss a ball to a partner or against a wall and catch it.', 'Keep the hips level the whole time, then switch legs.'],
    'Single-leg reach to a cone': ['Stand on one leg with a cone a step in front of you.', 'Bend the standing knee and reach down to touch the cone.', 'Stand back up without putting the other foot down.', 'Keep the knee over the toes, then switch legs.'],
    'Single-leg calf raise': calf, 'Single-leg calf raise, 3-second lower': calf,
    'Split squat': ['Take a long step forward and keep both feet where they are.', 'Lower the back knee straight down until it almost touches the floor.', 'Keep the front knee over the toes and the chest up.', 'Push back up through the front foot.'],
    'Lateral lunge': ['Stand tall, then take a big step out to one side.', 'Sit the hips back over that leg and keep the other leg straight.', 'Keep the chest up and the bent knee over the toes.', 'Push back to the start.'],
    'Kettlebell deadlift': ['Stand over a kettlebell with your feet hip width apart.', 'Push the hips back and bend the knees until you can grip the handle with a flat back.', 'Stand up by driving the hips forward.', 'Lower it the same way.'],
    'DB front squat': ['Hold a dumbbell on each shoulder with the elbows up.', 'Squat down between your hips with the chest up.', 'Stand back up without letting the elbows drop.'],
    'Landmine press, each arm': ['Put one end of a barbell in a corner or a landmine holder.', 'Hold the other end at your shoulder with one hand.', 'Press it up and slightly forward until the arm is straight.', 'Lower under control.'],
    'Band row': ['Anchor a band at chest height and hold an end in each hand.', 'Step back until the band is tight.', 'Pull your elbows back and squeeze the shoulder blades together.', 'Return slowly.'],
    'Band external rotation, elbow at shoulder height': ['Anchor a band at chest height and face it.', 'Raise your elbow out to the side at shoulder height, bent to 90 degrees, with the forearm pointing forward.', 'Rotate the forearm up until the fist points at the ceiling.', 'Lower slowly.'],
    'Bear crawl': ['Get on hands and feet with your knees an inch off the floor.', 'Move the opposite hand and foot together in small steps.', 'Keep the hips low and the back flat.'],
    'Crab walk': ['Sit, put your hands behind you, and lift your hips off the floor.', 'Walk on hands and feet, moving the opposite hand and foot together.', 'Keep the hips up.'],
    'Bayesian cable curl': ['Set a cable at its lowest position and face away from it.', 'Hold the handle with your arm hanging slightly behind your body.', 'Curl without letting the elbow drift forward.', 'Lower all the way until the arm is behind you again.'],
    'Cross-body cable extension': ['Set a cable at about head height and stand sideways to it.', 'Grip the cable end with the far hand, elbow bent across your body.', 'Straighten the arm down and out to the side.', 'Return slowly.'],
    'Machine lateral raise': ['Sit with your arms against the pads or holding the handles.', 'Raise your arms out to the sides to shoulder height.', 'Lower slowly.'],
    'Machine hip thrust': ['Sit in the machine with your upper back on the pad and the belt across your hips.', 'Drive the hips up until your body is level from shoulders to knees.', 'Pause, then lower.'],
  };
  const css = document.createElement('style');
  css.textContent = '.how{background:none;border:0;padding:6px 0 6px 10px;font-size:14px;font-weight:600;color:var(--ink);text-decoration:underline;text-underline-offset:3px;white-space:nowrap}' +
    '.pv-last .how{margin-left:auto}.how + .swap{margin-left:10px}' +
    '.how-pics{display:grid;gap:10px;margin:4px 0 14px}@media (min-width:520px){.how-pics{grid-template-columns:1fr 1fr}}' +
    '.how-pics figure{margin:0}.how-pics img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;border-radius:8px;background:var(--sunk)}.how-pics figcaption{font-size:13px;color:var(--muted);margin-top:4px}' +
    '.how-steps{padding-left:22px;list-style:decimal;font-size:15px;margin-bottom:12px}.how-steps li{margin-bottom:6px}';
  document.head.appendChild(css);

  function addButtons() {
    app.querySelectorAll('.ex').forEach(sec => {
      const meta = sec.querySelector('.ex-meta'), name = sec.querySelector('.ex-name');
      if (!meta || !name || meta.querySelector('.how')) return;
      meta.appendChild(button(name.textContent));
    });
    app.querySelectorAll('.preview li').forEach(li => {
      const last = li.querySelector('.pv-last'), name = li.querySelector('.pv-name');
      if (!last || !name || last.querySelector('.how')) return;
      last.insertBefore(button(name.textContent), last.querySelector('.swap'));
    });
  }
  function button(name) { const b = document.createElement('button'); b.className = 'how'; b.dataset.act = 'how'; b.dataset.name = name; b.textContent = 'Pictures'; return b; }
  ACT.how = t => {
    const name = t.dataset.name || '', id = MAP[name], search = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(name + ' exercise form');
    const more = '<div class="frm"><a class="btn quiet wide" target="_blank" rel="noopener" href="' + esc(search) + '">' + (id ? 'More pictures on the web' : 'Search the web for pictures') + '</a><button class="btn link" data-act="closeSheet">Close</button></div>';
    if (!id) {
      const st = STEPS[name];
      openSheet('<h2>' + esc(name) + '</h2><p class="small muted" style="margin-bottom:10px">' + (st ? 'No photos on file for this one. Here is how it goes.' : 'No photos or steps on file for this one.') + '</p>' + (st ? '<ol class="how-steps">' + st.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol>' : '') + more);
      return;
    }
    const pic = (n, cap) => '<figure><img src="' + BASE + id + '/' + n + '.jpg" alt="' + cap + ' position" loading="lazy" onerror="this.closest(\'figure\').hidden=true"><figcaption>' + cap + '</figcaption></figure>';
    openSheet('<h2>' + esc(name) + '</h2><div class="how-pics">' + pic(0, 'Start') + pic(1, 'Finish') + '</div><ol class="how-steps" id="how-steps"></ol>' +
      '<p class="small muted" style="margin-bottom:12px">From the public-domain Free Exercise DB, filed there as "' + esc(id.replace(/_/g, ' ')) + '". Pictures need a connection.</p>' + more);
    fetch(BASE + id + '.json').then(r => r.ok ? r.json() : null).then(j => {
      const ol = $('#how-steps'); if (!ol || !j || !Array.isArray(j.instructions)) return;
      j.instructions.slice(0, 6).forEach(s => { const li = document.createElement('li'); li.textContent = s; ol.appendChild(li); });
    }).catch(() => { /* the pictures still show without the steps */ });
  };
  new MutationObserver(addButtons).observe(app, { childList: true });
  addButtons();
})();
