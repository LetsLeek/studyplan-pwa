// Holt den persönlichen U:SPACE-Kalender-Feed (ICS) server-seitig (kein CORS-Problem hier,
// das betrifft nur Browser) und schreibt eine kompakte JSON-Fassung in einen Gist, den die
// StudyPlan-PWA clientseitig lesen kann (raw.githubusercontent.com erlaubt Cross-Origin-Fetch).
//
// Benötigte Umgebungsvariablen: ICS_URL, GIST_ID, GIST_TOKEN

const ICS_URL = process.env.ICS_URL;
const GIST_ID = process.env.GIST_ID;
const GIST_TOKEN = process.env.GIST_TOKEN;

if (!ICS_URL || !GIST_ID || !GIST_TOKEN) {
  console.error("Fehlende Umgebungsvariablen: ICS_URL, GIST_ID, GIST_TOKEN erforderlich.");
  process.exit(1);
}

function unfold(text) {
  // RFC5545: fortgesetzte Zeilen beginnen mit einem Leerzeichen/Tab.
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function unescapeText(s) {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcs(text) {
  const lines = unfold(text).split(/\r?\n/);
  const events = [];
  let cur = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;

    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const rawKey = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [key, ...paramParts] = rawKey.split(";");
    const isDate = paramParts.some((p) => p.toUpperCase() === "VALUE=DATE");

    switch (key) {
      case "UID":
        cur.uid = value;
        break;
      case "SUMMARY":
        cur.summary = unescapeText(value);
        break;
      case "LOCATION":
        cur.location = unescapeText(value);
        break;
      case "DESCRIPTION":
        cur.description = unescapeText(value);
        break;
      case "DTSTART":
        cur.start = value;
        cur.allDay = isDate;
        break;
      case "DTEND":
        cur.end = value;
        break;
      default:
        break;
    }
  }
  return events;
}

function toIsoInstant(v) {
  // Format: 20260930T111500Z  ->  2026-09-30T11:15:00Z
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

function toIsoDate(v) {
  // Format: 20260930 -> 2026-09-30
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo}-${d}`;
}

async function main() {
  const res = await fetch(ICS_URL);
  if (!res.ok) throw new Error(`ICS-Abruf fehlgeschlagen: HTTP ${res.status}`);
  const icsText = await res.text();
  const raw = parseIcs(icsText);

  const events = raw
    .map((e) => {
      if (!e.summary || !e.start) return null;
      const isCourse = /ufind\.univie\.ac\.at\/de\/course\.html/i.test(e.description || "");
      if (e.allDay) {
        return {
          uid: e.uid,
          title: e.summary,
          kind: isCourse ? "lecture" : "info",
          allDay: true,
          start: toIsoDate(e.start),
          end: e.end ? toIsoDate(e.end) : null,
          location: e.location || null,
        };
      }
      return {
        uid: e.uid,
        title: e.summary,
        kind: isCourse ? "lecture" : "info",
        allDay: false,
        start: toIsoInstant(e.start),
        end: e.end ? toIsoInstant(e.end) : null,
        location: e.location || null,
      };
    })
    .filter(Boolean);

  const payload = {
    generatedAt: new Date().toISOString(),
    count: events.length,
    events,
  };

  const body = JSON.stringify(payload, null, 2);

  const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${GIST_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: {
        "calendar.json": { content: body },
      },
    }),
  });

  if (!gistRes.ok) {
    const errText = await gistRes.text();
    throw new Error(`Gist-Update fehlgeschlagen: HTTP ${gistRes.status} ${errText}`);
  }

  console.log(`Sync ok: ${events.length} Termine geschrieben.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
