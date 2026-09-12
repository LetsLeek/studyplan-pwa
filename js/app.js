// StudyPlan – App-Logik (Routing, Rendering, Sheets). Kein Framework, reines DOM.

const MONTH_NAMES = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const WEEKDAY_FULL = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];

const state = {
  tab: "home",
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  selectedDate: todayISO(),
  materialFilter: "open", // open | all | bought
};

const $app = document.getElementById("app");

function colorHex(id) {
  return (COLORS.find((c) => c.id === id) || COLORS[0]).hex;
}

function fmtDate(iso, opts = {}) {
  const d = parseISO(iso);
  const wd = WEEKDAY_FULL[jsWeekdayToMon0(d.getDay())];
  const day = d.getDate();
  const month = MONTH_NAMES[d.getMonth()];
  if (opts.short) return `${day}. ${month.slice(0,3)}.`;
  return `${wd}, ${day}. ${month}`;
}

function relativeDayLabel(iso) {
  const today = todayISO();
  const d = parseISO(iso), t = parseISO(today);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff === -1) return "Gestern";
  if (diff > 1 && diff < 7) return WEEKDAY_FULL[jsWeekdayToMon0(d.getDay())];
  return fmtDate(iso, { short: true });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------------- Routing / render ----------------

function setTab(tab) {
  state.tab = tab;
  render();
}

function render() {
  $app.innerHTML = `
    ${renderTopNav()}
    <main id="main">${renderTab()}</main>
    ${renderTabBar()}
    ${state.tab !== "settings" ? renderFab() : ""}
  `;
  attachGlobalHandlers();
}

