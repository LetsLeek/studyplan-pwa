// Lokale Datenschicht — alles bleibt auf dem Gerät (localStorage), kein Server.
const DB_KEY = "studyplan:v1";
const SYNC_KEY = "studyplan:synced:v1";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const COLORS = [
  { id: "blue", hex: "#0A84FF" },
  { id: "indigo", hex: "#5E5CE6" },
  { id: "purple", hex: "#BF5AF2" },
  { id: "pink", hex: "#FF375F" },
  { id: "red", hex: "#FF453A" },
  { id: "orange", hex: "#FF9F0A" },
  { id: "yellow", hex: "#FFD60A" },
  { id: "green", hex: "#32D74B" },
  { id: "teal", hex: "#64D2FF" },
  { id: "mint", hex: "#66D4CF" },
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return isoDate(d);
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultData() {
  return {
    version: 1,
    settings: {
      theme: "auto", // auto | light | dark
      semesterStart: null,
      semesterEnd: null,
      university: "Universität Wien",
      icsUrl: null, // persönlicher U:SPACE-Kalender-Abo-Link, bleibt nur lokal auf diesem Gerät
      syncUrl: null, // Gist-JSON-URL für automatischen Kurs-Sync in die App
    },
    courses: [],
    events: [],
    materials: [],
  };
}

class Store {
  constructor() {
    this.data = this._load();
    this._listeners = new Set();
    this._syncCache = this._loadSyncCache();
  }

  _load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      return { ...defaultData(), ...parsed };
    } catch (e) {
      console.error("StudyPlan: konnte Daten nicht laden", e);
      return defaultData();
    }
  }

  _save() {
    localStorage.setItem(DB_KEY, JSON.stringify(this.data));
    this._emit();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    for (const fn of this._listeners) fn(this.data);
  }

  // --- Courses ---
  addCourse(course) {
    const c = {
      id: uid(),
      name: "",
      short: "",
      color: COLORS[this.data.courses.length % COLORS.length].id,
      room: "",
      prof: "",
      ects: null,
      schedule: [], // [{weekday: 0-6, start: "10:00", end: "11:30"}]
      ...course,
    };
    this.data.courses.push(c);
    this._save();
    return c;
  }

  updateCourse(id, patch) {
    const c = this.data.courses.find((c) => c.id === id);
    if (!c) return;
    Object.assign(c, patch);
    this._save();
  }

  deleteCourse(id) {
    this.data.courses = this.data.courses.filter((c) => c.id !== id);
    this.data.events = this.data.events.filter((e) => e.courseId !== id);
    this.data.materials = this.data.materials.filter((m) => m.courseId !== id);
    this._save();
  }

  getCourse(id) {
    return this.data.courses.find((c) => c.id === id);
  }

  // --- Events (Prüfungen, Abgaben, Sonstiges) ---
  addEvent(event) {
    const e = {
      id: uid(),
      type: "exam", // exam | deadline | other
      title: "",
      courseId: null,
      date: todayISO(),
      time: null,
      location: "",
      notes: "",
      ...event,
    };
    this.data.events.push(e);
    this._save();
    return e;
  }

  updateEvent(id, patch) {
    const e = this.data.events.find((e) => e.id === id);
    if (!e) return;
    Object.assign(e, patch);
    this._save();
  }

  deleteEvent(id) {
    this.data.events = this.data.events.filter((e) => e.id !== id);
    this._save();
  }

  // --- Materials ---
  addMaterial(material) {
    const m = {
      id: uid(),
      courseId: null,
      title: "",
      note: "",
      price: null,
      link: "",
      bought: false,
      ...material,
    };
    this.data.materials.push(m);
    this._save();
    return m;
  }

  updateMaterial(id, patch) {
    const m = this.data.materials.find((m) => m.id === id);
    if (!m) return;
    Object.assign(m, patch);
    this._save();
  }

  deleteMaterial(id) {
    this.data.materials = this.data.materials.filter((m) => m.id !== id);
    this._save();
  }

  // --- Settings ---
  updateSettings(patch) {
    Object.assign(this.data.settings, patch);
    this._save();
  }

  // --- Backup ---
  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  importJSON(json) {
    const parsed = JSON.parse(json);
    this.data = { ...defaultData(), ...parsed };
    this._save();
  }

  clearAll() {
    this.data = defaultData();
    this._save();
  }

  // --- Automatischer Kurs-Sync (read-only, aus externem Gist-JSON) ---
  _loadSyncCache() {
    try {
      const raw = localStorage.getItem(SYNC_KEY);
      return raw ? JSON.parse(raw) : { fetchedAt: null, events: [] };
    } catch {
      return { fetchedAt: null, events: [] };
    }
  }

  getSyncedEvents() {
    return this._syncCache.events;
  }

  getSyncMeta() {
    return { fetchedAt: this._syncCache.fetchedAt, count: this._syncCache.events.length };
  }

  async syncNow() {
    const url = this.data.settings.syncUrl;
    if (!url) throw new Error("Keine Sync-URL hinterlegt.");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.events)) throw new Error("Unerwartetes Format.");
    this._syncCache = { fetchedAt: new Date().toISOString(), events: json.events };
    localStorage.setItem(SYNC_KEY, JSON.stringify(this._syncCache));
    this._emit();
    return this._syncCache;
  }

  syncIfStale(maxAgeMs = 30 * 60 * 1000) {
    if (!this.data.settings.syncUrl) return;
    const last = this._syncCache.fetchedAt ? new Date(this._syncCache.fetchedAt).getTime() : 0;
    if (Date.now() - last > maxAgeMs) {
      this.syncNow().catch((err) => console.error("StudyPlan: Sync fehlgeschlagen", err));
    }
  }
}

const store = new Store();
