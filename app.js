// ============================================================
//  Workout Bet App — app.js
//  Replace SUPABASE_URL and SUPABASE_ANON_KEY below
// ============================================================

const SUPABASE_URL  = 'https://wnvrtkdebezzzobrvhtz.supabase.co';
const SUPABASE_ANON = 'sb_publishable_mwvKEgbO-lBOKBquqSY4PA_T4845Ksk';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── State ──────────────────────────────────────────────────
let currentUser = null;
let currentProfile = null;
let currentGroup  = null;
let currentGroupRole = null;
const DEFAULT_WORKOUT_TYPE_OPTIONS = [
  'Running',
  'Cycling',
  'Strength Training',
  'Tonal',
  'Fascia',
  'Swimming',
  'Yoga',
  'HIIT',
  'Walking',
  'Sports',
  'Other'
];

// ── DOM helpers ────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');

function setScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}

function setPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $(`page-${name}`).classList.add('active');
}

function msg(id, text, type = '') {
  const el = $(id);
  el.textContent = text;
  el.className = 'msg ' + type;
}

function setNavTitle(t) { $('nav-title').textContent = t; }

function getAllowedWorkoutTypes(group = currentGroup) {
  const allowed = group?.allowed_workout_types;
  return Array.isArray(allowed) && allowed.length ? allowed : DEFAULT_WORKOUT_TYPE_OPTIONS;
}

function renderWorkoutTypeOptions(group = currentGroup) {
  const select = $('log-type');
  const previousValue = select.value;
  const allowedTypes = getAllowedWorkoutTypes(group);
  select.innerHTML = '<option value="">Select type...</option>' +
    allowedTypes.map(type => `<option>${type}</option>`).join('');

  if (allowedTypes.includes(previousValue)) {
    select.value = previousValue;
  }
}

// ── Auth ───────────────────────────────────────────────────
$('auth-btn').addEventListener('click', async () => {
  const email = $('auth-email').value.trim();
  if (!email) return msg('auth-msg', 'Enter your email.', 'error');
  $('auth-btn').disabled = true;
  const { error } = await sb.auth.signInWithOtp({ email,
    options: { emailRedirectTo: location.href } });
  $('auth-btn').disabled = false;
  if (error) msg('auth-msg', error.message, 'error');
  else msg('auth-msg', '✅ Magic link sent! Check your email.', 'success');
});

// ── Init ───────────────────────────────────────────────────
async function init() {
  setScreen('loading');
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onLogin(session.user);
  else setScreen('auth');

  sb.auth.onAuthStateChange((_e, s) => {
    if (s?.user && !currentUser) onLogin(s.user);
    else if (!s) { currentUser = null; setScreen('auth'); }
  });
}

async function onLogin(user) {
  currentUser = user;
  await sb.rpc('ensure_profile', { p_user_id: user.id });

  const { data: prof } = await sb.from('profiles')
    .select('*').eq('id', user.id).maybeSingle();
  currentProfile = prof || {
    id: user.id,
    display_name: user.email?.split('@')[0] || ''
  };
  updateAvatar();
  setScreen('app');
  showDashboard();
}

function updateAvatar() {
  const btn = $('nav-avatar');
  const name = currentProfile?.display_name || currentUser?.email || '?';
  btn.textContent = name[0].toUpperCase();
}

