// Berechnung von Terminen: wöchentlich wiederkehrende Vorlesungen + einmalige Events (Prüfungen, Abgaben)

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function jsWeekdayToMon0(jsDay) {
  // JS: 0=So..6=Sa  ->  0=Mo..6=So
  return (jsDay + 6) % 7;
}

// Liefert alle Kurs-Sitzungen (aus dem wöchentlichen Schedule) für ein gegebenes Datum (ISO string).
function courseSessionsForDate(courses, dateISO, settings) {
  const date = parseISO(dateISO);
  const weekday = jsWeekdayToMon0(date.getDay());

  if (settings.semesterStart && dateISO < settings.semesterStart) return [];
  if (settings.semesterEnd && dateISO > settings.semesterEnd) return [];

  const sessions = [];
  for (const course of courses) {
    for (const slot of course.schedule || []) {
      if (slot.weekday === weekday) {
        sessions.push({
          kind: "course",
          id: `${course.id}:${dateISO}:${slot.start}`,
          courseId: course.id,
          title: course.name,
          short: course.short,
          color: course.color,
          date: dateISO,
          time: slot.start,
          endTime: slot.end,
          location: course.room,
        });
      }
    }
  }
  return sessions;
}

function eventsForDate(events, dateISO) {
  return events
    .filter((e) => e.date === dateISO)
    .map((e) => ({ kind: "event", ...e }));
}

// Alle Termine (Kurs-Sitzungen + Events) eines Tages, zeitlich sortiert.
function agendaForDate(store, dateISO) {
  const { courses, events, settings } = store.data;
  const items = [
    ...courseSessionsForDate(courses, dateISO, settings),
    ...eventsForDate(events, dateISO),
  ];
  items.sort((a, b) => {
    const ta = a.time || "99:99";
    const tb = b.time || "99:99";
    return ta.localeCompare(tb);
  });
  return items;
}

// Welche Tage in einem Monat haben Termine (für Punkte im Kalender-Grid).
function monthHasItemsMap(store, year, month /* 0-11 */) {
  const map = new Map();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = isoDate(new Date(year, month, d));
    const items = agendaForDate(store, iso);
    if (items.length) {
      map.set(iso, {
        count: items.length,
        hasExam: items.some((i) => i.kind === "event" && i.type === "exam"),
        hasDeadline: items.some((i) => i.kind === "event" && i.type === "deadline"),
        colors: [...new Set(items.map((i) => i.color).filter(Boolean))].slice(0, 4),
      });
    }
  }
  return map;
}

// Nächste N bevorstehende Events (Prüfungen/Abgaben/Sonstiges), ab heute.
function upcomingEvents(store, limit = 20) {
  const today = todayISO();
  return store.data.events
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))
    .slice(0, limit);
}

// Nächste bevorstehende Kurs-Sitzung (für die "als nächstes" Karte).
function nextCourseSession(store, fromDate = new Date(), lookaheadDays = 14) {
  for (let i = 0; i < lookaheadDays; i++) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + i);
    const iso = isoDate(d);
    const sessions = courseSessionsForDate(store.data.courses, iso, store.data.settings);
    if (sessions.length) {
      sessions.sort((a, b) => a.time.localeCompare(b.time));
      const now = new Date();
      const filtered =
        i === 0
          ? sessions.filter((s) => s.time >= `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`)
          : sessions;
      if (filtered.length) return filtered[0];
      if (i === 0) continue;
      return sessions[0];
    }
  }
  return null;
}