function renderTopNav() {
  const titles = { home: "Übersicht", calendar: "Kalender", courses: "Kurse", materials: "Material", settings: "Einstellungen" };
  const subtitle = state.tab === "home" ? fmtDate(todayISO()) : "";
  return `
    <div class="topnav">
      <div class="topnav-inner">
        <div>
          <h1>${titles[state.tab]}</h1>
          ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
        </div>
        <div class="desktop-nav">
          ${["home","calendar","courses","materials","settings"].map(t => `
            <button data-tab="${t}" class="${state.tab===t?"active":""}">${titles[t]}</button>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderTabBar() {
  const items = [
    { id: "home", label: "Heute", icon: Icon.home },
    { id: "calendar", label: "Kalender", icon: Icon.calendar },
    { id: "courses", label: "Kurse", icon: Icon.book },
    { id: "materials", label: "Material", icon: Icon.cart },
    { id: "settings", label: "Mehr", icon: Icon.gear },
  ];
  return `
    <nav class="tabbar">
      ${items.map(it => `
        <button class="tab-btn ${state.tab===it.id?"active":""}" data-tab="${it.id}">
          ${it.icon(state.tab===it.id)}
          <span>${it.label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderFab() {
  const actions = {
    home: () => openEventSheet(),
    calendar: () => openEventSheet(null, state.selectedDate),
    courses: () => openCourseSheet(),
    materials: () => openMaterialSheet(),
  };
  if (!actions[state.tab]) return "";
  return `<button class="fab" id="fabBtn">${Icon.plus()}</button>`;
}

function renderTab() {
  switch (state.tab) {
    case "home": return renderHome();
    case "calendar": return renderCalendar();
    case "courses": return renderCourses();
    case "materials": return renderMaterials();
    case "settings": return renderSettings();
    default: return "";
  }
}

// ---------------- Home ----------------

function renderHome() {
  const next = nextCourseSession(store);
  const todayAgenda = agendaForDate(store, todayISO());
  const upcoming = upcomingEvents(store, 6);
  const openMaterials = store.data.materials.filter((m) => !m.bought);

  let hero;
  if (next) {
    const course = store.getCourse(next.courseId);
    hero = `
      <div class="hero">
        <div class="eyebrow">${next.date === todayISO() ? "Als Nächstes heute" : relativeDayLabel(next.date)}</div>
        <div class="headline">${escapeHtml(next.title || "Vorlesung")}</div>
        <div class="meta">${next.time} – ${next.endTime || ""}${next.location ? " · " + escapeHtml(next.location) : ""}</div>
      </div>
    `;
  } else {
    hero = `
      <div class="hero empty">
        <div class="eyebrow">Kein Kurs geplant</div>
        <div class="headline">Alles frei 🎉</div>
        <div class="meta">Füge Kurse hinzu, um deinen Stundenplan zu sehen.</div>
      </div>
    `;
  }

  const installBanner = shouldShowInstallBanner() ? renderInstallBanner() : "";

  return `
    ${installBanner}
    <div style="margin-top:14px">${hero}</div>

    <div class="section-title">Heute</div>
    ${todayAgenda.length ? `<div class="list">${todayAgenda.map(agendaRow).join("")}</div>` : emptyState("Nichts für heute", "Genieß den Tag.")}

    <div class="section-title">Demnächst</div>
    ${upcoming.length ? `<div class="list">${upcoming.map(eventRow).join("")}</div>` : emptyState("Keine anstehenden Termine", "Prüfungen und Abgaben erscheinen hier.")}

    ${openMaterials.length ? `
      <div class="section-title">Noch zu besorgen (${openMaterials.length})</div>
      <div class="list">${openMaterials.slice(0,4).map(materialRow).join("")}</div>
    ` : ""}
  `;
}

function emptyState(title, hint) {
  return `<div class="empty-state"><div class="title">${title}</div><div class="hint">${hint}</div></div>`;
}

function agendaRow(item) {
  const color = colorHex(item.color);
  if (item.kind === "course") {
    return `
      <div class="list-row">
        <div class="color-bar" style="background:${color}"></div>
        <div style="flex:1">
          <div class="row-title">${escapeHtml(item.title)}</div>
          <div class="row-sub">${item.location ? escapeHtml(item.location) : "Vorlesung"}</div>
        </div>
        <div class="row-time">${item.time}</div>
      </div>
    `;
  }
  return eventRow(item, true);
}

function eventRow(e, compact = false) {
  const course = e.courseId ? store.getCourse(e.courseId) : null;
  const typeLabel = { exam: "Prüfung", deadline: "Abgabe", other: "Termin" }[e.type] || "Termin";
  return `
    <div class="list-row" data-open-event="${e.id}">
      <div class="color-bar" style="background:${course ? colorHex(course.color) : "var(--text-tertiary)"}"></div>
      <div style="flex:1">
        <div class="row-title">${escapeHtml(e.title || typeLabel)}</div>
        <div class="row-sub">
          <span class="badge ${e.type}">${typeLabel}</span>
          ${!compact ? ` · ${relativeDayLabel(e.date)}` : ""}
          ${e.location ? " · " + escapeHtml(e.location) : ""}
        </div>
      </div>
      <div class="row-time">${e.time || ""}</div>
    </div>
  `;
}

function materialRow(m) {
  const course = m.courseId ? store.getCourse(m.courseId) : null;
  return `
    <div class="list-row material-row ${m.bought ? "done" : ""}" data-open-material="${m.id}">
      <button class="check-circle ${m.bought ? "checked" : ""}" data-toggle-material="${m.id}">${Icon.check()}</button>
      <div style="flex:1">
        <div class="row-title">${escapeHtml(m.title)}</div>
        <div class="row-sub">${course ? escapeHtml(course.name) : (m.note ? escapeHtml(m.note) : "Allgemein")}</div>
      </div>
      ${m.price != null && m.price !== "" ? `<div class="price-tag">€${Number(m.price).toFixed(2)}</div>` : ""}
    </div>
  `;
}

// ---------------- Calendar ----------------

function renderCalendar() {
  const { calYear, calMonth, selectedDate } = state;
  const firstOfMonth = new Date(calYear, calMonth, 1);
  const startOffset = jsWeekdayToMon0(firstOfMonth.getDay());
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();
  const itemsMap = monthHasItemsMap(store, calYear, calMonth);

  const cells = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push({ day: daysInPrevMonth - startOffset + i + 1, outside: true, iso: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, outside: false, iso: isoDate(new Date(calYear, calMonth, d)) });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const nextDay = cells.length - (startOffset + daysInMonth) + 1;
    cells.push({ day: nextDay, outside: true, iso: null });
    if (cells.length >= 42) break;
  }

  const todayIso = todayISO();

  const gridHtml = cells.map((c) => {
    if (c.outside) return `<div class="day-cell outside"><div class="num">${c.day}</div></div>`;
    const info = itemsMap.get(c.iso);
    const isToday = c.iso === todayIso;
    const isSel = c.iso === selectedDate;
    return `
      <button class="day-cell ${isToday ? "today" : ""} ${isSel && !isToday ? "selected" : ""}" data-date="${c.iso}">
        <div class="num">${c.day}</div>
        <div class="day-dots">${info ? info.colors.map(col => `<span style="background:${colorHex(col)}"></span>`).join("") || `<span style="background:var(--text-tertiary)"></span>` : ""}</div>
      </button>
    `;
  }).join("");

  const agenda = agendaForDate(store, selectedDate);

  return `
    <div class="cal-header">
      <div class="cal-title">${MONTH_NAMES[calMonth]} ${calYear}</div>
      <div class="cal-nav">
        <button class="nav-btn" data-month-delta="-1">${Icon.chevronLeft()}</button>
        <button class="nav-btn" data-month-delta="1">${Icon.chevronRight()}</button>
      </div>
    </div>
    <div class="weekday-row">${WEEKDAY_FULL.map(w => `<div>${w.slice(0,2)}</div>`).join("")}</div>
    <div class="month-grid">${gridHtml}</div>

    <div class="agenda-date-label">${fmtDate(selectedDate)}</div>
    ${agenda.length ? `<div class="list">${agenda.map(agendaRow).join("")}</div>` : emptyState("Keine Termine", "Wähle einen anderen Tag oder füge einen Termin hinzu.")}
  `;
}

// ---------------- Courses ----------------

function renderCourses() {
  const courses = store.data.courses;
  if (!courses.length) {
    return emptyState("Noch keine Kurse", "Tippe unten rechts auf + um deinen ersten Kurs anzulegen.");
  }
  return `
    <div class="list">
      ${courses.map((c) => `
        <div class="list-row" data-open-course="${c.id}">
          <div class="dot" style="background:${colorHex(c.color)}"></div>
          <div style="flex:1">
            <div class="row-title">${escapeHtml(c.name || "Unbenannter Kurs")}</div>
            <div class="row-sub">${scheduleSummary(c)}</div>
          </div>
          <div class="chev">${Icon.chevronRight()}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function scheduleSummary(c) {
  if (!c.schedule || !c.schedule.length) return c.room ? escapeHtml(c.room) : "Kein Termin hinterlegt";
  return c.schedule.map((s) => `${WEEKDAYS[s.weekday]} ${s.start}`).join(" · ");
}

// ---------------- Materials ----------------

function renderMaterials() {
  const all = store.data.materials;
  const filtered = all.filter((m) => {
    if (state.materialFilter === "open") return !m.bought;
    if (state.materialFilter === "bought") return m.bought;
    return true;
  });
  const total = all.filter(m => !m.bought && m.price != null && m.price !== "").reduce((s,m) => s + Number(m.price), 0);

  return `
    <div class="segmented" id="materialFilter">
      <button data-filter="open" class="${state.materialFilter==="open"?"active":""}">Offen</button>
      <button data-filter="bought" class="${state.materialFilter==="bought"?"active":""}">Erledigt</button>
      <button data-filter="all" class="${state.materialFilter==="all"?"active":""}">Alle</button>
    </div>
    ${total > 0 ? `<div class="row-sub" style="margin:12px 6px 0">Offene Kosten: <strong style="color:var(--text)">€${total.toFixed(2)}</strong></div>` : ""}
    <div style="margin-top:14px">
      ${filtered.length ? `<div class="list">${filtered.map(materialRow).join("")}</div>` : emptyState("Nichts hier", "Füge Bücher oder Material hinzu, das du kaufen musst.")}
    </div>
  `;
}

// ---------------- Settings ----------------

function renderSettings() {
  const s = store.data.settings;
  return `
    <div class="list" style="margin-bottom:20px">
      <div class="settings-user">
        <div class="avatar">${(s.university || "U").charAt(0)}</div>
        <div>
          <div class="row-title">${escapeHtml(s.university || "Universität")}</div>
          <div class="row-sub">${store.data.courses.length} Kurse · ${store.data.events.length} Termine</div>
        </div>
      </div>
    </div>

    <div class="section-title">Darstellung</div>
    <div class="list">
      <div class="field-row">
        <label>Design</label>
        <div class="segmented" id="themePicker" style="flex:1">
          <button data-theme="auto" class="${s.theme==="auto"?"active":""}">Auto</button>
          <button data-theme="light" class="${s.theme==="light"?"active":""}">Hell</button>
          <button data-theme="dark" class="${s.theme==="dark"?"active":""}">Dunkel</button>
        </div>
      </div>
    </div>

    <div class="section-title">Semester</div>
    <div class="field-group">
      <div class="field-row">
        <label>Uni</label>
        <input id="settingUniversity" value="${escapeHtml(s.university || "")}" placeholder="Universität Wien" />
      </div>
      <div class="field-row">
        <label>Start</label>
        <input id="settingSemStart" type="date" value="${s.semesterStart || ""}" />
      </div>
      <div class="field-row">
        <label>Ende</label>
        <input id="settingSemEnd" type="date" value="${s.semesterEnd || ""}" />
      </div>
    </div>

    <div class="section-title">U:SPACE Kalender-Abo</div>
    <div class="field-group">
      <div class="field-row stacked">
        <label>Persönlicher Abo-Link</label>
        <input id="settingIcsUrl" placeholder="https://ucal.univie.ac.at/…" value="${escapeHtml(s.icsUrl || "")}" />
      </div>
    </div>
    <div class="empty-state" style="padding:4px 8px 16px;text-align:left">
      <div class="hint">Findest du in u:space unter <em>Startseite → Kalender → Abonnieren → Link generieren</em>. Halte den Link privat, damit sieht man deinen Stundenplan. Er wird nur auf diesem Gerät gespeichert.</div>
    </div>
    ${s.icsUrl ? `
      <button class="btn-block primary" id="openIcsBtn">In Kalender-App öffnen</button>
      <button class="btn-block secondary" id="copyIcsBtn">Link kopieren</button>
    ` : ""}

    <div class="section-title">Daten</div>
    <button class="btn-block secondary" id="exportBtn">Backup exportieren (JSON)</button>
    <button class="btn-block secondary" id="importBtn">Backup importieren</button>
    <input type="file" id="importFile" accept="application/json" style="display:none" />
    <button class="btn-block destructive" id="clearBtn">Alle Daten löschen</button>

    <div class="section-title">Über</div>
    <div class="empty-state" style="padding:16px 8px">
      <div class="hint">StudyPlan · lokal gespeichert auf diesem Gerät, kein Server, keine Konten.</div>
    </div>
  `;
}

// ---------------- Install banner ----------------

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (state.tab === "home") render();
});

function shouldShowInstallBanner() {
  const dismissed = localStorage.getItem("studyplan:installDismissed");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  return !standalone && !dismissed;
}

function renderInstallBanner() {
  return `
    <div class="install-banner" id="installBanner">
      <img src="icons/icon-120.png" alt="" />
      <div class="txt">
        <div class="t1">StudyPlan installieren</div>
        <div class="t2">Als App auf Home-Bildschirm / Dock hinzufügen</div>
      </div>
      <button class="install-cta" id="installCta">Installieren</button>
      <button class="close-x" id="installDismiss">${Icon.close()}</button>
    </div>
  `;
}

// ---------------- Sheets (Add/Edit) ----------------

function openSheet(html, { onMount } = {}) {
  const scrim = document.createElement("div");
  scrim.className = "sheet-scrim";
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.innerHTML = `<div class="sheet-handle"></div>${html}`;
  document.body.append(scrim, sheet);

  function close() {
    scrim.classList.remove("open");
    sheet.classList.remove("open");
    setTimeout(() => { scrim.remove(); sheet.remove(); }, 380);
  }
  scrim.addEventListener("click", close);
  sheet.querySelectorAll("[data-close-sheet]").forEach(el => el.addEventListener("click", close));

  requestAnimationFrame(() => { scrim.classList.add("open"); sheet.classList.add("open"); });
  if (onMount) onMount(sheet, close);
  return { sheet, close };
}

function courseOptionsHtml(selectedId) {
  const opts = ['<option value="">Kein Kurs</option>']
    .concat(store.data.courses.map(c => `<option value="${c.id}" ${c.id===selectedId?"selected":""}>${escapeHtml(c.name)}</option>`));
  return opts.join("");
}

// --- Course sheet ---
function openCourseSheet(courseId) {
  const existing = courseId ? store.getCourse(courseId) : null;
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : { name:"", room:"", prof:"", ects:"", color: COLORS[store.data.courses.length % COLORS.length].id, schedule: [] };

  const html = `
    <div class="sheet-header">
      <button class="sheet-action" data-close-sheet>Abbrechen</button>
      <h2>${existing ? "Kurs bearbeiten" : "Neuer Kurs"}</h2>
      <button class="sheet-action" id="saveCourse">Sichern</button>
    </div>
    <div class="sheet-body">
      <div class="field-group">
        <div class="field-row"><label>Name</label><input id="cName" placeholder="z. B. Japanisch II" value="${escapeHtml(draft.name)}" /></div>
        <div class="field-row"><label>Raum</label><input id="cRoom" placeholder="Hörsaal / Raum" value="${escapeHtml(draft.room)}" /></div>
        <div class="field-row"><label>Lehrende:r</label><input id="cProf" placeholder="Optional" value="${escapeHtml(draft.prof)}" /></div>
        <div class="field-row"><label>ECTS</label><input id="cEcts" type="number" placeholder="Optional" value="${draft.ects ?? ""}" /></div>
      </div>

      <div class="field-row stacked" style="margin-bottom:8px"><label>Farbe</label></div>
      <div class="color-picker" id="colorPicker">
        ${COLORS.map(c => `<button class="color-swatch ${draft.color===c.id?"selected":""}" data-color="${c.id}" style="background:${c.hex};color:${c.hex}">${Icon.check()}</button>`).join("")}
      </div>

      <div class="field-row stacked" style="margin:18px 0 8px"><label>Wöchentliche Termine</label></div>
      <div class="field-group" id="scheduleList">
        ${draft.schedule.map((s, i) => scheduleSlotHtml(s, i)).join("")}
      </div>
      <button class="add-slot-btn" id="addSlot">${Icon.plus()} Termin hinzufügen</button>

      ${existing ? `<button class="btn-block destructive" id="deleteCourse" style="margin-top:24px">Kurs löschen</button>` : ""}
    </div>
  `;

  openSheet(html, {
    onMount: (sheet, close) => {
      sheet.querySelector("#colorPicker").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-color]");
        if (!btn) return;
        draft.color = btn.dataset.color;
        sheet.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("selected"));
        btn.classList.add("selected");
      });

      function refreshSchedule() {
        sheet.querySelector("#scheduleList").innerHTML = draft.schedule.map((s,i) => scheduleSlotHtml(s,i)).join("");
        bindScheduleRows();
      }
      function bindScheduleRows() {
        sheet.querySelectorAll("[data-remove-slot]").forEach(btn => {
          btn.addEventListener("click", () => {
            draft.schedule.splice(Number(btn.dataset.removeSlot), 1);
            refreshSchedule();
          });
        });
        sheet.querySelectorAll("[data-slot-weekday]").forEach(sel => {
          sel.addEventListener("change", () => draft.schedule[Number(sel.dataset.slotWeekday)].weekday = Number(sel.value));
        });
        sheet.querySelectorAll("[data-slot-start]").forEach(inp => {
          inp.addEventListener("change", () => draft.schedule[Number(inp.dataset.slotStart)].start = inp.value);
        });
        sheet.querySelectorAll("[data-slot-end]").forEach(inp => {
          inp.addEventListener("change", () => draft.schedule[Number(inp.dataset.slotEnd)].end = inp.value);
        });
      }
      bindScheduleRows();

      sheet.querySelector("#addSlot").addEventListener("click", () => {
        draft.schedule.push({ weekday: 0, start: "10:00", end: "11:30" });
        refreshSchedule();
      });

      sheet.querySelector("#saveCourse").addEventListener("click", () => {
        draft.name = sheet.querySelector("#cName").value.trim() || "Unbenannter Kurs";
        draft.room = sheet.querySelector("#cRoom").value.trim();
        draft.prof = sheet.querySelector("#cProf").value.trim();
        const ectsVal = sheet.querySelector("#cEcts").value;
        draft.ects = ectsVal ? Number(ectsVal) : null;
        if (existing) store.updateCourse(existing.id, draft);
        else store.addCourse(draft);
        toast("Kurs gespeichert");
        close();
        render();
      });

      const delBtn = sheet.querySelector("#deleteCourse");
      if (delBtn) delBtn.addEventListener("click", () => {
        store.deleteCourse(existing.id);
        toast("Kurs gelöscht");
        close();
        render();
      });
    }
  });
}