// ── Dashboard ──────────────────────────────────────────────
async function showDashboard() {
  setPage('dashboard');
  setNavTitle('My Groups');
  hide('nav-back');
  currentGroup = null;

  const { data: memberships } = await sb.from('group_members')
    .select('group_id, role, groups(*)')
    .eq('user_id', currentUser.id);

  const list = $('group-list');
  if (!memberships?.length) {
    list.innerHTML = '<p class="empty">You\'re not in any groups yet.<br>Create or join one below!</p>';
    return;
  }

  list.innerHTML = '';
  for (const m of memberships) {
    const g = m.groups;
    // Get user's log count in this group
    const { count } = await sb.from('workout_logs')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', g.id).eq('user_id', currentUser.id);

    const pct = Math.min(100, Math.round((count / g.goal_days) * 100));
    const start = new Date(g.start_date);
    const end = new Date(start); end.setDate(end.getDate() + g.total_days - 1);
    const today = new Date();
    const daysLeft = Math.max(0, Math.ceil((end - today) / 86400000));

    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <div class="group-icon">🏋️</div>
      <div class="group-info">
        <div class="group-name">${g.name}</div>
        <div class="group-meta">
          ${count}/${g.goal_days} days · ${daysLeft > 0 ? daysLeft + ' days left' : 'Finished'}
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="group-arrow">›</div>
    `;
    card.addEventListener('click', () => openGroup(g, m.role));
    list.appendChild(card);
  }
}

// ── Group Detail ───────────────────────────────────────────
async function openGroup(group, role) {
  currentGroup = group;
  currentGroupRole = role;
  setPage('group');
  setNavTitle(group.name);
  show('nav-back');
  renderWorkoutTypeOptions(group);

  // Set default tab
  activateTab('leaderboard');
  loadLeaderboard();
}

// Tab switching
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    const tab = t.dataset.tab;
    activateTab(tab);
    if (tab === 'leaderboard') loadLeaderboard();
    else if (tab === 'feed') loadFeed();
    else if (tab === 'log') initLogForm();
    else if (tab === 'admin') loadAdmin();
  });
});

function activateTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${name}`));
}

// ── Leaderboard ────────────────────────────────────────────
async function loadLeaderboard() {
  const { data } = await sb.from('leaderboard')
    .select('*').eq('group_id', currentGroup.id)
    .order('days_logged', { ascending: false });

  const el = $('leaderboard-list');
  if (!data?.length) { el.innerHTML = '<p class="empty">No workouts logged yet.</p>'; return; }

  const medals = ['🥇','🥈','🥉'];
  el.innerHTML = data.map((r, i) => {
    const pct = Math.min(100, Math.round((r.days_logged / r.goal_days) * 100));
    const done = r.days_logged >= r.goal_days;
    return `
      <div class="lb-row">
        <div class="lb-rank">${medals[i] || i+1}</div>
        <div class="lb-col">
          <div class="lb-name">${r.display_name}${done ? ' ✅' : ''}</div>
          <div class="lb-bar-wrap"><div class="lb-bar" style="width:${pct}%"></div></div>
        </div>
        <div class="lb-days"><strong>${r.days_logged}</strong>/${r.goal_days} days<br>${r.total_minutes}min total</div>
      </div>`;
  }).join('');
}

