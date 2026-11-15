/* ============================================================
   HTS Klerksdorp Hostel — Staff Management & Operations PWA
   Vanilla JS single-page app. Works on any phone browser,
   installable, offline-ready. All staff are admins.
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'hts_hostel_pwa_v1';
  var BASE_POINTS = 10;                 // starting points for every boarder
  var DEFAULT_PHONE = '082 555 1234';
  var MOTTO = 'UBERRIMAE FIDEI';

  /* ---------------------------------------------------------
     1. SEED DATA — the 44 boarders from the hostel document
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
    var p = key.split('-');
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Number(p[2]) + ' ' + months[Number(p[1]) - 1] + ' ' + p[0];
  }
  function surnameOf(name) {
    if (name.indexOf(',') > -1) return name.split(',')[0].trim();
    var ampersand = name.split('&')[0].trim().split(' ')[0];
    return ampersand;
  }
  function uid(prefix) { return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9); }

  /* ---------------------------------------------------------
     3. STATE
     --------------------------------------------------------- */
  var state;
  var ui = {
    view: 'dashboard',
    grade: 'all',
    search: '',
    attDate: todayKey(),
    roomDate: todayKey(),
    parentSearch: '',
    bookingSearch: ''
  };

  function seedState() {
    var boarders = SEED_BOARDERS.map(function (b, i) {
      return { id: 'b' + (i + 1), name: b[0], grade: b[1], room: b[2], parentId: 'p' + (i + 1) };
    });
    var parents = {};
    boarders.forEach(function (b, i) {
      var sn = surnameOf(b.name);
      var multi = b.name.indexOf('&') > -1;
      parents['p' + (i + 1)] = {
        name: 'Mr/Ms ' + sn,
        relation: multi ? 'Parents' : 'Parent/Guardian',
        phone: DEFAULT_PHONE,
        altPhone: '',
        email: '',
        note: ''
      };
    });
    var t = Date.now();
    return {
      version: 1,
      settings: {
        staff: 'Fresh Start',
        duty: 'D. Smit',
        role: 'admin',           // every user is an admin
        shiftStarted: new Date(t).toISOString()
      },
      boarders: boarders,
      parents: parents,
      incidents: [],             // {id, boarderId, type, points, note, staff, at}
      attendance: {},            // { 'YYYY-MM-DD': { boarderId: {status, lateTime} } }
      roomChecks: {},            // { 'YYYY-MM-DD': { room: {status, note, photo} } }
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

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.boarders && parsed.boarders.length) {
          // guarantee the admin privilege on every load
          parsed.settings = parsed.settings || {};
          parsed.settings.role = 'admin';
          return parsed;
        }
      }
    } catch (e) { /* corrupt store — fall through to seed */ }
    return seedState();
  }

  function saveState() {
    try {
      state.settings.role = 'admin';
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Storage full — export a report and clear old photos.');
    }
  }

  /* ---------------------------------------------------------
     4. DERIVED HELPERS
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
      return i.type === type && i.at.slice(0, 10) === today;
    }).length;
  }
  function attendanceFor(dateKey) {
    if (!state.attendance[dateKey]) state.attendance[dateKey] = {};
    return state.attendance[dateKey];
  }
  function attStatus(boarder, dateKey) {
    var day = attendanceFor(dateKey);
    return (day[boarder.id] && day[boarder.id].status) || 'present';
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

  /* ---------------------------------------------------------
     5. UI PRIMITIVES — toast, modal
     --------------------------------------------------------- */
  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
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
     6. VIEW RENDERERS
     --------------------------------------------------------- */

  /* ---- Dashboard ---- */
  function renderDashboard() {
    var total = state.boarders.length;
    var demerits = todayIncidentCount('demerit');
    var lates = todayIncidentCount('late');
    var roomsDone = Object.keys(roomChecksFor(ui.roomDate)).length;
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

    var pct = total ? Math.round((roomsDone / total) * 100) : 0;

    return '' +
      '<div class="section-head">' +
        '<h2>Hostel Operational Hub</h2>' +
        '<p>Managing daily discipline, roll call, photo room inspections, parent records, and 2027 enrolments.</p>' +
      '</div>' +

      '<div class="row" style="margin-bottom:16px">' +
        '<button class="btn btn--primary" data-action="log-picker">＋ Log Merit/Demerit</button>' +
        '<button class="btn btn--ghost" data-action="export-report">⬇ Export Report</button>' +
      '</div>' +

      '<div class="stats">' +
        '<div class="stat"><div class="stat__label">Total Boarders</div>' +
          '<div class="stat__value">' + total + '</div><div class="stat__sub">Active Roster</div></div>' +
        '<div class="stat stat--red"><div class="stat__label">Demerits Logged</div>' +
          '<div class="stat__value">' + demerits + '</div><div class="stat__sub">Today\'s Record</div></div>' +
        '<div class="stat stat--amber"><div class="stat__label">Late Comings</div>' +
          '<div class="stat__value">' + lates + '</div><div class="stat__sub">Today\'s Record</div></div>' +
        '<div class="stat stat--blue"><div class="stat__label">2027 Bookings</div>' +
          '<div class="stat__value">' + bookings.length + '</div>' +
          '<div class="stat__sub">' + pending + ' Pending</div></div>' +
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
          '<span class="card__hint">Rooms Checked Today</span>' +
          '<strong>' + roomsDone + ' / ' + total + '</strong>' +
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
      return '<tr>' +
        '<td data-label="Boarder" class="td-strong">' + esc(b.name) + '</td>' +
        '<td data-label="Grade &amp; Room" class="td-muted">Grade ' + b.grade + ' • Room ' + b.room + '</td>' +
        '<td data-label="Net Points" class="' + cls + '">' + pts + ' pts</td>' +
        '<td data-label="Recent" class="td-muted">' + esc(recentIncidentText(b.id)) + '</td>' +
        '<td data-label="Actions"><button class="btn btn--primary btn--sm" data-action="log" data-id="' + b.id + '">Log</button></td>' +
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
        '<button class="btn btn--ghost" data-action="log-picker">＋ Log Merit/Demerit</button>' +
      '</div>' +
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

  /* ---- Attendance ---- */
  function renderAttendance() {
    var day = attendanceFor(ui.attDate);
    var present = 0, absent = 0, late = 0;
    state.boarders.forEach(function (b) {
      var s = attStatus(b, ui.attDate);
      if (s === 'present') present++;
      else if (s === 'absent') absent++;
      else late++;
    });

    var rows = state.boarders.map(function (b) {
      var s = attStatus(b, ui.attDate);
      var rec = day[b.id] || {};
      return '<tr>' +
        '<td data-label="Boarder" class="td-strong">' + esc(b.name) + '</td>' +
        '<td data-label="Grade &amp; Room" class="td-muted">Grade ' + b.grade + ' • Room ' + b.room + '</td>' +
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

    return '' +
      '<div class="section-head">' +
        '<h2>Hostel Roll Call &amp; Attendance</h2>' +
        '<p>Record daily roll call and flag late comings (−2 points).</p>' +
      '</div>' +
      '<div class="filterbar" style="grid-template-columns:1fr">' +
        '<div><label>Roll call date</label><input type="date" id="attDate" value="' + ui.attDate + '"></div>' +
      '</div>' +
      '<div class="stats" style="grid-template-columns:repeat(3,1fr)">' +
        '<div class="stat stat--green"><div class="stat__label">Present Today</div><div class="stat__value">' + present + '</div></div>' +
        '<div class="stat stat--red"><div class="stat__label">Absent</div><div class="stat__value">' + absent + '</div></div>' +
        '<div class="stat stat--amber"><div class="stat__label">Late Coming</div><div class="stat__value">' + late + '</div></div>' +
      '</div>' +
      '<section class="card"><div class="tablewrap"><table class="responsive"><thead><tr>' +
        '<th>Boarder Name</th><th>Grade &amp; Room</th><th>Late Time / Notes</th><th>Status</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  /* ---- Room Checks ---- */
  function renderRooms() {
    var day = roomChecksFor(ui.roomDate);
    var tidy = 0, untidy = 0;
    state.boarders.forEach(function (b) {
      if (roomStatus(b.room, ui.roomDate) === 'tidy') tidy++; else untidy++;
    });

    var rows = state.boarders.map(function (b) {
      var rec = day[b.room] || {};
      var st = rec.status || 'tidy';
      var photo = rec.photo
        ? '<img class="thumb" src="' + rec.photo + '" alt="Room ' + b.room + ' photo" data-action="view-photo" data-room="' + b.room + '">'
        : '';
      return '<tr>' +
        '<td data-label="Room" class="td-strong">Room ' + b.room + '<br><span class="td-muted" style="font-weight:500">' + esc(b.name) + '</span></td>' +
        '<td data-label="Status">' +
          '<span class="seg">' +
            '<button type="button" data-action="room" data-room="' + b.room + '" data-status="tidy" data-on="tidy" class="' + (st === 'tidy' ? 'is-on' : '') + '">Tidy</button>' +
            '<button type="button" data-action="room" data-room="' + b.room + '" data-status="untidy" data-on="untidy" class="' + (st === 'untidy' ? 'is-on' : '') + '">Not Tidy</button>' +
          '</span>' +
        '</td>' +
        '<td data-label="Camera Photo"><div class="row" style="gap:8px">' +
          '<button type="button" class="snapbtn" data-action="snap" data-room="' + b.room + '">📷 Snap</button>' + photo +
        '</div></td>' +
        '<td data-label="Inspector Notes"><input type="text" data-action="room-note" data-room="' + b.room + '" placeholder="Notes…" value="' + esc(rec.note || '') + '"></td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="section-head">' +
        '<h2>Room Inspection &amp; Camera Capture</h2>' +
        '<p>Inspect rooms daily, record tidiness status (−1 pt for untidy), and snap/upload photos.</p>' +
      '</div>' +
      '<div class="filterbar" style="grid-template-columns:1fr">' +
        '<div><label>Inspection date</label><input type="date" id="roomDate" value="' + ui.roomDate + '"></div>' +
      '</div>' +
      '<div class="stats" style="grid-template-columns:repeat(2,1fr)">' +
        '<div class="stat stat--green"><div class="stat__label">Tidy Rooms</div><div class="stat__value">' + tidy + '</div></div>' +
        '<div class="stat stat--red"><div class="stat__label">Untidy / Issues</div><div class="stat__value">' + untidy + '</div></div>' +
      '</div>' +
      '<section class="card"><div class="tablewrap"><table class="responsive"><thead><tr>' +
        '<th>Room &amp; Boarder</th><th>Inspection Status</th><th>Camera Photo</th><th>Inspector Notes</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
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
        '<td data-label="Grade &amp; Room" class="td-muted">Grade ' + b.grade + ' • Room ' + b.room + '</td>' +
        '<td data-label="Parent / Guardian">' + esc(p.name) + ' • ' + esc(p.phone || DEFAULT_PHONE) + ' • ' + esc(p.relation) +
          '<br><span class="td-muted">Primary Contact: ' + esc(p.phone || DEFAULT_PHONE) + '</span></td>' +
        '<td data-label="Quick Actions"><div class="row" style="gap:8px">' +
          '<a class="btn btn--green btn--sm" href="tel:' + esc(tel) + '">📞 Call Parent</a>' +
          '<button class="btn btn--ghost btn--sm" data-action="edit-parent" data-id="' + b.id + '">Edit</button>' +
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
      return '<tr>' +
        '<td data-label="Learner" class="td-strong">' + esc(b.learner) + '<br><span class="td-muted" style="font-weight:500">Grade ' + esc(b.grade) + '</span></td>' +
        '<td data-label="Parent" class="td-muted">' + esc(b.parent) + ' • ' + esc(b.phone) + '</td>' +
        '<td data-label="Status">' + badge + '</td>' +
        '<td data-label="Submitted" class="td-muted">' + esc(prettyDate(b.submitted)) + '</td>' +
        '<td data-label="Actions"><div class="row" style="gap:8px">' +
          '<button class="btn btn--green btn--sm" data-action="booking-status" data-id="' + b.id + '" data-status="confirmed">Confirm</button>' +
          '<button class="btn btn--ghost btn--sm" data-action="booking-status" data-id="' + b.id + '" data-status="pending">Pending</button>' +
          '<button class="btn btn--red btn--sm" data-action="booking-status" data-id="' + b.id + '" data-status="declined">Decline</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="section-head">' +
        '<h2>2027 Enrolment Bookings</h2>' +
        '<p>Capture and track 2027 hostel applications, confirm placements and keep parent contacts on file.</p>' +
      '</div>' +
      '<div class="row" style="margin-bottom:16px">' +
        '<button class="btn btn--primary" data-action="add-booking">＋ New 2027 Booking</button>' +
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

  function render(scrollTop) {
    var out = '';
    switch (ui.view) {
      case 'merits': out = renderMerits(); break;
      case 'attendance': out = renderAttendance(); break;
      case 'rooms': out = renderRooms(); break;
      case 'parents': out = renderParents(); break;
      case 'bookings': out = renderBookings(); break;
      default: out = renderDashboard();
    }
    $('#app').innerHTML = out;

    // keep the tab bar in sync
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('is-active', t.dataset.view === ui.view);
    });
    if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------------------------------------------------
     7. ACTIONS
     --------------------------------------------------------- */
  function logIncident(boarderId, type, note) {
    var meta = INCIDENT_TYPES[type];
    var b = state.boarders.find(function (x) { return x.id === boarderId; });
    if (!b || !meta) return;
    state.incidents.push({
      id: uid('inc'), boarderId: boarderId, type: type, points: meta.points,
      note: note || '', staff: state.settings.staff, at: new Date().toISOString()
    });
    saveState();
    toast(meta.label + ' logged for ' + b.name);
    render();
  }

  function setAttendance(boarderId, status) {
    var day = attendanceFor(ui.attDate);
    var rec = day[boarderId] || {};
    var prev = rec.status || 'present';
    rec.status = status;
    day[boarderId] = rec;
    // a new late-coming automatically logs the -2 point incident (once per day)
    if (status === 'late' && prev !== 'late') {
      state.incidents.push({
        id: uid('inc'), boarderId: boarderId, type: 'late', points: INCIDENT_TYPES.late.points,
        note: rec.lateTime || 'Flagged at roll call', staff: state.settings.staff, at: new Date().toISOString()
      });
      toast('Late coming logged (−2 pts)');
    } else if (status !== 'late' && prev === 'late') {
      state.incidents = state.incidents.filter(function (i) {
        return !(i.boarderId === boarderId && i.type === 'late' && i.at.slice(0, 10) === todayKey());
      });
      toast('Late coming cleared');
    } else {
      toast('Marked ' + status);
    }
    saveState();
    render();
  }

  function setRoomStatus(room, status) {
    var day = roomChecksFor(ui.roomDate);
    var rec = day[room] || {};
    var prev = rec.status || 'tidy';
    rec.status = status;
    day[room] = rec;
    var b = state.boarders.find(function (x) { return x.room === Number(room); });
    if (status === 'untidy' && prev !== 'untidy' && b) {
      state.incidents.push({
        id: uid('inc'), boarderId: b.id, type: 'room', points: INCIDENT_TYPES.room.points,
        note: 'Room ' + room + ' not tidy', staff: state.settings.staff, at: new Date().toISOString()
      });
      toast('Untidy room logged (−1 pt)');
    } else if (status === 'tidy' && prev === 'untidy' && b) {
      state.incidents = state.incidents.filter(function (i) {
        return !(i.boarderId === b.id && i.type === 'room' && i.at.slice(0, 10) === todayKey());
      });
      toast('Room marked tidy');
    } else {
      toast('Room ' + room + ' marked ' + status);
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
      toast('Photo saved to Room ' + photoTarget);
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
    lines.push(['Staff', state.settings.staff]);
    lines.push(['Access level', 'Admin (all users)']);
    lines.push([]);

    lines.push(['Merit & Demerit Ledger']);
    lines.push(['Boarder', 'Grade', 'Room', 'Net Points', 'Incidents', 'Recent Note']);
    state.boarders.forEach(function (b) {
      lines.push([b.name, b.grade, b.room, netPoints(b), incidentsFor(b.id).length, recentIncidentText(b.id)]);
    });
    lines.push([]);

    lines.push(['Attendance — ' + prettyDate(ui.attDate)]);
    lines.push(['Boarder', 'Grade', 'Room', 'Status', 'Late Time / Notes']);
    state.boarders.forEach(function (b) {
      var rec = attendanceFor(ui.attDate)[b.id] || {};
      lines.push([b.name, b.grade, b.room, attStatus(b, ui.attDate), rec.lateTime || '']);
    });
    lines.push([]);

    lines.push(['Room Inspections — ' + prettyDate(ui.roomDate)]);
    lines.push(['Room', 'Boarder', 'Status', 'Photo Captured', 'Notes']);
    state.boarders.forEach(function (b) {
      var rec = roomChecksFor(ui.roomDate)[b.room] || {};
      lines.push(['Room ' + b.room, b.name, rec.status || 'tidy', rec.photo ? 'Yes' : 'No', rec.note || '']);
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
     8. MODALS
     --------------------------------------------------------- */
  function logPicker() {
    var opts = state.boarders.map(function (b) {
      return '<option value="' + b.id + '">' + esc(b.name) + ' — Grade ' + b.grade + ' • Room ' + b.room + '</option>';
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

  function editParentModal(boarderId) {
    var b = state.boarders.find(function (x) { return x.id === boarderId; });
    var p = state.parents[b.parentId] || {};
    openModal('Parent / Guardian — ' + b.name, '' +
      '<div class="field"><label>Parent / Guardian name</label><input type="text" id="pnName" value="' + esc(p.name || '') + '"></div>' +
      '<div class="field"><label>Relationship</label><input type="text" id="pnRel" value="' + esc(p.relation || '') + '"></div>' +
      '<div class="inline-fields">' +
        '<div class="field"><label>Primary phone</label><input type="tel" id="pnPhone" value="' + esc(p.phone || '') + '"></div>' +
        '<div class="field"><label>Alternate phone</label><input type="tel" id="pnAlt" value="' + esc(p.altPhone || '') + '"></div>' +
      '</div>' +
      '<div class="field"><label>Email</label><input type="text" id="pnEmail" value="' + esc(p.email || '') + '"></div>' +
      '<div class="field"><label>Note</label><input type="text" id="pnNote" value="' + esc(p.note || '') + '"></div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" data-close type="button">Cancel</button>' +
        '<button class="btn btn--primary" id="pnSave" type="button">Save</button>' +
      '</div>', function (body) {
        $('#pnSave', body).addEventListener('click', function () {
          state.parents[b.parentId] = {
            name: $('#pnName', body).value.trim(),
            relation: $('#pnRel', body).value.trim(),
            phone: $('#pnPhone', body).value.trim(),
            altPhone: $('#pnAlt', body).value.trim(),
            email: $('#pnEmail', body).value.trim(),
            note: $('#pnNote', body).value.trim()
          };
          saveState(); closeModal(); toast('Parent details updated'); render();
        });
      });
  }

  function bookingModal() {
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

  function freshStartModal() {
    openModal('Fresh Start — New Shift', '' +
      '<p class="card__hint" style="margin-bottom:14px">Start a new duty shift. This stamps a new shift time and updates the staff name on the badge. Recorded data is kept.</p>' +
      '<div class="field"><label>Staff name (on the Active Staff Badge)</label><input type="text" id="fsStaff" value="' + esc(state.settings.staff === 'Fresh Start' ? '' : state.settings.staff) + '" placeholder="e.g. D. Smit"></div>' +
      '<div class="field"><label>Duty officer</label><input type="text" id="fsDuty" value="' + esc(state.settings.duty || '') + '"></div>' +
      '<div class="field"><label>Access level</label><input type="text" value="Admin (all users are admins)" disabled></div>' +
      '<div class="modal__actions">' +
        '<button class="btn btn--ghost" data-close type="button">Cancel</button>' +
        '<button class="btn btn--primary" id="fsSave" type="button">Start Shift</button>' +
      '</div>', function (body) {
        $('#fsSave', body).addEventListener('click', function () {
          var s = $('#fsStaff', body).value.trim();
          state.settings.staff = s || 'Fresh Start';
          state.settings.duty = $('#fsDuty', body).value.trim() || state.settings.duty;
          state.settings.role = 'admin';
          state.settings.shiftStarted = new Date().toISOString();
          saveState(); closeModal(); syncHeader(); toast('Fresh shift started'); render();
        });
      });
  }

  function viewPhotoModal(room) {
    var rec = roomChecksFor(ui.roomDate)[room] || {};
    if (!rec.photo) return;
    openModal('Room ' + room + ' — Inspection Photo', '' +
      '<img src="' + rec.photo + '" alt="Room ' + room + '" style="width:100%;border-radius:12px;border:1px solid var(--line)">' +
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
     9. HEADER SYNC
     --------------------------------------------------------- */
  function syncHeader() {
    $('#dutyName').textContent = state.settings.duty || '—';
    $('#staffName').textContent = state.settings.staff || 'Fresh Start';
    $('#adminBadge').title = 'Access level: Admin (all users)';
  }

  /* ---------------------------------------------------------
     10. EVENT WIRING
     --------------------------------------------------------- */
  function wireEvents() {
    // tab navigation
    $('#tabsInner').addEventListener('click', function (e) {
      var t = e.target.closest('.tab');
      if (!t) return;
      ui.view = t.dataset.view;
      render(true);
    });

    // main delegated clicks
    $('#app').addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]');
      if (!el) return;
      var a = el.dataset.action;
      if (a === 'go') { ui.view = el.dataset.view; render(true); }
      else if (a === 'log') logForBoarder(el.dataset.id);
      else if (a === 'log-picker') logPicker();
      else if (a === 'export-report') exportReport();
      else if (a === 'att') setAttendance(el.dataset.id, el.dataset.status);
      else if (a === 'room') setRoomStatus(el.dataset.room, el.dataset.status);
      else if (a === 'snap') { photoTarget = el.dataset.room; ensureFileInput().click(); }
      else if (a === 'view-photo') viewPhotoModal(el.dataset.room);
      else if (a === 'edit-parent') editParentModal(el.dataset.id);
      else if (a === 'add-booking') bookingModal();
      else if (a === 'booking-status') {
        var bk = state.bookings.find(function (x) { return x.id === el.dataset.id; });
        if (bk) { bk.status = el.dataset.status; saveState(); toast('Booking ' + el.dataset.status); render(); }
      }
    });

    // live filters & text fields
    $('#app').addEventListener('input', function (e) {
      var t = e.target;
      if (t.id === 'meritSearch') { ui.search = t.value; renderPreserveFocus('meritSearch', t.selectionStart); }
      else if (t.id === 'parentSearch') { ui.parentSearch = t.value; renderPreserveFocus('parentSearch', t.selectionStart); }
      else if (t.id === 'bookingSearch') { ui.bookingSearch = t.value; renderPreserveFocus('bookingSearch', t.selectionStart); }
      else if (t.dataset.action === 'late-time') {
        var day = attendanceFor(ui.attDate);
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

    $('#btnFreshStart').addEventListener('click', freshStartModal);

    // modal close handling
    $('#modal').addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  function saveStateQuiet() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function renderPreserveFocus(id, pos) {
    render();
    var el = document.getElementById(id);
    if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
  }

  /* ---------------------------------------------------------
     11. PWA — install prompt + service worker
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
    b.style.cssText = 'position:fixed;right:14px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:90;box-shadow:0 8px 22px rgba(13,42,77,.3)';
    b.textContent = '⬇ Install App';
    b.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; b.remove(); });
    });
    document.body.appendChild(b);
  }

  /* ---------------------------------------------------------
     12. BOOT
     --------------------------------------------------------- */
  function boot() {
    state = loadState();
    saveState();               // persist the seeded/upgraded store
    syncHeader();
    wireEvents();
    wirePWA();
    render(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