function scheduleSlotHtml(s, i) {
  return `
    <div class="schedule-slot">
      <select data-slot-weekday="${i}">
        ${WEEKDAYS.map((w, wi) => `<option value="${wi}" ${s.weekday===wi?"selected":""}>${w}</option>`).join("")}
      </select>
      <input type="time" data-slot-start="${i}" value="${s.start}" />
      <span style="color:var(--text-tertiary)">–</span>
      <input type="time" data-slot-end="${i}" value="${s.end}" />
      <button class="icon-btn-sm" data-remove-slot="${i}">${Icon.close()}</button>
    </div>
  `;
}

// --- Event sheet (Prüfung / Abgabe / Sonstiges) ---
function openEventSheet(eventId, prefillDate) {
  const existing = eventId ? store.data.events.find(e => e.id === eventId) : null;
  const draft = existing ? { ...existing } : { type: "exam", title: "", courseId: "", date: prefillDate || todayISO(), time: "", location: "", notes: "" };

  const html = `
    <div class="sheet-header">
      <button class="sheet-action" data-close-sheet>Abbrechen</button>
      <h2>${existing ? "Termin bearbeiten" : "Neuer Termin"}</h2>
      <button class="sheet-action" id="saveEvent">Sichern</button>
    </div>
    <div class="sheet-body">
      <div class="segmented" id="typePicker" style="margin-bottom:18px">
        <button data-type="exam" class="${draft.type==="exam"?"active":""}">Prüfung</button>
        <button data-type="deadline" class="${draft.type==="deadline"?"active":""}">Abgabe</button>
        <button data-type="other" class="${draft.type==="other"?"active":""}">Sonstiges</button>
      </div>
      <div class="field-group">
        <div class="field-row"><label>Titel</label><input id="eTitle" placeholder="z. B. Klausur Grammatik" value="${escapeHtml(draft.title)}" /></div>
        <div class="field-row">
          <label>Kurs</label>
          <select id="eCourse">${courseOptionsHtml(draft.courseId)}</select>
        </div>
        <div class="field-row"><label>Datum</label><input id="eDate" type="date" value="${draft.date}" /></div>
        <div class="field-row"><label>Uhrzeit</label><input id="eTime" type="time" value="${draft.time || ""}" /></div>
        <div class="field-row"><label>Ort</label><input id="eLocation" placeholder="Optional" value="${escapeHtml(draft.location)}" /></div>
        <div class="field-row stacked"><label>Notizen</label><textarea id="eNotes" placeholder="Optional">${escapeHtml(draft.notes)}</textarea></div>
      </div>
      ${existing ? `<button class="btn-block destructive" id="deleteEvent">Termin löschen</button>` : ""}
    </div>
  `;

  openSheet(html, {
    onMount: (sheet, close) => {
      sheet.querySelector("#typePicker").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-type]");
        if (!btn) return;
        draft.type = btn.dataset.type;
        sheet.querySelectorAll("#typePicker button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });

      sheet.querySelector("#saveEvent").addEventListener("click", () => {
        draft.title = sheet.querySelector("#eTitle").value.trim();
        draft.courseId = sheet.querySelector("#eCourse").value || null;
        draft.date = sheet.querySelector("#eDate").value || todayISO();
        draft.time = sheet.querySelector("#eTime").value || null;
        draft.location = sheet.querySelector("#eLocation").value.trim();
        draft.notes = sheet.querySelector("#eNotes").value.trim();
        if (!draft.title) draft.title = { exam: "Prüfung", deadline: "Abgabe", other: "Termin" }[draft.type];
        if (existing) store.updateEvent(existing.id, draft);
        else store.addEvent(draft);
        toast("Termin gespeichert");
        close();
        render();
      });

      const delBtn = sheet.querySelector("#deleteEvent");
      if (delBtn) delBtn.addEventListener("click", () => {
        store.deleteEvent(existing.id);
        toast("Termin gelöscht");
        close();
        render();
      });
    }
  });
}