// ── Feed ───────────────────────────────────────────────────
async function loadFeed() {
  const { data } = await sb.from('workout_logs')
    .select('*, profiles(display_name)')
    .eq('group_id', currentGroup.id)
    .order('created_at', { ascending: false })
    .limit(40);

  const el = $('feed-list');
  if (!data?.length) { el.innerHTML = '<p class="empty">No activity yet.</p>'; return; }

  el.innerHTML = data.map(log => {
    const name = log.profiles?.display_name || 'Someone';
    const date = new Date(log.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric' });
    return `
      <div class="feed-item">
        <div class="feed-avatar">${name[0].toUpperCase()}</div>
        <div class="feed-text">
          <div class="feed-name">${name}</div>
          <div class="feed-detail">${log.workout_type} · ${log.duration_minutes} min · ${log.logged_date}${log.notes ? ' · ' + log.notes : ''}</div>
        </div>
        <div class="feed-date">${date}</div>
      </div>`;
  }).join('');
}

// ── Log Workout ────────────────────────────────────────────
function initLogForm() {
  $('log-date').value = new Date().toISOString().split('T')[0];
  $('log-duration').value = '';
  renderWorkoutTypeOptions();
  $('log-type').value = '';
  $('log-notes').value = '';
  msg('log-msg', '');
}

$('log-submit').addEventListener('click', async () => {
  const date = $('log-date').value;
  const type = $('log-type').value;
  const dur  = parseInt($('log-duration').value);
  const notes = $('log-notes').value.trim();
  const minDuration = currentGroup?.minimum_duration_minutes || 1;
  const allowedTypes = getAllowedWorkoutTypes();

  if (!date || !type || !dur) return msg('log-msg', 'Fill in date, type, and duration.', 'error');
  if (dur < minDuration) return msg('log-msg', `Workout must be at least ${minDuration} minutes.`, 'error');
  if (!allowedTypes.includes(type)) return msg('log-msg', 'Choose one of the allowed workout types for this group.', 'error');

  $('log-submit').disabled = true;
  const { error } = await sb.from('workout_logs').upsert({
    group_id: currentGroup.id,
    user_id: currentUser.id,
    logged_date: date,
    workout_type: type,
    duration_minutes: dur,
    notes: notes || null
  }, { onConflict: 'group_id,user_id,logged_date' });
  $('log-submit').disabled = false;

  if (error) msg('log-msg', error.message, 'error');
  else { msg('log-msg', '✅ Workout logged!', 'success'); }
});

// ── OCR ────────────────────────────────────────────────────
$('ocr-btn').addEventListener('click', () => $('ocr-input').click());

$('ocr-input').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  show('ocr-status'); hide('ocr-btn');
  msg('log-msg', '');
  clearOCRPrefill();

  try {
    const uploadFile = await prepareImageForOCR(file);
    const { text } = await extractOCRText(uploadFile, file);
    parseOCR(normalizeOCRText(text));
  } catch (err) {
    console.error(err);
    msg('log-msg', err.message || 'OCR failed. Try a clearer screenshot or configure OCR.Space.', 'error');
  } finally {
    $('ocr-input').value = '';
    hide('ocr-status'); show('ocr-btn');
  }
});

const WORKOUT_TYPES = ['running','cycling','strength','swimming','yoga','hiit','walking','sports'];
const OCR_TYPE_HINTS = [
  { match: /\btonal\b/i, value: 'Tonal' },
  { match: /\bfascia\b/i, value: 'Fascia' },
  { match: /functional\s+strength\s+training|strength\s+training|training/i, value: 'Strength Training' },
  { match: /run(?:ning)?|jog/i, value: 'Running' },
  { match: /cycl(?:ing)?|bike|biking/i, value: 'Cycling' },
  { match: /swim(?:ming)?/i, value: 'Swimming' },
  { match: /yoga/i, value: 'Yoga' },
  { match: /\bhiit\b|interval/i, value: 'HIIT' },
  { match: /walk(?:ing)?|hike|hiking/i, value: 'Walking' },
  { match: /sport|tennis|soccer|basketball|football|pickleball/i, value: 'Sports' },
];

async function extractOCRText(file, originalFile = file) {
  try {
    const text = await extractOCRTextWithEdgeFunction(file);
    return {
      text,
      source: 'edge-function'
    };
  } catch (err) {
    console.warn('Edge OCR failed, falling back to Tesseract.', err);

    if (!window.Tesseract) {
      const reason = err?.message || 'Unknown edge function error.';
      throw new Error(`Edge OCR failed: ${reason}`);
    }

    const result = await Tesseract.recognize(file, 'eng', { logger: () => {} });
    const text = result?.data?.text?.trim();
    if (!text) throw new Error('No text found in image.');
    return {
      text,
      source: 'tesseract'
    };
  }
}

async function extractOCRTextWithEdgeFunction(file) {
  const formData = new FormData();
  formData.append('file', file, file.name || 'workout-image.jpg');

  const { data, error } = await sb.functions.invoke('ocr-space', {
    body: formData
  });

  if (error) {
    let detail = error.message || 'Unknown invoke error';
    const context = error.context;

    if (context) {
      if (typeof context === 'string') {
        detail = `${detail}: ${context}`;
      } else if (typeof context.text === 'function') {
        const raw = await context.text();
        if (raw) detail = `${detail}: ${raw}`;
      } else if (context.message) {
        detail = `${detail}: ${context.message}`;
      }
    }

    throw new Error(detail);
  }

  const text = data?.text?.trim();
  if (!text) throw new Error('No text found in image.');
  return text;
}

