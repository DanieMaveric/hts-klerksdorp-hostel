/* ============================================================
   HTS Klerksdorp Hostel — Staff Management & Operations PWA
   Vanilla JS single-page app. Installable, offline-ready.
   Owner (D Smit) has full control. Staff sign in with
   their name + a personal PIN and can log discipline,
   do roll call, inspect rooms and send broadcasts.
   All devices share one live dataset (Supabase REST).
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY   = 'hts_hostel_pwa_v1';        // offline cache (this device)
  var SESSION_KEY = 'hts_hostel_session_v2';    // who is signed in on this device

  /* --- shared cloud store (publishable/anon key only) --- */
  var CLOUD_URL = 'https://czsoojfrnwcwyzejxsge.supabase.co/rest/v1/hostel_state';
  var CLOUD_KEY = 'sb_publishable_yOnH6G9Hm1RL90RvZLQvvw_LjIhNpXD';
  var CLOUD_ROW = 'hts-klerksdorp-hostel-8f4b21d7c9';

  var BASE_POINTS = 10;                 // starting points for every boarder
  var DEFAULT_PHONE = '082 555 1234';
  var MOTTO = 'UBERRIMAE FIDEI';
  var OWNER_NAME = 'D Smit';            // the only account with full control
  var ROOM_COUNT = 64;
  var TERM_COUNT = 4;                   // school terms used for roll call (Term 1–4)
  var POLL_MS = 10000;                  // how often we look for other phones' updates

  /* Every learner is enrolled in one or more terms. Roll call is kept
     separately per term, so a learner who leaves in Term 2 stops
     appearing on the Term 3 and Term 4 roll calls. */
  function allTerms() {
    var out = [];
    for (var n = 1; n <= TERM_COUNT; n++) out.push(n);
    return out;
  }
  function termLabel(n) { return 'Term ' + n; }
  function currentTermNo() { return Math.floor(new Date().getMonth() / 3) + 1; }

  /* ---------------------------------------------------------
     1. SEED DATA — the boarders from the hostel document
     --------------------------------------------------------- */
  var SEED_BOARDERS = [
    ['Gaoorwe, Arancha', 8, 1], ['Kwenamore, Chriseldah', 8, 2],
    ['Mshengu, Owetu', 9, 3], ['Motlele, Omogolo', 9, 4],
    ['Bonnanye Warona', 8, 6], ['Moamogwa Koketso', 8, 7],
    ['Mokwena Resego', 9, 8], ['Malothane, Khanyiswa', 8, 10],
    ['Dyasi, Lelethu', 8, 11], ['Hlonolofatso, Nhloma', 9, 12],
    ['Motlasuping Peo', 9, 13], ['Montshiwa Didintle', 12, 17],
    ['Tlisane, Tshireletso', 12, 18], ['Lethu Msengana', 12, 19],
    ['Sekati, Rorisang', 12, 23], ['Moloi, Ratolame', 12, 25],
    ['Toolo, Olerato', 12, 26], ['Makade Zingi', 10, 34],
    ['Sekati, Thandiswa', 10, 36], ['Dube, Owame', 10, 37],
    ['Dasoi Realeboga & Mokgabi Reneilwe', 10, 38], ['Kholoholo, Nthabeleng', 11, 39],
    ['Montwedi Orefile', 11, 40], ['Oratile, Tladi', 10, 42],
    ['Mnqathula, Tshedimosetso', 11, 43], ['Oganne, Mampho', 11, 44],
    ['Dintwe, Khumo', 10, 45], ['Bhiyo, Nolitha', 11, 46],
    ['Rasaleka, Realeboga', 11, 47], ['Mphahlele, Lethabo', 10, 48],
    ['Mogaetsho, Junior', 8, 50], ['Druitt, Christopher', 12, 51],
    ['Mancwe Rebaone', 11, 52], ['Seepamore, Botlhale', 12, 53],
    ['Bantseke Agobakwe', 11, 54], ['Malo Dingi', 10, 55],
    ['Msimango Omphemetse', 12, 57], ['Kgomongwe Malebo', 10, 58],
    ['Tshabalala Luyanda', 10, 59], ['Shole Karabo', 8, 60],
    ['Danxa, Akhanani', 9, 61], ['Moeketsi Moeketsi', 9, 62],
    ['Nkhwa Tinashe', 9, 63], ['Debrah Dederick', 9, 64]
  ];

  /* Incident types used across the app (points are signed) */
  var INCIDENT_TYPES = {
    merit:   { label: 'Merit',            points: 2,  cls: 'green' },
    demerit: { label: 'Demerit',          points: -2, cls: 'red'   },
    late:    { label: 'Late Coming',      points: -2, cls: 'amber' },
    room:    { label: 'Untidy Room',      points: -1, cls: 'amber' }
  };

  /* ---------------------------------------------------------
     2. SMALL UTILITIES
     --------------------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function todayKey(d) {
    var t = d ? new Date(d) : new Date();
    var m = String(t.getMonth() + 1).padStart(2, '0');
    var day = String(t.getDate()).padStart(2, '0');
    return t.getFullYear() + '-' + m + '-' + day;
  }
  function prettyDate(key) {
    var p = String(key).split('-');
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Number(p[2]) + ' ' + months[Number(p[1]) - 1] + ' ' + p[0];
  }
  function surnameOf(name) {
    if (name.indexOf(',') > -1) return name.split(',')[0].trim();
    return name.split('&')[0].trim().split(' ')[0];
  }
  function uid(prefix) { return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9); }

  /* ---------------------------------------------------------
     3. STATE
     --------------------------------------------------------- */
  var state;
  var session = null;          // { id, name, role }

  var ui = {
    view: 'dashboard',
    grade: 'all',
    term: currentTermNo(),      // which term the roll call is being taken for
    search: '',
    attDate: todayKey(),
    roomDate: todayKey(),
    parentSearch: '',
    bookingSearch: ''
  };

  function seedRooms() {
    var out = [];
    for (var n = 1; n <= ROOM_COUNT; n++) out.push({ number: n, label: 'Room ' + n });
    return out;
  }

  function seedState() {
    var boarders = SEED_BOARDERS.map(function (b, i) {
      return { id: 'b' + (i + 1), name: b[0], grade: b[1], room: b[2], parentId: 'p' + (i + 1), terms: allTerms() };
    });
    var parents = {};
    boarders.forEach(function (b, i) {
      var sn = surnameOf(b.name);
      var multi = b.name.indexOf('&') > -1;
      parents['p' + (i + 1)] = {
        name: 'Mr/Ms ' + sn,
        relation: multi ? 'Parents' : 'Parent/Guardian',
        phone: DEFAULT_PHONE, altPhone: '', email: '', note: ''
      };
    });
    return {
      version: 2,
      updatedAt: 0,                    // 0 = this is a fresh seed, the cloud wins
      settings: {
        duty: OWNER_NAME,
        shiftStarted: new Date().toISOString()
      },
      staff: [
        { id: 's1', name: OWNER_NAME, pin: '', role: 'owner', active: true }
      ],
      rooms: seedRooms(),
      boarders: boarders,
      parents: parents,
      incidents: [],
      attendance: {},
      roomChecks: {},
      messages: [],
      bookings: [
        {
          id: uid('bk'), learner: 'Mokoena, Lesedi', grade: 8,
          parent: 'Mr/Ms Mokoena', phone: DEFAULT_PHONE, status: 'pending',
          submitted: todayKey(Date.now() - 8 * 864e5),
          note: 'Sample record — replace with the real enrolment details.'
        },
        {
          id: uid('bk'), learner: 'Nkosi, Bandile', grade: 9,
          parent: 'Mr/Ms Nkosi', phone: DEFAULT_PHONE, status: 'confirmed',
          submitted: todayKey(Date.now() - 15 * 864e5),
          note: 'Sample record — room allocated.'
        }
      ]
    };
  }

  /* Makes sure a payload from the cloud (or an older local copy) has every
     collection this version of the app expects. */
  function normalize(s) {
    if (!s || typeof s !== 'object') return seedState();
    var base = seedState();
    s.settings  = Object.assign({}, base.settings, s.settings || {});
    if (!Array.isArray(s.staff) || !s.staff.length) s.staff = base.staff;
    if (!Array.isArray(s.rooms) || !s.rooms.length) s.rooms = base.rooms;
    if (!Array.isArray(s.boarders)) s.boarders = [];
    // every learner needs a term enrolment list (Term 1–4)
    s.boarders.forEach(function (b) {
      if (!Array.isArray(b.terms)) b.terms = [];
      b.terms = b.terms.map(Number).filter(function (n) { return n >= 1 && n <= TERM_COUNT; });
      if (!b.terms.length) b.terms = allTerms();
    });
    if (!s.parents || typeof s.parents !== 'object') s.parents = {};
    if (!Array.isArray(s.incidents)) s.incidents = [];
    if (!s.attendance || typeof s.attendance !== 'object') s.attendance = {};
    else {
      // older builds kept roll call as { date: {...} }; move it under Term 1
      var aKeys = Object.keys(s.attendance);
      var datesOnly = aKeys.length > 0 && aKeys.every(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); });
      if (datesOnly) s.attendance = { '1': s.attendance };
    }
    if (!s.roomChecks || typeof s.roomChecks !== 'object') s.roomChecks = {};
    if (!Array.isArray(s.messages)) s.messages = [];
    if (!Array.isArray(s.bookings)) s.bookings = [];
    if (typeof s.updatedAt !== 'number') s.updatedAt = 0;
    // the owner account must always exist
    if (!s.staff.some(function (x) { return x.role === 'owner'; })) {
      s.staff.unshift({ id: 's1', name: OWNER_NAME, pin: '', role: 'owner', active: true });
    }
    return s;
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* corrupt store — fall through to seed */ }
    return seedState();
  }
  function persistLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Storage full — export a report and clear old photos.'); }
  }
  function saveState() {
    state.updatedAt = Date.now();
    persistLocal();
    schedulePush();
  }
  function saveStateQuiet() { saveState(); }

  /* ---------------------------------------------------------
     4. ROLE HELPERS
     --------------------------------------------------------- */
  function isOwner() { return !!session && session.role === 'owner'; }
  function isSignedIn() { return !!session; }
  function requireOwner() {
    if (isOwner()) return true;
    toast('Only ' + OWNER_NAME + ' (owner) can do that.');
    return false;
  }
  function currentStaffName() { return session ? session.name : '—'; }
  function occupantsOf(roomNumber) {
    return state.boarders.filter(function (b) { return Number(b.room) === Number(roomNumber); });
  }

  /* ---------------------------------------------------------
     5. CLOUD SYNC — every phone shares one dataset
     --------------------------------------------------------- */
  function cloudHeaders() {
    return {
      'apikey': CLOUD_KEY,
      'Authorization': 'Bearer ' + CLOUD_KEY,
      'Content-Type': 'application/json'
    };
  }
  function cloudPull() {
    return fetch(CLOUD_URL + '?key=eq.' + encodeURIComponent(CLOUD_ROW) + '&select=data',
      { headers: cloudHeaders(), cache: 'no-store' }
    ).then(function (r) {
      if (!r.ok) throw new Error('pull ' + r.status);
      return r.json();
    }).then(function (rows) {
      return rows && rows[0] && rows[0].data ? rows[0].data : null;
    });
  }
  function cloudPush(payload) {
    return fetch(CLOUD_URL + '?on_conflict=key', {
      method: 'POST',
      headers: Object.assign(cloudHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([{ key: CLOUD_ROW, data: payload, updated_at: new Date().toISOString() }])
    }).then(function (r) {
      if (!r.ok) throw new Error('push ' + r.status);
      return true;
    });
  }

  function setSync(kind, text) {
    var el = $('#syncPill');
    if (!el) return;
    var map = { live: 'pill--green', offline: 'pill--red', syncing: 'pill--amber', local: 'pill--muted' };
    el.className = 'pill ' + (map[kind] || 'pill--muted');
    el.innerHTML = '<span class="dot"></span> ' + esc(text ||
      ({ live: 'Live sync', offline: 'Offline', syncing: 'Syncing…', local: 'Local only' }[kind] || ''));
  }

  var pushTimer = null, pushing = false, pushAgain = false;
  var cloudReady = false;      // true once we have seen the shared dataset
  function schedulePush() {
    if (!isSignedIn() || !cloudReady) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, 1200);
  }
  function doPush() {
    if (!isSignedIn() || !cloudReady) return;
    if (pushing) { pushAgain = true; return; }
    pushing = true;
    setSync('syncing');
    cloudPush(state).then(function () {
      setSync('live');
    }).catch(function () {
      setSync('offline');
    }).then(function () {
      pushing = false;
      if (pushAgain) { pushAgain = false; doPush(); }
    });
  }
  function pullOnce(silent) {
    if (document.querySelector('.modal:not([hidden])')) return Promise.resolve();
    return cloudPull().then(function (remote) {
      cloudReady = true;
      if (remote && typeof remote.updatedAt === 'number' &&
          remote.updatedAt > (state.updatedAt || 0) + 400) {
        state = normalize(remote);
        persistLocal();
        // waiting at the sign-in screen: refresh the staff list it shows
        if (!session) {
          if (staffSignature() !== gateSig) renderGate();
          setSync('live');
          return;
        }
        // the owner may have removed or disabled this account on another phone
        var still = state.staff.find(function (x) { return x.id === session.id && x.active !== false; });
        if (!still) {
          session = null;
          localStorage.removeItem(SESSION_KEY);
          stopPolling();
          syncHeader();
          renderGate();
          toast('Your account was changed — please sign in again');
          return;
        }
        session.role = still.role;
        session.name = still.name;
        syncHeader();
        render();
        if (!silent) toast('Synced from another device');
      }
      setSync('live');
    }).catch(function () { setSync('offline'); });
  }

  var pollTimer = null;
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function () {
      if (document.hidden) return;
      pullOnce(true);           // signed in or still at the sign-in screen
    }, POLL_MS);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  /* ---------------------------------------------------------
     6. DERIVED HELPERS
     --------------------------------------------------------- */
  function netPoints(boarder) {
    var sum = BASE_POINTS;
    state.incidents.forEach(function (inc) {
      if (inc.boarderId === boarder.id) sum += inc.points;
    });
    return sum;
  }
  function incidentsFor(boarderId) {
    return state.incidents.filter(function (i) { return i.boarderId === boarderId; });
  }
  function recentIncidentText(boarderId) {
    var list = incidentsFor(boarderId);
    if (!list.length) return 'No recent infractions';
    var last = list[list.length - 1];
    var sign = last.points > 0 ? '+' : '';
    return last.type === 'merit'
      ? 'Merit ' + sign + last.points + ' pts' + (last.note ? ' • ' + last.note : '')
      : (INCIDENT_TYPES[last.type] ? INCIDENT_TYPES[last.type].label : 'Incident') +
        ' ' + sign + last.points + ' pts' + (last.note ? ' • ' + last.note : '');
  }
  function todayIncidentCount(type) {
    var today = todayKey();
    return state.incidents.filter(function (i) {
      return i.type === type && String(i.at).slice(0, 10) === today;
    }).length;
  }
  /* Roll call is stored per term, then per date: attendance[term][date][boarderId] */
  function attendanceFor(term, dateKey) {
    var t = String(term);
    if (!state.attendance[t]) state.attendance[t] = {};
    if (!state.attendance[t][dateKey]) state.attendance[t][dateKey] = {};
    return state.attendance[t][dateKey];
  }
  function attStatus(boarder, term, dateKey) {
    var day = attendanceFor(term, dateKey);
    return (day[boarder.id] && day[boarder.id].status) || 'present';
  }
  /* Learners enrolled for a given term, in roster order. */
  function termBoarders(term) {
    return state.boarders.filter(function (b) {
      return !b.terms || b.terms.indexOf(Number(term)) > -1;
    });
  }
  function termMark(term, sel) {
    return '<button type="button" data-action="term" data-term="' + term + '" class="' +
      (Number(sel) === Number(term) ? 'is-on' : '') + '">' + termLabel(term) + '</button>';
  }
  function termListText(b) {
    var t = (b.terms || allTerms()).slice().sort(function (a, c) { return a - c; });
    return t.map(function (n) { return 'T' + n; }).join('/');
  }
  /* Tick-boxes for a learner's term enrolment (used in the learner modals). */
  function termCheckboxes(selected, idPrefix) {
    var sel = (selected || allTerms()).map(Number);
    return allTerms().map(function (n) {
      return '<label class="termchk"><input type="checkbox" id="' + idPrefix + 'T' + n + '" value="' + n + '"' +
        (sel.indexOf(n) > -1 ? ' checked' : '') + '> ' + termLabel(n) + '</label>';
    }).join('');
  }
  function readTermCheckboxes(root, idPrefix) {
    return allTerms().filter(function (n) {
      var el = $('#' + idPrefix + 'T' + n, root);
      return el && el.checked;
    });
  }
  function roomChecksFor(dateKey) {
    if (!state.roomChecks[dateKey]) state.roomChecks[dateKey] = {};
    return state.roomChecks[dateKey];
  }
  function roomStatus(room, dateKey) {
    var day = roomChecksFor(dateKey);
    return (day[room] && day[room].status) || 'tidy';
  }
  function filteredBoarders() {
    return state.boarders.filter(function (b) {
      if (ui.grade !== 'all' && String(b.grade) !== String(ui.grade)) return false;
      if (ui.search && b.name.toLowerCase().indexOf(ui.search.toLowerCase()) === -1) return false;
      return true;
    });
  }
  function roomLabel(n) {
    var r = state.rooms.find(function (x) { return Number(x.number) === Number(n); });
    return r ? r.label : 'Room ' + n;
  }
  function roomOptions(selected) {
    return state.rooms.map(function (r) {
      var use = occupantsOf(r.number).length;
      return '<option value="' + r.number + '"' + (Number(selected) === Number(r.number) ? ' selected' : '') + '>' +
        esc(r.label) + ' — ' + use + ' learner' + (use === 1 ? '' : 's') + '</option>';
    }).join('');
  }

  /* ---------------------------------------------------------
     7. UI PRIMITIVES — toast, modal
     --------------------------------------------------------- */
  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function openModal(title, bodyHTML, onMount) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHTML;
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
    if (onMount) onMount($('#modalBody'));
  }
  function closeModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------------------------------------------------------
     8. VIEW RENDERERS
     --------------------------------------------------------- */

  /* ---- Dashboard ---- */
  function renderDashboard() {
    var total = state.boarders.length;
    var rooms = state.rooms.length;
    var demerits = todayIncidentCount('demerit');
    var lates = todayIncidentCount('late');
    var roomsDone = Object.keys(roomChecksFor(ui.roomDate)).filter(function (k) {
      return state.rooms.some(function (r) { return String(r.number) === String(k); });
    }).length;
    var bookings = state.bookings;
    var pending = bookings.filter(function (b) { return b.status === 'pending'; }).length;

    var recent = state.incidents.slice(-8).reverse();
    var recentRows = recent.length
      ? recent.map(function (inc) {
          var b = state.boarders.find(function (x) { return x.id === inc.boarderId; });
          var t = INCIDENT_TYPES[inc.type] || { label: 'Incident', cls: 'muted' };
          var p = (inc.points > 0 ? '+' : '') + inc.points;
          return '<tr>' +
            '<td data-label="Boarder" class="td-strong">' + esc(b ? b.name : '—') + '</td>' +
            '<td data-label="Type" class="td-muted">' + esc(t.label) + (inc.note ? ' — ' + esc(inc.note) : '') + '</td>' +
            '<td data-label="Points" class="' + (inc.points >= 0 ? 'pts-pos' : 'pts-neg') + '">' + p + ' pts</td>' +
            '<td data-label="Staff" class="td-muted">' + esc(inc.staff || '—') + '</td>' +
            '<td data-label="Time" class="td-muted">' + esc(new Date(inc.at).toLocaleString()) + '</td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="5" class="empty">No incidents logged yet.</td></tr>';

    var pct = rooms ? Math.round((roomsDone / rooms) * 100) : 0;

    var latest = state.messages.length ? state.messages[state.messages.length - 1] : null;
    var banner = latest
      ? '<div class="notice notice--msg"><strong>📣 Broadcast — ' + esc(latest.staff) +
        ' • ' + esc(new Date(latest.at).toLocaleString()) + '</strong><br>' + esc(latest.text) + '</div>'
      : '';

    return '' +
      '<div class="section-head">' +
        '<h2>Hostel Operational Hub</h2>' +
        '<p>Managing daily discipline, roll call, photo room inspections, parent records, and 2027 enrolments.</p>' +
      '</div>' +
      banner +
      '<div class="row" style="margin-bottom:16px">' +
        '<button class="btn btn--primary" data-action="log-picker">＋ Log Merit/Demerit</button>' +
        '<button class="btn btn--ghost" data-action="go" data-view="broadcast">📣 Broadcast</button>' +
        '<button class="btn btn--ghost" data-action="export-report">⬇ Export Report</button>' +
      '</div>' +

      '<div class="stats">' +
        '<div class="stat"><div class="stat__label">Total Boarders</div>' +
          '<div class="stat__value">' + total + '</div><div class="stat__sub">Active roster</div></div>' +
        '<div class="stat stat--red"><div class="stat__label">Demerits Logged</div>' +
          '<div class="stat__value">' + demerits + '</div><div class="stat__sub">Today\'s record</div></div>' +
        '<div class="stat stat--amber"><div class="stat__label">Late Comings</div>' +
          '<div class="stat__value">' + lates + '</div><div class="stat__sub">Today\'s record</div></div>' +
        '<div class="stat stat--blue"><div class="stat__label">2027 Bookings</div>' +
          '<div class="stat__value">' + bookings.length + '</div>' +
          '<div class="stat__sub">' + pending + ' pending</div></div>' +
      '</div>' +

      '<section class="card">' +
        '<div class="card__head"><h3>Recent Staff Log &amp; Incidents</h3></div>' +
        '<div class="tablewrap"><table class="responsive"><thead><tr>' +
          '<th>Boarder</th><th>Type / Infraction</th><th>Points</th><th>Staff</th><th>Time</th>' +
        '</tr></thead><tbody>' + recentRows + '</tbody></table></div>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card__head"><h3>Room Inspection Overview</h3></div>' +
        '<div class="row" style="justify-content:space-between">' +
          '<span class="card__hint">Rooms checked on ' + esc(prettyDate(ui.roomDate)) + '</span>' +
          '<strong>' + roomsDone + ' / ' + rooms + '</strong>' +
        '</div>' +
        '<div class="progress"><div class="progress__bar" style="width:' + pct + '%"></div></div>' +
        '<div class="notice" style="margin-top:14px">' +
          '<strong>🏠 Hostel Rule Reminder:</strong> Room inspections must be concluded before 08:00 AM. ' +
          'Snap and save photos directly next to learner records.' +
        '</div>' +
        '<button class="btn btn--primary" data-action="go" data-view="rooms">Open Room Inspections</button>' +
      '</section>';
  }

  /* ---- Merit & Demerit Ledger ---- */
  function renderMerits() {
    var rows = filteredBoarders().map(function (b) {
      var pts = netPoints(b);
      var cls = pts > BASE_POINTS ? 'pts-pos' : (pts < BASE_POINTS ? 'pts-neg' : 'pts-zero');
      var extra = isOwner()
        ? '<button class="btn btn--ghost btn--sm" data-action="move" data-id="' + b.id + '">Move</button>' +
          '<button class="btn btn--ghost btn--sm" data-action="edit-learner" data-id="' + b.id + '">Edit</button>'
        : '';
      return '<tr>' +
        '<td data-label="Boarder" class="td-strong">' + esc(b.name) + '</td>' +
        '<td data-label="Grade &amp; Room" class="td-muted">Grade ' + b.grade + ' • ' + esc(roomLabel(b.room)) + '</td>' +
        '<td data-label="Net Points" class="' + cls + '">' + pts + ' pts</td>' +
        '<td data-label="Recent" class="td-muted">' + esc(recentIncidentText(b.id)) + '</td>' +
        '<td data-label="Actions"><div class="row" style="gap:8px">' +
          '<button class="btn btn--primary btn--sm" data-action="log" data-id="' + b.id + '">Log</button>' +
          extra +
        '</div></td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="section-head">' +
        '<h2>Merit &amp; Demerit Ledger</h2>' +
        '<p>Track discipline, late comings, room cleanliness, and merits for all boarders.</p>' +
      '</div>' +
      '<div class="filterbar">' +
        '<div class="searchwrap"><input type="text" id="meritSearch" placeholder="Search boarder…" value="' + esc(ui.search) + '"></div>' +
        '<select id="meritGrade">' + gradeOptions() + '</select>' +
        (isOwner() ? '<button class="btn btn--gold" data-action="add-learner">＋ Add Learner</button>' : '<span></span>') +
      '</div>' +
      (isOwner() ? '' : '<div class="notice">Only ' + esc(OWNER_NAME) + ' can add learners, change details or move learners between rooms.</div>') +
      (rows ? '<section class="card"><div class="tablewrap"><table class="responsive"><thead><tr>' +
        '<th>Boarder Name</th><th>Grade &amp; Room</th><th>Net Points</th><th>Recent Incidents / Notes</th><th>Actions</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div></section>'
        : '<section class="card"><p class="empty">No boarders match this filter.</p></section>');
  }

  function gradeOptions() {
    var out = '<option value="all"' + (ui.grade === 'all' ? ' selected' : '') + '>All Grades</option>';
    [8, 9, 10, 11, 12].forEach(function (g) {
      out += '<option value="' + g + '"' + (String(ui.grade) === String(g) ? ' selected' : '') + '>Grade ' + g + '</option>';
    });
    return out;
  }

  /* ---- Roll Call — one list per term (Term 1–4) ---- */
  function renderAttendance() {
    var term = ui.term;
    var roster = termBoarders(term);
    var day = attendanceFor(term, ui.attDate);
    var present = 0, absent = 0, late = 0;
    roster.forEach(function (b) {
      var s = attStatus(b, term, ui.attDate);
      if (s === 'present') present++;
      else if (s === 'absent') absent++;
      else late++;
    });

    var rows = roster.map(function (b) {
      var s = attStatus(b, term, ui.attDate);
      var rec = day[b.id] || {};
      return '<tr>' +
        '<td data-label="Boarder" class="td-strong">' + esc(b.name) + '</td>' +
        '<td data-label="Grade &amp; Room" class="td-muted">Grade ' + b.grade + ' • ' + esc(roomLabel(b.room)) + '</td>' +
        '<td data-label="Notes">' +
          '<input type="text" data-action="late-time" data-id="' + b.id + '" placeholder="Late time / notes" value="' + esc(rec.lateTime || '') + '">' +
        '</td>' +
        '<td data-label="Status">' +
          '<span class="seg">' +
            '<button type="button" data-action="att" data-id="' + b.id + '" data-status="present" data-on="present" class="' + (s === 'present' ? 'is-on' : '') + '">Present</button>' +
            '<button type="button" data-action="att" data-id="' + b.id + '" data-status="late" data-on="late" class="' + (s === 'late' ? 'is-on' : '') + '">Late</button>' +
            '<button type="button" data-action="att" data-id="' + b.id + '" data-status="absent" data-on="absent" class="' + (s === 'absent' ? 'is-on' : '') + '">Absent</button>' +
          '</span>' +
        '</td>' +
        '</tr>';
    }).join('');

    var termBar = '<span class="seg seg--terms">' +
      allTerms().map(function (n) { return termMark(n, term); }).join('') + '</span>';

    return '' +
      '<div class="section-head">' +
        '<h2>Roll Call — ' + esc(termLabel(term)) + '</h2>' +
        '<p>Take the daily roll call for ' + esc(termLabel(term)) + '. Each term keeps its own list and its own records.</p>' +
      '</div>' +
      '<div class="filterbar" style="grid-template-columns:1fr">' +
        '<div><label>School term</label>' + termBar + '</div>' +
        '<div><label>Roll call date</label><input type="date" id="attDate" value="' + ui.attDate + '"></div>' +
      '</div>' +
      '<div class="stats" style="grid-template-columns:repeat(3,1fr)">' +
        '<div class="stat stat--green"><div class="stat__label">Present</div><div class="stat__value">' + present + '</div></div>' +
        '<div class="stat stat--red"><div class="stat__label">Absent</div><div class="stat__value">' + absent + '</div></div>' +
        '<div class="stat stat--amber"><div class="stat__label">Late Coming</div><div class="stat__value">' + late + '</div></div>' +
      '</div>' +
      '<div class="row" style="margin-bottom:14px">' +
        '<button class="btn btn--ghost" data-action="att-all">✓ Mark all present</button>' +
        '<span class="card__hint">' + roster.length + ' learner' + (roster.length === 1 ? '' : 's') + ' in ' + esc(termLabel(term)) + '</span>' +
      '</div>' +
      (rows
        ? '<section class="card"><div class="tablewrap"><table class="responsive"><thead><tr>' +
            '<th>Boarder Name</th><th>Grade &amp; Room</th><th>Late Time / Notes</th><th>Status</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div></section>'
        : '<section class="card"><p class="empty">No learners are enrolled for ' + esc(termLabel(term)) +
          ' yet. ' + esc(OWNER_NAME) + ' can set a learner\'s terms on their record.</p></section>');
  }

  /* ---- Room Checks — EVERY room, occupied or not ---- */
  function renderRooms() {
    var day = roomChecksFor(ui.roomDate);
    var tidy = 0, untidy = 0;
    state.rooms.forEach(function (r) {
      if ((day[r.number] && day[r.number].status) === 'untidy') untidy++; else tidy++;
    });

    var rows = state.rooms.map(function (r) {
      var rec = day[r.number] || {};
      var st = rec.status || 'tidy';
      var occ = occupantsOf(r.number);
      var occHTML = occ.length
        ? occ.map(function (b) { return esc(b.name); }).join('<br>')
        : '<span class="td-muted">Unoccupied</span>';
      var photo = rec.photo
        ? '<img class="thumb" src="' + rec.photo + '" alt="Room ' + r.number + ' photo" data-action="view-photo" data-room="' + r.number + '">'
        : '';
      var manage = isOwner()
        ? '<button type="button" class="btn btn--ghost btn--sm" data-action="room-manage" data-room="' + r.number + '">👥 Manage</button>'
        : '';
      return '<tr>' +
        '<td data-label="Room" class="td-strong">' + esc(r.label) + '</td>' +
        '<td data-label="Occupants" class="td-muted">' + occHTML + (manage ? '<div style="margin-top:8px">' + manage + '</div>' : '') + '</td>' +
        '<td data-label="Status">' +
          '<span class="seg">' +
            '<button type="button" data-action="room" data-room="' + r.number + '" data-status="tidy" data-on="tidy" class="' + (st === 'tidy' ? 'is-on' : '') + '">Tidy</button>' +
            '<button type="button" data-action="room" data-room="' + r.number + '" data-status="untidy" data-on="untidy" class="' + (st === 'untidy' ? 'is-on' : '') + '">Not Tidy</button>' +
          '</span>' +
        '</td>' +
        '<td data-label="Camera Photo"><div class="row" style="gap:8px">' +
          '<button type="button" class="snapbtn" data-action="snap" data-room="' + r.number + '">📷 Snap</button>' + photo +
        '</div></td>' +
        '<td data-label="Inspector Notes"><input type="text" data-action="room-note" data-room="' + r.number + '" placeholder="Notes…" value="' + esc(rec.note || '') + '"></td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="section-head">' +
        '<h2>Room Inspection &amp; Camera Capture</h2>' +
        '<p>Every room is listed whether it is occupied or not. Record tidiness (−1 pt per learner for untidy rooms) and snap photos.</p>' +
      '</div>' +
      '<div class="filterbar" style="grid-template-columns:1fr">' +
        '<div><label>Inspection date</label><input type="date" id="roomDate" value="' + ui.roomDate + '"></div>' +
      '</div>' +
      '<div class="stats" style="grid-template-columns:repeat(3,1fr)">' +
        '<div class="stat"><div class="stat__label">Rooms</div><div class="stat__value">' + state.rooms.length + '</div></div>' +
        '<div class="stat stat--green"><div class="stat__label">Tidy Rooms</div><div class="stat__value">' + tidy + '</div></div>' +
        '<div class="stat stat--red"><div class="stat__label">Untidy / Issues</div><div class="stat__value">' + untidy + '</div></div>' +
      '</div>' +
      '<section class="card"><div class="tablewrap"><table class="responsive"><thead><tr>' +
        '<th>Room</th><th>Occupants</th><th>Inspection Status</th><th>Camera Photo</th><th>Inspector Notes</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  /* ---- Rooms screen — owner manages the room inventory ---- */
  function renderRoomsAdmin() {
    if (!isOwner()) {
      return '<section class="card"><p class="empty">Only ' + esc(OWNER_NAME) + ' can manage the room list.</p></section>';
    }
    var used = 0;
    var rows = state.rooms.slice().sort(function (a, b) { return a.number - b.number; }).map(function (r) {
      var occ = occupantsOf(r.number);
      if (occ.length) used++;
      return '<tr>' +
        '<td data-label="Room" class="td-strong">' + esc(r.label) + '<br><span class="td-muted" style="font-weight:500">Number ' + r.number + '</span></td>' +
        '<td data-label="Occupants" class="td-muted">' + (occ.length ? occ.length + ' in room' : 'Free') +
          (occ.length ? '<br>' + occ.map(function (b) { return esc(b.name); }).join('<br>') : '') + '</td>' +
        '<td data-label="Actions"><div class="row" style="gap:8px">' +
          '<button class="btn btn--ghost btn--sm" data-action="room-edit" data-room="' + r.number + '">Rename</button>' +
          '<button class="btn btn--red btn--sm" data-action="room-delete" data-room="' + r.number + '">Remove</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="section-head">' +
        '<h2>Rooms</h2>' +
        '<p>Your hostel room list. Add, rename or remove rooms — Room Checks always shows this exact list.</p>' +
      '</div>' +
      '<div class="row" style="margin-bottom:16px">' +
        '<button class="btn btn--gold" data-action="room-add">＋ Add Room</button>' +
        '<button class="btn btn--ghost" data-action="export-report">⬇ Export Report</button>' +
      '</div>' +
      '<div class="stats" style="grid-template-columns:repeat(3,1fr)">' +
        '<div class="stat"><div class="stat__label">Total Rooms</div><div class="stat__value">' + state.rooms.length + '</div></div>' +
        '<div class="stat stat--blue"><div class="stat__label">In Use</div><div class="stat__value">' + used + '</div></div>' +
        '<div class="stat stat--green"><div class="stat__label">Free</div><div class="stat__value">' + (state.rooms.length - used) + '</div></div>' +
      '</div>' +
      '<section class="card"><div class="tablewrap"><table class="responsive"><thead><tr>' +
        '<th>Room</th><th>Occupants</th><th>Actions</th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="3" class="empty">No rooms yet — add one.</td></tr>') + '</tbody></table></div></section>';
  }

  /* ---- Parents ---- */
  function renderParents() {
    var q = ui.parentSearch.toLowerCase();
    var rows = state.boarders.filter(function (b) {
      if (!q) return true;
      var p = state.parents[b.parentId] || {};
      return b.name.toLowerCase().indexOf(q) > -1 ||
             (p.name || '').toLowerCase().indexOf(q) > -1 ||
             (p.phone || '').indexOf(q) > -1;
    }).map(function (b) {
      var p = state.parents[b.parentId] || { name: 'Mr/Ms ' + surnameOf(b.name), relation: 'Parent/Guardian', phone: DEFAULT_PHONE };
      var tel = (p.phone || '').replace(/\s+/g, '');
      return '<tr>' +
        '<td data-label="Learner" class="td-strong">' + esc(b.name) + '</td>' +
        '<td data-label="Grade &amp; Room" class="td-muted">Grade ' + b.grade + ' • ' + esc(roomLabel(b.room)) + '</td>' +
        '<td data-label="Parent / Guardian">' + esc(p.name) + ' • ' + esc(p.phone || DEFAULT_PHONE) + ' • ' + esc(p.relation) +
          ((p.altPhone || p.email) ? '<br><span class="td-muted">' + esc(p.altPhone || '') + (p.email ? ' • ' + esc(p.email) : '') + '</span>' : '') + '</td>' +
        '<td data-label="Quick Actions"><div class="row" style="gap:8px">' +
          '<a class="btn btn--green btn--sm" href="tel:' + esc(tel) + '">📞 Call Parent</a>' +
          (isOwner() ? '<button class="btn btn--ghost btn--sm" data-action="edit-learner" data-id="' + b.id + '">Edit</button>' : '') +
        '</div></td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="section-head">' +
        '<h2>Parent &amp; Guardian Directory</h2>' +
        '<p>View parent contact details and emergency communication info for each learner.</p>' +
      '</div>' +
      '<div class="filterbar" style="grid-template-columns:1fr">' +
        '<div class="searchwrap"><input type="text" id="parentSearch" placeholder="Search learner, parent or number…" value="' + esc(ui.parentSearch) + '"></div>' +
      '</div>' +
      (isOwner() ? '' : '<div class="notice">Only ' + esc(OWNER_NAME) + ' can edit learner or parent details.</div>') +
      '<section class="card"><div class="tablewrap"><table class="responsive"><thead><tr>' +
        '<th>Learner Name</th><th>Grade &amp; Room</th><th>Parent / Guardian Details</th><th>Quick Actions</th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="4" class="empty">No matching records.</td></tr>') + '</tbody></table></div></section>';
  }

  /* ---- 2027 Bookings ---- */
  function renderBookings() {
    var total = state.bookings.length;
    var pending = state.bookings.filter(function (b) { return b.status === 'pending'; }).length;
    var confirmed = state.bookings.filter(function (b) { return b.status === 'confirmed'; }).length;

    var q = ui.bookingSearch.toLowerCase();
    var rows = state.bookings.filter(function (b) {
      return !q || (b.learner + ' ' + b.parent + ' ' + b.phone).toLowerCase().indexOf(q) > -1;
    }).map(function (b) {
      var badge = b.status === 'confirmed'
        ? '<span class="pill pill--green">Confirmed</span>'
        : (b.status === 'declined' ? '<span class="pill pill--red">Declined</span>' : '<span class="pill pill--amber">Pending</span>');
      var actions = isOwner()
        ? '<div class="row" style="gap:8px">' +
            '<button class="btn btn--green btn--sm" data-action="booking-status" data-id="' + b.id + '" data-status="confirmed">Confirm</button>' +
            '<button class="btn btn--ghost btn--sm" data-action="booking-status" data-id="' + b.id + '" data-status="pending">Pending</button>' +
            '<button class="btn btn--red btn--sm" data-action="booking-delete" data-id="' + b.id + '">Delete</button>' +
          '</div>'
        : '<span class="td-muted">View only</span>';
      return '<tr>' +
        '<td data-label="Learner" class="td-strong">' + esc(b.learner) + '<br><span class="td-muted" style="font-weight:500">Grade ' + esc(b.grade) + '</span></td>' +
        '<td data-label="Parent" class="td-muted">' + esc(b.parent) + ' • ' + esc(b.phone) + '</td>' +
        '<td data-label="Status">' + badge + '</td>' +
        '<td data-label="Submitted" class="td-muted">' + esc(prettyDate(b.submitted)) + '</td>' +
        '<td data-label="Actions">' + actions + '</td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="section-head">' +
        '<h2>2027 Enrolment Bookings</h2>' +
        '<p>Capture and track 2027 hostel applications, confirm placements and keep parent contacts on file.</p>' +
      '</div>' +
      '<div class="row" style="margin-bottom:16px">' +
        (isOwner() ? '<button class="btn btn--primary" data-action="add-booking">＋ New 2027 Booking</button>' : '') +
        '<button class="btn btn--ghost" data-action="export-report">⬇ Export Report</button>' +
      '</div>' +
      '<div class="stats" style="grid-template-columns:repeat(3,1fr)">' +
        '<div class="stat stat--blue"><div class="stat__label">Total Bookings</div><div class="stat__value">' + total + '</div></div>' +
        '<div class="stat stat--amber"><div class="stat__label">Pending</div><div class="stat__value">' + pending + '</div></div>' +
        '<div class="stat stat--green"><div class="stat__label">Confirmed</div><div class="stat__value">' + confirmed + '</div></div>' +
      '</div>' +
      '<div class="filterbar" style="grid-template-columns:1fr">' +
        '<div class="searchwrap"><input type="text" id="bookingSearch" placeholder="Search bookings…" value="' + esc(ui.bookingSearch) + '"></div>' +
      '</div>' +
      '<section class="card"><div class="tablewrap"><table class="responsive"><thead><tr>' +
        '<th>Learner Name</th><th>Parent / Guardian Details</th><th>Status</th><th>Submitted</th><th>Actions</th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="empty">No bookings captured yet.</td></tr>') + '</tbody></table></div></section>';
  }

  /* ---- Broadcast ---- */
  function renderBroadcast() {
    var list = state.messages.slice().reverse();
    var items = list.length ? list.map(function (m) {
      return '<div class="msg">' +
        '<div class="msg__text">' + esc(m.text) + '</div>' +
        '<div class="msg__meta">' + esc(m.staff) + ' • ' + esc(new Date(m.at).toLocaleString()) +
          (isOwner() ? '<button class="linkbtn msg__del" data-action="msg-delete" data-id="' + m.id + '">Delete</button>' : '') +
        '</div>' +
        '</div>';
    }).join('') : '<p class="empty">No messages sent yet.</p>';

    return '' +
      '<div class="section-head">' +
        '<h2>Broadcast to all users</h2>' +
        '<p>Send a message to every phone signed in to the hostel app.</p>' +
      '</div>' +
      '<section class="card">' +
        '<div class="card__head"><h3>New message</h3></div>' +
        '<div class="field"><label>Sending as</label><input type="text" value="' + esc(currentStaffName()) + '" disabled></div>' +
        '<div class="field"><label>Message</label><textarea id="msgText" rows="3" placeholder="e.g. All Grade 8s to the common room at 18:00."></textarea></div>' +
        '<button class="btn btn--primary" data-action="msg-send">📣 Send to all users</button>' +
      '</section>' +
      '<section class="card">' +
        '<div class="card__head"><h3>Message history</h3></div>' +
        items +
      '</section>';
  }

  /* ---- Admin (owner only) ---- */
  function renderAdmin() {
    if (!isOwner()) {
      return '<section class="card"><p class="empty">Only ' + esc(OWNER_NAME) + ' can open administration.</p></section>';
    }
    var rows = state.staff.map(function (s) {
      return '<tr>' +
        '<td data-label="Staff member" class="td-strong">' + esc(s.name) +
          '<br><span class="td-muted" style="font-weight:500">' + (s.role === 'owner' ? 'Owner — full control' : 'Staff') + '</span></td>' +
        '<td data-label="Password">' + (s.pin ? '<span class="pill pill--green">Set</span>' : '<span class="pill pill--amber">Not set</span>') + '</td>' +
        '<td data-label="Status">' + (s.active === false ? '<span class="pill pill--muted">Disabled</span>' : '<span class="pill pill--green">Active</span>') + '</td>' +
        '<td data-label="Actions"><div class="row" style="gap:8px">' +
          '<button class="btn btn--ghost btn--sm" data-action="staff-pin" data-id="' + s.id + '">Set password</button>' +
          (s.role === 'owner' ? '<button class="btn btn--ghost btn--sm" data-action="staff-rename" data-id="' + s.id + '">Rename</button>'
            : '<button class="btn btn--ghost btn--sm" data-action="staff-rename" data-id="' + s.id + '">Rename</button>' +
              '<button class="btn btn--ghost btn--sm" data-action="staff-toggle" data-id="' + s.id + '">' + (s.active === false ? 'Enable' : 'Disable') + '</button>' +
              '<button class="btn btn--red btn--sm" data-action="staff-delete" data-id="' + s.id + '">Remove</button>') +
        '</div></td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="section-head">' +
        '<h2>Administration</h2>' +
        '<p>Owner controls — staff accounts, staff passwords and the shared data link.</p>' +
      '</div>' +

      '<section class="card">' +
        '<div class="card__head"><h3>Staff accounts</h3></div>' +
        '<p class="card__hint" style="margin-bottom:12px">Every staff member signs in with their own name and the password you set for them.</p>' +
        '<div class="tablewrap"><table class="responsive"><thead><tr>' +
          '<th>Staff member</th><th>Password</th><th>Status</th><th>Actions</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div style="margin-top:12px"><button class="btn btn--gold" data-action="staff-add">＋ Add staff member</button></div>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card__head"><h3>Hostel settings</h3></div>' +
        '<div class="field"><label>Duty officer</label><input type="text" id="setDuty" value="' + esc(state.settings.duty || '') + '"></div>' +
        '<div class="modal__actions">' +
          '<button class="btn btn--primary" data-action="settings-save">Save settings</button>' +
        '</div>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card__head"><h3>Shared data</h3></div>' +
        '<p class="card__hint">Every phone signed in reads and writes the same live dataset, so information saved on one phone appears on all of them.</p>' +
        '<div class="row" style="margin-top:10px">' +
          '<button class="btn btn--ghost" data-action="sync-now">↻ Sync now</button>' +
        '</div>' +
      '</section>';
  }

  function render(scrollTop) {
    var out = '';
    switch (ui.view) {
      case 'merits': out = renderMerits(); break;
      case 'attendance': out = renderAttendance(); break;
      case 'rooms': out = renderRooms(); break;
      case 'roomsAdmin': out = isOwner() ? renderRoomsAdmin() : renderDashboard(); break;
      case 'parents': out = renderParents(); break;
      case 'bookings': out = renderBookings(); break;
      case 'broadcast': out = renderBroadcast(); break;
      case 'admin': out = renderAdmin(); break;
      default: out = renderDashboard();
    }
    if ((ui.view === 'roomsAdmin' || ui.view === 'admin') && !isOwner()) ui.view = 'dashboard';
    $('#app').innerHTML = out;

    $$('.tab').forEach(function (t) {
      t.classList.toggle('is-active', t.dataset.view === ui.view);
    });
    if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------------------------------------------------
     9. ACTIONS
     --------------------------------------------------------- */
  function logIncident(boarderId, type, note) {
    var meta = INCIDENT_TYPES[type];
    var b = state.boarders.find(function (x) { return x.id === boarderId; });
    if (!b || !meta) return;
    state.incidents.push({
      id: uid('inc'), boarderId: boarderId, type: type, points: meta.points,
      note: note || '', staff: currentStaffName(), at: new Date().toISOString()
    });
    saveState();
    toast(meta.label + ' logged for ' + b.name);
    render();
  }

  function setAttendance(boarderId, status) {
    var day = attendanceFor(ui.term, ui.attDate);
    var rec = day[boarderId] || {};
    var prev = rec.status || 'present';
    rec.status = status;
    day[boarderId] = rec;
    if (status === 'late' && prev !== 'late') {
      state.incidents.push({
        id: uid('inc'), boarderId: boarderId, type: 'late', points: INCIDENT_TYPES.late.points,
        note: rec.lateTime || 'Flagged at roll call', staff: currentStaffName(), at: new Date().toISOString()
      });
      toast('Late coming logged (−2 pts)');
    } else if (status !== 'late' && prev === 'late') {
      state.incidents = state.incidents.filter(function (i) {
        return !(i.boarderId === boarderId && i.type === 'late' && String(i.at).slice(0, 10) === todayKey());
      });
      toast('Late coming cleared');
    } else {
      toast('Marked ' + status);
    }
    saveState();
    render();
  }

  /* Marks the whole term roster present — the usual starting point at roll call. */
  function setAllPresent() {
    var roster = termBoarders(ui.term);
    if (!roster.length) { toast('No learners enrolled for ' + termLabel(ui.term)); return; }
    var day = attendanceFor(ui.term, ui.attDate);
    roster.forEach(function (b) {
      var rec = day[b.id] || {};
      rec.status = 'present';
      day[b.id] = rec;
    });
    saveState();
    toast('All ' + roster.length + ' marked present — ' + termLabel(ui.term));
    render();
  }

  function setRoomStatus(room, status) {
    var day = roomChecksFor(ui.roomDate);
    var rec = day[room] || {};
    var prev = rec.status || 'tidy';
    rec.status = status;
    day[room] = rec;
    var occ = occupantsOf(room);
    var today = todayKey();
    if (status === 'untidy' && prev !== 'untidy') {
      occ.forEach(function (b) {
        state.incidents.push({
          id: uid('inc'), boarderId: b.id, type: 'room', points: INCIDENT_TYPES.room.points,
          note: roomLabel(room) + ' not tidy', staff: currentStaffName(), at: new Date().toISOString()
        });
      });
      toast(occ.length ? 'Untidy room logged (−1 pt each)' : 'Room ' + room + ' flagged untidy (no learners in room)');
    } else if (status === 'tidy' && prev === 'untidy') {
      var ids = occ.map(function (b) { return b.id; });
      state.incidents = state.incidents.filter(function (i) {
        return !(ids.indexOf(i.boarderId) > -1 && i.type === 'room' && String(i.at).slice(0, 10) === today);
      });
      toast('Room marked tidy');
    } else {
      toast(roomLabel(room) + ' marked ' + status);
    }
    saveState();
    render();
  }

  /* ---- photo capture ---- */
  var fileInput;
  var photoTarget = null;
  function ensureFileInput() {
    if (fileInput) return fileInput;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.setAttribute('capture', 'environment');
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', onPhotoPicked);
    document.body.appendChild(fileInput);
    return fileInput;
  }
  function onPhotoPicked(e) {
    var file = e.target.files && e.target.files[0];
    fileInput.value = '';
    if (!file || !photoTarget) return;
    compressImage(file, 720, 0.62).then(function (dataUrl) {
      if (!dataUrl) { toast('Could not read that image'); return; }
      var day = roomChecksFor(ui.roomDate);
      var rec = day[photoTarget] || {};
      rec.photo = dataUrl;
      day[photoTarget] = rec;
      saveState();
      toast('Photo saved to ' + roomLabel(photoTarget));
      render();
    });
  }
  function compressImage(file, maxDim, quality) {
    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.width, h = img.height;
        var scale = Math.min(1, maxDim / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  /* ---- CSV export ---- */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportReport() {
    var lines = [];
    lines.push(['HTS Klerksdorp Hostel — Operational Report']);
    lines.push(['Motto', MOTTO]);
    lines.push(['Generated', new Date().toLocaleString()]);
    lines.push(['Duty', state.settings.duty]);
    lines.push(['Signed in', currentStaffName()]);
    lines.push(['Access level', isOwner() ? 'Owner (full control)' : 'Staff']);
    lines.push([]);

    lines.push(['Merit & Demerit Ledger']);
    lines.push(['Boarder', 'Grade', 'Room', 'Terms', 'Net Points', 'Incidents', 'Recent Note']);
    state.boarders.forEach(function (b) {
      lines.push([b.name, b.grade, roomLabel(b.room), termListText(b), netPoints(b), incidentsFor(b.id).length, recentIncidentText(b.id)]);
    });
    lines.push([]);

    lines.push(['Roll Call — ' + termLabel(ui.term) + ' — ' + prettyDate(ui.attDate)]);
    lines.push(['Boarder', 'Grade', 'Room', 'Status', 'Late Time / Notes']);
    termBoarders(ui.term).forEach(function (b) {
      var rec = attendanceFor(ui.term, ui.attDate)[b.id] || {};
      lines.push([b.name, b.grade, roomLabel(b.room), attStatus(b, ui.term, ui.attDate), rec.lateTime || '']);
    });
    lines.push([]);

    lines.push(['Room Inspections — ' + prettyDate(ui.roomDate)]);
    lines.push(['Room', 'Occupants', 'Status', 'Photo Captured', 'Notes']);
    state.rooms.forEach(function (r) {
      var rec = roomChecksFor(ui.roomDate)[r.number] || {};
      var occ = occupantsOf(r.number).map(function (b) { return b.name; }).join(' / ');
      lines.push([r.label, occ || 'Unoccupied', rec.status || 'tidy', rec.photo ? 'Yes' : 'No', rec.note || '']);
    });
    lines.push([]);

    lines.push(['2027 Enrolment Bookings']);
    lines.push(['Learner', 'Grade', 'Parent', 'Phone', 'Status', 'Submitted', 'Note']);
    state.bookings.forEach(function (bk) {
      lines.push([bk.learner, bk.grade, bk.parent, bk.phone, bk.status, bk.submitted, bk.note || '']);
    });

    var csv = lines.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'HTS-Hostel-Report-' + todayKey() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    toast('Report exported');
  }

  /* ---------------------------------------------------------
     10. MODALS
     --------------------------------------------------------- */
  function logPicker() {
    var opts = state.boarders.map(function (b) {
      return '<option value="' + b.id + '">' + esc(b.name) + ' — Grade ' + b.grade + ' • ' + esc(roomLabel(b.room)) + '</option>';
    }).join('');
    openModal('Log Merit / Demerit', '' +
      '<div class="field"><label>Boarder</label><select id="lgBoarder">' + opts + '</select></div>' +
      '<div class="field"><label>Type</label><select id="lgType">' +
        '<option value="merit">Merit (+2 pts)</option>' +
        '<option value="demerit">Demerit (−2 pts)</option>' +
        '<option value="late">Late Coming (−2 pts)</option>' +
        '<option value="room">Untidy Room (−1 pt)</option>' +
      '</select></div>' +
      '<div class="field"><label>Note / infraction</label><input type="text" id="lgNote" placeholder="e.g. Late after 21:00"></div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" data-close type="button">Cancel</button>' +
        '<button class="btn btn--primary" id="lgSave" type="button">Save Record</button>' +
      '</div>', function (body) {
        var preId = ui.pendingBoarder;
        if (preId) { $('#lgBoarder', body).value = preId; ui.pendingBoarder = null; }
        $('#lgSave', body).addEventListener('click', function () {
          logIncident($('#lgBoarder', body).value, $('#lgType', body).value, $('#lgNote', body).value.trim());
          closeModal();
        });
      });
  }
  function logForBoarder(id) { ui.pendingBoarder = id; logPicker(); }

  /* One modal for everything about a learner and their parent (owner only) */
  function editLearnerModal(boarderId) {
    if (!requireOwner()) return;
    var b = state.boarders.find(function (x) { return x.id === boarderId; });
    if (!b) return;
    var p = state.parents[b.parentId] || {};
    openModal('Learner record — ' + b.name, '' +
      '<div class="field"><label>Learner name</label><input type="text" id="lnName" value="' + esc(b.name) + '"></div>' +
      '<div class="inline-fields">' +
        '<div class="field"><label>Grade</label><select id="lnGrade">' +
          [8, 9, 10, 11, 12].map(function (g) {
            return '<option value="' + g + '"' + (Number(b.grade) === g ? ' selected' : '') + '>Grade ' + g + '</option>';
          }).join('') + '</select></div>' +
        '<div class="field"><label>Room placement</label><select id="lnRoom">' + roomOptions(b.room) + '</select></div>' +
      '</div>' +
      '<div class="field"><label>Enrolled in terms</label><div class="termbar">' + termCheckboxes(b.terms, 'ln') + '</div></div>' +
      '<hr style="border:none;border-top:1px solid var(--line);margin:14px 0">' +
      '<div class="field"><label>Parent / Guardian name</label><input type="text" id="pnName" value="' + esc(p.name || '') + '"></div>' +
      '<div class="field"><label>Relationship</label><input type="text" id="pnRel" value="' + esc(p.relation || '') + '"></div>' +
      '<div class="inline-fields">' +
        '<div class="field"><label>Primary phone</label><input type="tel" id="pnPhone" value="' + esc(p.phone || '') + '"></div>' +
        '<div class="field"><label>Alternate phone</label><input type="tel" id="pnAlt" value="' + esc(p.altPhone || '') + '"></div>' +
      '</div>' +
      '<div class="field"><label>Email</label><input type="text" id="pnEmail" value="' + esc(p.email || '') + '"></div>' +
      '<div class="field"><label>Note</label><input type="text" id="pnNote" value="' + esc(p.note || '') + '"></div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--red" id="lnDelete" type="button">Remove learner</button>' +
        '<button class="btn btn--primary" id="lnSave" type="button">Save</button>' +
      '</div>', function (body) {
        $('#lnSave', body).addEventListener('click', function () {
          var name = $('#lnName', body).value.trim();
          if (!name) { toast('Enter the learner name'); return; }
          var terms = readTermCheckboxes(body, 'ln');
          if (!terms.length) { toast('Choose at least one term'); return; }
          b.name = name;
          b.grade = Number($('#lnGrade', body).value);
          b.room = Number($('#lnRoom', body).value);
          b.terms = terms;
          state.parents[b.parentId] = {
            name: $('#pnName', body).value.trim(),
            relation: $('#pnRel', body).value.trim(),
            phone: $('#pnPhone', body).value.trim(),
            altPhone: $('#pnAlt', body).value.trim(),
            email: $('#pnEmail', body).value.trim(),
            note: $('#pnNote', body).value.trim()
          };
          saveState(); closeModal(); toast('Learner record updated'); render();
        });
        $('#lnDelete', body).addEventListener('click', function () {
          if (!confirm('Remove ' + b.name + ' from the hostel? This deletes their record.')) return;
          state.boarders = state.boarders.filter(function (x) { return x.id !== b.id; });
          delete state.parents[b.parentId];
          state.incidents = state.incidents.filter(function (i) { return i.boarderId !== b.id; });
          saveState(); closeModal(); toast('Learner removed'); render();
        });
      });
  }

  function moveModal(boarderId) {
    if (!requireOwner()) return;
    var b = state.boarders.find(function (x) { return x.id === boarderId; });
    if (!b) return;
    openModal('Move ' + b.name, '' +
      '<div class="field"><label>Currently in</label><input type="text" value="' + esc(roomLabel(b.room)) + '" disabled></div>' +
      '<div class="field"><label>Move to</label><select id="mvRoom">' + roomOptions(b.room) + '</select></div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" data-close type="button">Cancel</button>' +
        '<button class="btn btn--primary" id="mvSave" type="button">Move learner</button>' +
      '</div>', function (body) {
        $('#mvSave', body).addEventListener('click', function () {
          var target = Number($('#mvRoom', body).value);
          b.room = target;
          saveState(); closeModal();
          toast(b.name + ' moved to ' + roomLabel(target));
          render();
        });
      });
  }

  function roomManageModal(roomNumber) {
    if (!requireOwner()) return;
    var occ = occupantsOf(roomNumber);
    var inner = occ.length
      ? occ.map(function (b) {
          return '<div class="occur">' +
            '<span class="occur__name">' + esc(b.name) + '<br><span class="td-muted" style="font-weight:500">Grade ' + b.grade + '</span></span>' +
            '<button class="btn btn--ghost btn--sm" data-action="move" data-id="' + b.id + '" data-close-first="1">Move</button>' +
            '</div>';
        }).join('')
      : '<p class="empty">This room is empty.</p>';

    var free = state.boarders.filter(function (b) { return Number(b.room) !== Number(roomNumber); });
    var addOpts = free.length
      ? free.map(function (b) { return '<option value="' + b.id + '">' + esc(b.name) + ' — ' + esc(roomLabel(b.room)) + '</option>'; }).join('')
      : '';

    openModal(roomLabel(roomNumber) + ' — placement', '' +
      '<p class="card__hint" style="margin-bottom:10px">Move learners out, or place another learner into this room.</p>' +
      inner +
      (addOpts ? (
        '<div class="field" style="margin-top:14px"><label>Place a learner into ' + esc(roomLabel(roomNumber)) + '</label>' +
        '<select id="rmAdd">' + addOpts + '</select></div>' +
        '<div class="modal__actions"><button class="btn btn--primary" id="rmAddGo" type="button">Place in room</button></div>'
      ) : '<p class="card__hint" style="margin-top:14px">Every learner is already in this room.</p>'), function (body) {
        var go = $('#rmAddGo', body);
        if (go) go.addEventListener('click', function () {
          var b = state.boarders.find(function (x) { return x.id === $('#rmAdd', body).value; });
          if (!b) return;
          b.room = Number(roomNumber);
          saveState(); closeModal();
          toast(b.name + ' placed in ' + roomLabel(roomNumber));
          render();
        });
      });
  }

  function addLearnerModal() {
    if (!requireOwner()) return;
    openModal('Add Learner', '' +
      '<div class="field"><label>Learner name</label><input type="text" id="alName" placeholder="Surname, First name"></div>' +
      '<div class="inline-fields">' +
        '<div class="field"><label>Grade</label><select id="alGrade">' +
          [8, 9, 10, 11, 12].map(function (g) { return '<option value="' + g + '">Grade ' + g + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label>Room</label><select id="alRoom">' + roomOptions(1) + '</select></div>' +
      '</div>' +
      '<div class="field"><label>Enrolled in terms</label><div class="termbar">' + termCheckboxes(allTerms(), 'al') + '</div></div>' +
      '<div class="field"><label>Parent / Guardian</label><input type="text" id="alParent" placeholder="Mr/Ms Surname"></div>' +
      '<div class="field"><label>Parent contact number</label><input type="tel" id="alPhone" value="' + DEFAULT_PHONE + '"></div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" data-close type="button">Cancel</button>' +
        '<button class="btn btn--primary" id="alSave" type="button">Add learner</button>' +
      '</div>', function (body) {
        $('#alSave', body).addEventListener('click', function () {
          var name = $('#alName', body).value.trim();
          if (!name) { toast('Enter the learner name'); return; }
          var terms = readTermCheckboxes(body, 'al');
          if (!terms.length) { toast('Choose at least one term'); return; }
          var bid = uid('b'), pid = uid('p');
          state.boarders.push({
            id: bid, name: name, grade: Number($('#alGrade', body).value),
            room: Number($('#alRoom', body).value), parentId: pid, terms: terms
          });
          state.parents[pid] = {
            name: $('#alParent', body).value.trim() || 'Mr/Ms ' + surnameOf(name),
            relation: 'Parent/Guardian',
            phone: $('#alPhone', body).value.trim() || DEFAULT_PHONE,
            altPhone: '', email: '', note: ''
          };
          saveState(); closeModal(); toast('Learner added'); render();
        });
      });
  }

  function roomAddModal() {
    if (!requireOwner()) return;
    var next = state.rooms.reduce(function (m, r) { return Math.max(m, Number(r.number)); }, 0) + 1;
    openModal('Add Room', '' +
      '<div class="inline-fields">' +
        '<div class="field"><label>Room number</label><input type="number" id="raNum" value="' + next + '" min="1"></div>' +
        '<div class="field"><label>Room name</label><input type="text" id="raLabel" value="Room ' + next + '"></div>' +
      '</div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" data-close type="button">Cancel</button>' +
        '<button class="btn btn--primary" id="raSave" type="button">Add room</button>' +
      '</div>', function (body) {
        $('#raSave', body).addEventListener('click', function () {
          var num = Number($('#raNum', body).value);
          if (!num || num < 1) { toast('Enter a room number'); return; }
          if (state.rooms.some(function (r) { return Number(r.number) === num; })) { toast('That room number already exists'); return; }
          state.rooms.push({ number: num, label: $('#raLabel', body).value.trim() || 'Room ' + num });
          saveState(); closeModal(); toast('Room added'); render();
        });
      });
  }

  function roomEditModal(roomNumber) {
    if (!requireOwner()) return;
    var r = state.rooms.find(function (x) { return Number(x.number) === Number(roomNumber); });
    if (!r) return;
    openModal('Rename ' + r.label, '' +
      '<div class="field"><label>Room name</label><input type="text" id="reLabel" value="' + esc(r.label) + '"></div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" data-close type="button">Cancel</button>' +
        '<button class="btn btn--primary" id="reSave" type="button">Save</button>' +
      '</div>', function (body) {
        $('#reSave', body).addEventListener('click', function () {
          r.label = $('#reLabel', body).value.trim() || r.label;
          saveState(); closeModal(); toast('Room renamed'); render();
        });
      });
  }

  function roomDelete(roomNumber) {
    if (!requireOwner()) return;
    var r = state.rooms.find(function (x) { return Number(x.number) === Number(roomNumber); });
    if (!r) return;
    var occ = occupantsOf(roomNumber);
    if (!confirm('Remove ' + r.label + ' from the room list?' + (occ.length ? ' ' + occ.length + ' learner(s) are still placed there and will keep the room number until you move them.' : ''))) return;
    state.rooms = state.rooms.filter(function (x) { return Number(x.number) !== Number(roomNumber); });
    saveState(); toast('Room removed'); render();
  }

  function bookingModal() {
    if (!requireOwner()) return;
    openModal('New 2027 Booking', '' +
      '<div class="field"><label>Learner name</label><input type="text" id="bkName" placeholder="Surname, First name"></div>' +
      '<div class="inline-fields">' +
        '<div class="field"><label>Grade (2027)</label><select id="bkGrade">' +
          [8, 9, 10, 11, 12].map(function (g) { return '<option value="' + g + '">Grade ' + g + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label>Submitted</label><input type="date" id="bkDate" value="' + todayKey() + '"></div>' +
      '</div>' +
      '<div class="field"><label>Parent / Guardian</label><input type="text" id="bkParent" placeholder="Mr/Ms Surname"></div>' +
      '<div class="field"><label>Contact number</label><input type="tel" id="bkPhone" value="' + DEFAULT_PHONE + '"></div>' +
      '<div class="field"><label>Note</label><input type="text" id="bkNote" placeholder="Optional"></div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" data-close type="button">Cancel</button>' +
        '<button class="btn btn--primary" id="bkSave" type="button">Save Booking</button>' +
      '</div>', function (body) {
        $('#bkSave', body).addEventListener('click', function () {
          var name = $('#bkName', body).value.trim();
          if (!name) { toast('Enter the learner name'); return; }
          state.bookings.push({
            id: uid('bk'), learner: name, grade: $('#bkGrade', body).value,
            parent: $('#bkParent', body).value.trim() || 'Mr/Ms ' + surnameOf(name),
            phone: $('#bkPhone', body).value.trim() || DEFAULT_PHONE,
            status: 'pending', submitted: $('#bkDate', body).value || todayKey(),
            note: $('#bkNote', body).value.trim()
          });
          saveState(); closeModal(); toast('2027 booking captured'); render();
        });
      });
  }

  function staffAddModal() {
    if (!requireOwner()) return;
    openModal('Add staff member', '' +
      '<div class="field"><label>Full name</label><input type="text" id="stName" placeholder="e.g. J. Molefe"></div>' +
      '<div class="field"><label>Login password (at least 4 characters)</label><input type="text" id="stPin" placeholder="e.g. molefe2027"></div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" data-close type="button">Cancel</button>' +
        '<button class="btn btn--primary" id="stSave" type="button">Add staff</button>' +
      '</div>', function (body) {
        $('#stSave', body).addEventListener('click', function () {
          var name = $('#stName', body).value.trim();
          var pin = $('#stPin', body).value.trim();
          if (!name) { toast('Enter the staff member\'s name'); return; }
          if (pin.length < 4) { toast('Password must be at least 4 characters'); return; }
          state.staff.push({ id: uid('s'), name: name, pin: pin, role: 'staff', active: true });
          saveState(); closeModal(); toast('Staff member added'); render();
        });
      });
  }

  function staffPinModal(id) {
    if (!requireOwner()) return;
    var s = state.staff.find(function (x) { return x.id === id; });
    if (!s) return;
    openModal('Password for ' + s.name, '' +
      '<div class="field"><label>New password (at least 4 characters)</label><input type="text" id="spPin" placeholder="e.g. molefe2027"></div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" data-close type="button">Cancel</button>' +
        '<button class="btn btn--primary" id="spSave" type="button">Save password</button>' +
      '</div>', function (body) {
        $('#spSave', body).addEventListener('click', function () {
          var pin = $('#spPin', body).value.trim();
          if (pin.length < 4) { toast('Password must be at least 4 characters'); return; }
          s.pin = pin;
          saveState(); closeModal(); toast('Password updated for ' + s.name); render();
        });
      });
  }

  function staffRenameModal(id) {
    if (!requireOwner()) return;
    var s = state.staff.find(function (x) { return x.id === id; });
    if (!s) return;
    openModal('Rename staff member', '' +
      '<div class="field"><label>Name</label><input type="text" id="srName" value="' + esc(s.name) + '"></div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" data-close type="button">Cancel</button>' +
        '<button class="btn btn--primary" id="srSave" type="button">Save</button>' +
      '</div>', function (body) {
        $('#srSave', body).addEventListener('click', function () {
          var name = $('#srName', body).value.trim();
          if (!name) { toast('Enter a name'); return; }
          s.name = name;
          if (session && session.id === s.id) { session.name = name; }
          saveState(); closeModal(); syncHeader(); toast('Staff member renamed'); render();
        });
      });
  }

  function signOut() {
    session = null;
    localStorage.removeItem(SESSION_KEY);
    gateError = '';
    closeModal();
    stopPolling();
    setSync('local', 'Signed out');
    renderGate();
  }

  function viewPhotoModal(room) {
    var rec = roomChecksFor(ui.roomDate)[room] || {};
    if (!rec.photo) return;
    openModal(roomLabel(room) + ' — Inspection Photo', '' +
      '<img src="' + rec.photo + '" alt="' + esc(roomLabel(room)) + '" style="width:100%;border-radius:12px;border:1px solid var(--line)">' +
      '<p class="card__hint" style="margin-top:10px">' + esc(prettyDate(ui.roomDate)) + ' • Status: ' + esc(rec.status || 'tidy') + (rec.note ? ' • ' + esc(rec.note) : '') + '</p>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" data-close type="button">Close</button>' +
        '<button class="btn btn--red" id="phDel" type="button">Remove Photo</button>' +
      '</div>', function (body) {
        $('#phDel', body).addEventListener('click', function () {
          delete roomChecksFor(ui.roomDate)[room].photo;
          saveState(); closeModal(); toast('Photo removed'); render();
        });
      });
  }

  /* ---------------------------------------------------------
     11. LOGIN GATE
     --------------------------------------------------------- */
  var gateError = '';
  var gateWho = '';            // remembers the chosen staff member between attempts
  var gateSig = '';            // staff list the sign-in screen is currently showing

  function staffSignature() {
    return state.staff.filter(function (s) { return s.active !== false; })
      .map(function (s) { return s.id + '|' + s.name + '|' + (s.pin ? '1' : '0') + '|' + s.role; })
      .join(';');
  }

  function renderGate() {
    var el = $('#gate');
    if (!el) return;
    if (session) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.scrollTop = 0;

    var brand = '<div class="gate__brand">' +
        '<img class="gate__logo" src="school-logo.svg?v=2" alt="Technical High School — Uberrimae Fidei">' +
      '</div>' +
      '<h1 class="gate__school">HTS Klerksdorp Hostel</h1>';

    var active = state.staff.filter(function (s) { return s.active !== false; });
    gateSig = staffSignature();
    var opts = active.map(function (s) {
      return '<option value="' + s.id + '" data-nopass="' + (s.pin ? '0' : '1') + '" data-owner="' + (s.role === 'owner' ? '1' : '0') + '">' +
        esc(s.name) + (s.role === 'owner' ? ' (Owner)' : '') + '</option>';
    }).join('');

    el.innerHTML = '<div class="gate__card">' + brand +
      '<h2 class="gate__title">Staff sign in</h2>' +
      '<p class="gate__hint">Choose your name and enter the password ' + esc(OWNER_NAME) + ' set for you.</p>' +
      '<div class="field"><label>Staff member</label><select id="gateWho">' + opts + '</select></div>' +
      '<div class="field"><label id="gatePassLabel">Password</label><input type="password" id="gatePin" placeholder="••••"></div>' +
      '<div class="gate__err" id="gateErr">' + esc(gateError || '') + '</div>' +
      '<button class="btn btn--gold gate__btn" id="gateSignIn" type="button">Sign in</button>' +
      '<p class="gate__hint" style="margin-top:12px">New here? Ask ' + esc(OWNER_NAME) + ' to add you and set your password.</p>' +
      '</div>';

    var who = $('#gateWho'), pass = $('#gatePin'), label = $('#gatePassLabel');
    if (gateWho) who.value = gateWho;
    if (who.selectedIndex < 0 && who.options.length) who.selectedIndex = 0;
    gateWho = who.value;
    function refreshLabel() {
      var o = who.options[who.selectedIndex];
      var noPass = o && o.dataset.nopass === '1';
      var isOwner = o && o.dataset.owner === '1';
      label.textContent = (noPass && isOwner) ? 'Create your owner password (4+ characters)' : 'Password';
    }
    who.addEventListener('change', function () { gateWho = who.value; refreshLabel(); });
    refreshLabel();
    pass.focus();

    function trySignIn() {
      var s = state.staff.find(function (x) { return x.id === who.value; });
      if (!s) return;
      gateWho = who.value;
      var v = pass.value.trim();
      if (!s.pin) {
        if (s.role !== 'owner') {
          gateError = 'No password has been set for ' + s.name + '. Ask ' + OWNER_NAME + ' to set it.';
          renderGate(); return;
        }
        if (v.length < 4) { gateError = 'Choose a password with at least 4 characters.'; renderGate(); return; }
        s.pin = v;
      } else if (v !== String(s.pin)) {
        gateError = 'Incorrect password. Please try again.'; renderGate(); return;
      }
      session = { id: s.id, name: s.name, role: s.role };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      gateError = '';
      saveState();                 // stores the new password + shares it
      renderGate();                // hides the gate
      syncHeader();
      render(true);
      startPolling();
      pullOnce(true);
      toast('Welcome, ' + s.name);
    }
    $('#gateSignIn').addEventListener('click', trySignIn);
    pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') trySignIn(); });
  }

  /* ---------------------------------------------------------
     12. HEADER SYNC
     --------------------------------------------------------- */
  function syncHeader() {
    $('#dutyName').textContent = state.settings.duty || '—';
    $('#staffName').textContent = session ? session.name : '—';
    var badge = $('#adminBadge');
    badge.className = 'pill ' + (isOwner() ? 'pill--admin' : 'pill--staff');
    badge.innerHTML = '<span class="dot"></span> ' + (session ? (isOwner() ? 'Owner — full control' : 'Staff access') : 'Signed out');
    $$('[data-owner-only]').forEach(function (t) { t.hidden = !isOwner(); });
    var signout = $('#btnSignOut');
    if (signout) signout.hidden = !isSignedIn();
  }

  /* ---------------------------------------------------------
     13. EVENT WIRING
     --------------------------------------------------------- */
  function wireEvents() {
    $('#tabsInner').addEventListener('click', function (e) {
      var t = e.target.closest('.tab');
      if (!t) return;
      if (t.dataset.ownerOnly && !isOwner()) return;
      ui.view = t.dataset.view;
      render(true);
    });

    $('#app').addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]');
      if (!el) return;
      var a = el.dataset.action;

      if (a === 'go') { ui.view = el.dataset.view; render(true); }
      else if (a === 'log') logForBoarder(el.dataset.id);
      else if (a === 'log-picker') logPicker();
      else if (a === 'export-report') exportReport();
      else if (a === 'att') setAttendance(el.dataset.id, el.dataset.status);
      else if (a === 'att-all') setAllPresent();
      else if (a === 'term') { ui.term = Number(el.dataset.term); render(); }
      else if (a === 'room') setRoomStatus(el.dataset.room, el.dataset.status);
      else if (a === 'snap') { photoTarget = el.dataset.room; ensureFileInput().click(); }
      else if (a === 'view-photo') viewPhotoModal(el.dataset.room);
      else if (a === 'edit-learner') editLearnerModal(el.dataset.id);
      else if (a === 'move') {
        if (el.dataset.closeFirst) closeModal();
        moveModal(el.dataset.id);
      }
      else if (a === 'add-learner') addLearnerModal();
      else if (a === 'room-manage') roomManageModal(el.dataset.room);
      else if (a === 'room-add') roomAddModal();
      else if (a === 'room-edit') roomEditModal(el.dataset.room);
      else if (a === 'room-delete') roomDelete(el.dataset.room);
      else if (a === 'add-booking') bookingModal();
      else if (a === 'booking-status') {
        if (!requireOwner()) return;
        var bk = state.bookings.find(function (x) { return x.id === el.dataset.id; });
        if (bk) { bk.status = el.dataset.status; saveState(); toast('Booking ' + el.dataset.status); render(); }
      }
      else if (a === 'booking-delete') {
        if (!requireOwner()) return;
        var bd = state.bookings.find(function (x) { return x.id === el.dataset.id; });
        if (!bd) return;
        if (!confirm('Delete the booking for ' + bd.learner + ' permanently?')) return;
        state.bookings = state.bookings.filter(function (x) { return x.id !== el.dataset.id; });
        saveState(); toast('Booking deleted permanently'); render();
      }
      else if (a === 'msg-send') {
        var ta = $('#msgText');
        var text = ta ? ta.value.trim() : '';
        if (!text) { toast('Type a message first'); return; }
        state.messages.push({ id: uid('msg'), text: text, staff: currentStaffName(), at: new Date().toISOString() });
        saveState(); toast('Broadcast sent to all users'); render();
      }
      else if (a === 'msg-delete') {
        if (!requireOwner()) return;
        state.messages = state.messages.filter(function (m) { return m.id !== el.dataset.id; });
        saveState(); toast('Message deleted'); render();
      }
      else if (a === 'staff-add') staffAddModal();
      else if (a === 'staff-pin') staffPinModal(el.dataset.id);
      else if (a === 'staff-rename') staffRenameModal(el.dataset.id);
      else if (a === 'staff-toggle') {
        if (!requireOwner()) return;
        var st = state.staff.find(function (x) { return x.id === el.dataset.id; });
        if (st) { st.active = st.active === false; saveState(); toast(st.name + (st.active ? ' enabled' : ' disabled')); render(); }
      }
      else if (a === 'staff-delete') {
        if (!requireOwner()) return;
        var sd = state.staff.find(function (x) { return x.id === el.dataset.id; });
        if (!sd) return;
        if (!confirm('Remove ' + sd.name + ' from the staff list?')) return;
        state.staff = state.staff.filter(function (x) { return x.id !== el.dataset.id; });
        saveState(); toast('Staff member removed'); render();
      }
      else if (a === 'settings-save') {
        if (!requireOwner()) return;
        state.settings.duty = $('#setDuty').value.trim() || state.settings.duty;
        saveState(); syncHeader(); toast('Settings saved');
      }
      else if (a === 'sync-now') {
        pullOnce().then(function () { doPush(); toast('Sync requested'); });
      }
    });

    $('#app').addEventListener('input', function (e) {
      var t = e.target;
      if (t.id === 'meritSearch') { ui.search = t.value; renderPreserveFocus('meritSearch', t.selectionStart); }
      else if (t.id === 'parentSearch') { ui.parentSearch = t.value; renderPreserveFocus('parentSearch', t.selectionStart); }
      else if (t.id === 'bookingSearch') { ui.bookingSearch = t.value; renderPreserveFocus('bookingSearch', t.selectionStart); }
      else if (t.dataset.action === 'late-time') {
        var day = attendanceFor(ui.term, ui.attDate);
        var rec = day[t.dataset.id] || {};
        rec.lateTime = t.value;
        day[t.dataset.id] = rec;
        saveStateQuiet();
      } else if (t.dataset.action === 'room-note') {
        var rd = roomChecksFor(ui.roomDate);
        var r = rd[t.dataset.room] || {};
        r.note = t.value;
        rd[t.dataset.room] = r;
        saveStateQuiet();
      }
    });

    $('#app').addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'meritGrade') { ui.grade = t.value; render(); }
      else if (t.id === 'attDate') { ui.attDate = t.value; render(); }
      else if (t.id === 'roomDate') { ui.roomDate = t.value; render(); }
    });

    var so = $('#btnSignOut');
    if (so) so.addEventListener('click', signOut);

    $('#modal').addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) pullOnce(true);
    });
    window.addEventListener('online', function () {
      setSync('live');
      if (isSignedIn()) doPush();
      pullOnce(true);
    });
    window.addEventListener('offline', function () { setSync('offline'); });
  }

  function renderPreserveFocus(id, pos) {
    render();
    var el = document.getElementById(id);
    if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
  }

  /* ---------------------------------------------------------
     14. PWA — install prompt + service worker
     --------------------------------------------------------- */
  var deferredPrompt = null;
  function wirePWA() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      showInstallBtn();
    });
    window.addEventListener('appinstalled', function () { toast('Installed to home screen'); });
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* offline caching unavailable */ });
      });
    }
  }
  function showInstallBtn() {
    if (document.getElementById('installBtn')) return;
    var b = document.createElement('button');
    b.id = 'installBtn';
    b.className = 'btn btn--gold';
    b.type = 'button';
    b.style.cssText = 'position:fixed;right:14px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:90;box-shadow:0 8px 22px rgba(30,73,57,.3)';
    b.textContent = '⬇ Install App';
    b.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; b.remove(); });
    });
    document.body.appendChild(b);
  }

  /* ---------------------------------------------------------
     15. BOOT
     --------------------------------------------------------- */
  function restoreSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.id) return null;
      return s;
    } catch (e) { return null; }
  }

  function boot() {
    state = loadLocal();

    var saved = restoreSession();
    if (saved) {
      var match = state.staff.find(function (x) { return x.id === saved.id && x.active !== false; });
      session = match ? { id: match.id, name: match.name, role: match.role } : null;
      if (!session) localStorage.removeItem(SESSION_KEY);
    }

    wireEvents();
    wirePWA();
    syncHeader();
    setSync(navigator.onLine ? 'local' : 'offline');
    renderGate();

    if (isSignedIn()) render(true);
    // always reach for the shared data — the sign-in screen needs the staff list
    startPolling();
    pullOnce(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