// --- Material sheet ---
function openMaterialSheet(materialId) {
  const existing = materialId ? store.data.materials.find(m => m.id === materialId) : null;
  const draft = existing ? { ...existing } : { title: "", courseId: "", note: "", price: "", link: "", bought: false };

  const html = `
    <div class="sheet-header">
      <button class="sheet-action" data-close-sheet>Abbrechen</button>
      <h2>${existing ? "Material bearbeiten" : "Neues Material"}</h2>
      <button class="sheet-action" id="saveMaterial">Sichern</button>
    </div>
    <div class="sheet-body">
      <div class="field-group">
        <div class="field-row"><label>Titel</label><input id="mTitle" placeholder="z. B. Kanji-Lehrbuch" value="${escapeHtml(draft.title)}" /></div>
        <div class="field-row">
          <label>Kurs</label>
          <select id="mCourse">${courseOptionsHtml(draft.courseId)}</select>
        </div>
        <div class="field-row"><label>Preis (€)</label><input id="mPrice" type="number" step="0.01" placeholder="Optional" value="${draft.price ?? ""}" /></div>
        <div class="field-row"><label>Link</label><input id="mLink" placeholder="Optional" value="${escapeHtml(draft.link)}" /></div>
        <div class="field-row stacked"><label>Notiz</label><textarea id="mNote" placeholder="Optional">${escapeHtml(draft.note)}</textarea></div>
      </div>
      <div class="field-group">
        <div class="field-row">
          <label>Gekauft</label>
          <button class="check-circle ${draft.bought?"checked":""}" id="mBought" style="margin-left:auto">${Icon.check()}</button>
        </div>
      </div>
      ${existing ? `<button class="btn-block destructive" id="deleteMaterial">Material löschen</button>` : ""}
    </div>
  `;

  openSheet(html, {
    onMount: (sheet, close) => {
      sheet.querySelector("#mBought").addEventListener("click", (e) => {
        draft.bought = !draft.bought;
        e.currentTarget.classList.toggle("checked", draft.bought);
      });

      sheet.querySelector("#saveMaterial").addEventListener("click", () => {
        draft.title = sheet.querySelector("#mTitle").value.trim() || "Material";
        draft.courseId = sheet.querySelector("#mCourse").value || null;
        const priceVal = sheet.querySelector("#mPrice").value;
        draft.price = priceVal ? Number(priceVal) : null;
        draft.link = sheet.querySelector("#mLink").value.trim();
        draft.note = sheet.querySelector("#mNote").value.trim();
        if (existing) store.updateMaterial(existing.id, draft);
        else store.addMaterial(draft);
        toast("Material gespeichert");
        close();
        render();
      });

      const delBtn = sheet.querySelector("#deleteMaterial");
      if (delBtn) delBtn.addEventListener("click", () => {
        store.deleteMaterial(existing.id);
        toast("Material gelöscht");
        close();
        render();
      });
    }
  });
}