function clearOCRPrefill() {
  $('log-date').value = new Date().toISOString().split('T')[0];
  $('log-duration').value = '';
  $('log-type').value = '';
  $('log-notes').value = '';
}

function normalizeOCRText(text) {
  return text
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[|]/g, 'I')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

async function prepareImageForOCR(file, maxBytes = 950 * 1024) {
  if (!file || !String(file.type || '').startsWith('image/')) return file;
  if (file.size <= maxBytes) return file;

  const image = await loadImageElement(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return file;

  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  const maxDimension = 1600;
  const largestSide = Math.max(width, height);

  if (largestSide > maxDimension) {
    const scale = maxDimension / largestSide;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  const outputType = file.type === 'image/png' ? 'image/jpeg' : (file.type || 'image/jpeg');
  const qualitySteps = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42];

  for (const quality of qualitySteps) {
    const blob = await canvasToBlob(canvas, outputType, quality);
    if (blob.size <= maxBytes) {
      return new File([blob], withJpgName(file.name), {
        type: blob.type || 'image/jpeg',
        lastModified: Date.now()
      });
    }
  }

  const finalBlob = await canvasToBlob(canvas, 'image/jpeg', 0.35);
  return new File([finalBlob], withJpgName(file.name), {
    type: finalBlob.type || 'image/jpeg',
    lastModified: Date.now()
  });
}

async function loadImageElement(file) {
  const dataUrl = await readFileAsDataUrl(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode that image file.'));
    image.src = dataUrl;
  });
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that image file.'));
    reader.readAsDataURL(file);
  });
}

async function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Could not compress that image.'));
    }, type, quality);
  });
}

function withJpgName(name) {
  return String(name || 'ocr-image')
    .replace(/\.[^.]+$/, '') + '.jpg';
}

