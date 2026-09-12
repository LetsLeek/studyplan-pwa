// Lokale Datenschicht — alles bleibt auf dem Gerät (localStorage), kein Server.
const DB_KEY = "studyplan:v1";

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
}

const store = new Store();