// ---------------- Global event delegation ----------------

function attachGlobalHandlers() {
  $app.querySelectorAll("[data-tab]").forEach(el => el.addEventListener("click", () => setTab(el.dataset.tab)));

  const fab = document.getElementById("fabBtn");
  if (fab) fab.addEventListener("click", () => {
    if (state.tab === "home") openEventSheet();
    else if (state.tab === "calendar") openEventSheet(null, state.selectedDate);
    else if (state.tab === "courses") openCourseSheet();
    else if (state.tab === "materials") openMaterialSheet();
  });

  $app.querySelectorAll("[data-open-course]").forEach(el => el.addEventListener("click", () => openCourseSheet(el.dataset.openCourse)));
  $app.querySelectorAll("[data-open-event]").forEach(el => el.addEventListener("click", () => openEventSheet(el.dataset.openEvent)));
  $app.querySelectorAll("[data-open-material]").forEach(el => el.addEventListener("click", (e) => {
    if (e.target.closest("[data-toggle-material]")) return;
    openMaterialSheet(el.dataset.openMaterial);
  }));
  $app.querySelectorAll("[data-toggle-material]").forEach(el => el.addEventListener("click", (e) => {
    e.stopPropagation();
    const m = store.data.materials.find(m => m.id === el.dataset.toggleMaterial);
    store.updateMaterial(m.id, { bought: !m.bought });
    render();
  }));

  // Calendar
  $app.querySelectorAll("[data-date]").forEach(el => el.addEventListener("click", () => {
    state.selectedDate = el.dataset.date;
    render();
  }));
  $app.querySelectorAll("[data-month-delta]").forEach(el => el.addEventListener("click", () => {
    state.calMonth += Number(el.dataset.monthDelta);
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    render();
  }));

  // Materials filter
  const filterEl = document.getElementById("materialFilter");
  if (filterEl) filterEl.querySelectorAll("[data-filter]").forEach(btn => btn.addEventListener("click", () => {
    state.materialFilter = btn.dataset.filter;
    render();
  }));

  // Settings
  const themePicker = document.getElementById("themePicker");
  if (themePicker) themePicker.querySelectorAll("[data-theme]").forEach(btn => btn.addEventListener("click", () => {
    store.updateSettings({ theme: btn.dataset.theme });
    applyTheme();
    render();
  }));
  bindSettingInput("settingUniversity", "university");
  bindSettingInput("settingSemStart", "semesterStart");
  bindSettingInput("settingSemEnd", "semesterEnd");

  const icsInput = document.getElementById("settingIcsUrl");
  if (icsInput) icsInput.addEventListener("change", () => {
    store.updateSettings({ icsUrl: icsInput.value.trim() || null });
    render();
  });
  const openIcsBtn = document.getElementById("openIcsBtn");
  if (openIcsBtn) openIcsBtn.addEventListener("click", () => {
    const url = store.data.settings.icsUrl;
    if (!url) return;
    window.location.href = url.replace(/^https?:\/\//, "webcal://");
  });
  const copyIcsBtn = document.getElementById("copyIcsBtn");
  if (copyIcsBtn) copyIcsBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(store.data.settings.icsUrl || "");
      toast("Link kopiert");
    } catch {
      toast("Kopieren nicht möglich – Link manuell markieren");
    }
  });

  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) exportBtn.addEventListener("click", doExport);
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  if (importBtn) importBtn.addEventListener("click", () => importFile.click());
  if (importFile) importFile.addEventListener("change", doImport);
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    if (confirm("Wirklich alle Daten löschen? Das kann nicht rückgängig gemacht werden.")) {
      store.clearAll();
      toast("Alle Daten gelöscht");
      render();
    }
  });

  // Install banner
  const installCta = document.getElementById("installCta");
  if (installCta) installCta.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    } else {
      toast("Nutze das Teilen-Menü deines Browsers → 'Zum Home-Bildschirm'");
    }
    render();
  });
  const installDismiss = document.getElementById("installDismiss");
  if (installDismiss) installDismiss.addEventListener("click", () => {
    localStorage.setItem("studyplan:installDismissed", "1");
    render();
  });
}

function bindSettingInput(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("change", () => store.updateSettings({ [key]: el.value || null }));
}

function doExport() {
  const blob = new Blob([store.exportJSON()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `studyplan-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast("Backup exportiert");
}

function doImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      store.importJSON(reader.result);
      toast("Backup importiert");
      render();
    } catch (err) {
      alert("Ungültige Backup-Datei.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

// ---------------- Theme ----------------

function applyTheme() {
  const theme = store.data.settings.theme;
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

// ---------------- Boot ----------------

applyTheme();
render();
store.subscribe(() => {}); // reserved for future cross-tab sync

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.error("SW-Registrierung fehlgeschlagen:", err));
  });
}