function parseOCR(text) {
  const lower = text.toLowerCase();
  const compact = lower.replace(/\s+/g, '');

  // Duration: support labels like "Total Time 00:23:44", plain HH:MM:SS, HH:MM, or OCR output like "TOTALTIME 2344".
  let duration = null;
  const labeledTimeMatch = lower.match(/(total\s*time|moving\s*time|duration|time)\D{0,12}(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const genericTimeMatch = lower.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  const minMatch = lower.match(/(\d+)\s*(?:min(?:utes?)?|m\b)/);
  const compactTimeMatch = compact.match(/(?:totaltime|movingtime|duration|time)(\d{3,6})/);

  if (labeledTimeMatch) {
    const label = labeledTimeMatch[1];
    const first = parseInt(labeledTimeMatch[2], 10);
    const second = parseInt(labeledTimeMatch[3], 10);
    const third = labeledTimeMatch[4] ? parseInt(labeledTimeMatch[4], 10) : null;

    if (third !== null) {
      duration = Math.max(1, Math.round((first * 3600 + second * 60 + third) / 60));
    } else if (/moving\s*time|duration/.test(label)) {
      duration = Math.max(1, Math.round((first * 60 + second) / 60));
    } else if (/total\s*time|time/.test(label)) {
      duration = Math.max(1, Math.round((first * 60 + second) / 60));
    }
  } else if (genericTimeMatch) {
    const first = parseInt(genericTimeMatch[1], 10);
    const second = parseInt(genericTimeMatch[2], 10);
    const third = genericTimeMatch[3] ? parseInt(genericTimeMatch[3], 10) : null;

    if (third !== null) {
      duration = Math.max(1, Math.round((first * 3600 + second * 60 + third) / 60));
    } else if (first <= 59) {
      duration = Math.max(1, Math.round((first * 60 + second) / 60));
    } else {
      duration = first;
    }
  } else if (compactTimeMatch) {
    const digits = compactTimeMatch[1];
    if (digits.length === 3) {
      const minutes = parseInt(digits.slice(0, 1), 10);
      const seconds = parseInt(digits.slice(1, 3), 10);
      duration = Math.max(1, Math.round((minutes * 60 + seconds) / 60));
    } else if (digits.length === 4) {
      const minutes = parseInt(digits.slice(0, 2), 10);
      const seconds = parseInt(digits.slice(2, 4), 10);
      duration = Math.max(1, Math.round((minutes * 60 + seconds) / 60));
    } else if (digits.length === 5 || digits.length === 6) {
      const padded = digits.padStart(6, '0');
      const hours = parseInt(padded.slice(0, 2), 10);
      const minutes = parseInt(padded.slice(2, 4), 10);
      const seconds = parseInt(padded.slice(4, 6), 10);
      duration = Math.max(1, Math.round((hours * 3600 + minutes * 60 + seconds) / 60));
    }
  } else if (minMatch) {
    duration = parseInt(minMatch[1], 10);
  }

  if (duration) $('log-duration').value = duration;

  // Workout type
  let matchedType = '';
  for (const hint of OCR_TYPE_HINTS) {
    if (hint.match.test(lower)) {
      matchedType = hint.value;
      break;
    }
  }

  if (!matchedType) {
    for (const t of WORKOUT_TYPES) {
      if (lower.includes(t)) {
        matchedType = t;
        break;
      }
    }
  }

  if (matchedType) {
    const opts = $('log-type').options;
    for (let i = 0; i < opts.length; i++) {
      const optionText = opts[i].text.toLowerCase();
      const want = matchedType.toLowerCase();
      if (optionText === want || optionText.includes(want)) {
        $('log-type').value = opts[i].value;
        break;
      }
    }
  }

  // Date: look for MM/DD/YYYY or Month DD, YYYY
  const dateMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (dateMatch) {
    let [, m, d, y] = dateMatch;
    if (y.length === 2) y = '20' + y;
    const iso = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    if (!isNaN(new Date(iso))) $('log-date').value = iso;
  }

  msg('log-msg', '📷 Image scanned — review and adjust if needed.', 'success');
}

// ── Admin ──────────────────────────────────────────────────
async function loadAdmin() {
  if (currentGroupRole !== 'admin') {
    hide('admin-panel'); show('admin-locked'); return;
  }
  show('admin-panel'); hide('admin-locked');

  $('admin-join-code').textContent = currentGroup.join_code;
  $('admin-name').value = currentGroup.name;
  $('admin-start').value = currentGroup.start_date;
  $('admin-goal-days').value = currentGroup.goal_days;
  $('admin-total-days').value = currentGroup.total_days;
  $('admin-min-duration').value = currentGroup.minimum_duration_minutes || 20;
  $('admin-workout-types').value = getAllowedWorkoutTypes().join('\n');

  // Load members
  const { data: members } = await sb.from('group_members')
    .select('*, profiles(display_name)')
    .eq('group_id', currentGroup.id);

  $('admin-members').innerHTML = members.map(m => `
    <div class="member-row">
      <span class="member-name">${m.profiles?.display_name || '?'}</span>
      <span class="member-role">${m.role}</span>
      ${m.user_id !== currentUser.id
        ? `<button class="btn-kick" data-id="${m.user_id}">Remove</button>` : ''}
    </div>`).join('');

  $('admin-members').querySelectorAll('.btn-kick').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this member?')) return;
      await sb.from('group_members')
        .delete().eq('group_id', currentGroup.id).eq('user_id', btn.dataset.id);
      loadAdmin();
    });
  });
}

$('admin-save').addEventListener('click', async () => {
  const name = $('admin-name').value.trim();
  const start = $('admin-start').value;
  const goalDays = parseInt($('admin-goal-days').value, 10);
  const totalDays = parseInt($('admin-total-days').value, 10);
  const minDuration = parseInt($('admin-min-duration').value, 10);
  const workoutTypes = $('admin-workout-types').value
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean);

  if (!name || !start) return msg('admin-msg', 'Name and start date required.', 'error');
  if (!goalDays || !totalDays || !minDuration) return msg('admin-msg', 'Goal days, challenge length, and minimum duration are required.', 'error');
  if (goalDays > totalDays) return msg('admin-msg', 'Goal workout days cannot exceed challenge length.', 'error');
  if (!workoutTypes.length) return msg('admin-msg', 'Add at least one allowed workout type.', 'error');

  const { error } = await sb.from('groups')
    .update({
      name,
      start_date: start,
      goal_days: goalDays,
      total_days: totalDays,
      minimum_duration_minutes: minDuration,
      allowed_workout_types: workoutTypes
    }).eq('id', currentGroup.id);
  if (error) msg('admin-msg', error.message, 'error');
  else {
    currentGroup = {
      ...currentGroup,
      name,
      start_date: start,
      goal_days: goalDays,
      total_days: totalDays,
      minimum_duration_minutes: minDuration,
      allowed_workout_types: workoutTypes
    };
    setNavTitle(name);
    renderWorkoutTypeOptions();
    msg('admin-msg', '✅ Saved!', 'success');
  }
});

// ── Profile ────────────────────────────────────────────────
$('nav-avatar').addEventListener('click', () => {
  setPage('profile');
  setNavTitle('Profile');
  show('nav-back');
  $('profile-name').value = currentProfile?.display_name || '';
  msg('profile-msg', '');
});

$('profile-save').addEventListener('click', async () => {
  const name = $('profile-name').value.trim();
  if (!name) return;
  const { error } = await sb.from('profiles')
    .update({ display_name: name }).eq('id', currentUser.id);
  if (!error) {
    currentProfile = { ...currentProfile, display_name: name };
    updateAvatar();
    msg('profile-msg', '✅ Saved!', 'success');
  }
});

$('profile-logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  setScreen('auth');
});

// ── Back nav ───────────────────────────────────────────────
$('nav-back').addEventListener('click', () => showDashboard());

// ── Create Group ───────────────────────────────────────────
$('btn-create-group').addEventListener('click', () => {
  $('create-name').value = '';
  $('create-start').value = new Date().toISOString().split('T')[0];
  msg('create-msg', '');
  show('modal-overlay');
  show('modal-create');
});

$('create-cancel').addEventListener('click', closeModals);

$('create-submit').addEventListener('click', async () => {
  const name = $('create-name').value.trim();
  const start = $('create-start').value;
  if (!name || !start) return msg('create-msg', 'Fill in all fields.', 'error');

  $('create-submit').disabled = true;
  const { data: group, error } = await sb.rpc('create_group_with_admin', {
    p_name: name,
    p_start_date: start
  });

  if (error) { msg('create-msg', error.message, 'error'); $('create-submit').disabled = false; return; }

  $('create-submit').disabled = false;
  closeModals();
  openGroup(group, 'admin');
});

// ── Join Group ─────────────────────────────────────────────
$('btn-join-group').addEventListener('click', () => {
  $('join-code').value = '';
  msg('join-msg', '');
  show('modal-overlay');
  show('modal-join');
});

$('join-cancel').addEventListener('click', closeModals);

$('join-submit').addEventListener('click', async () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length !== 6) return msg('join-msg', 'Enter a 6-character code.', 'error');

  $('join-submit').disabled = true;
  const { data: group, error } = await sb.rpc('join_group_by_code', {
    p_join_code: code
  });

  if (error || !group) {
    msg('join-msg', 'Group not found.', 'error');
    $('join-submit').disabled = false; return;
  }

  $('join-submit').disabled = false;
  closeModals();
  openGroup(group, 'member');
});

function closeModals() {
  hide('modal-overlay');
  hide('modal-create');
  hide('modal-join');
}

$('modal-overlay').addEventListener('click', e => {
  if (e.target === $('modal-overlay')) closeModals();
});

// ── Boot ───────────────────────────────────────────────────
init();
