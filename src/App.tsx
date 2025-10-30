import React, { useEffect, useMemo, useState } from "react";

/*
Tablero Familiar Interactivo – PWA (v3.3.1-TS)
- Dos niveles: Personalizar (sin PIN) y Ajustes (con PIN).
- Color, fondo (URL o archivo), opacidad fondo y por panel con preview.
- Metas visibles: ∞ | 0m | Xm.
- Persistencia localStorage.
*/

type CatKey = "personales" | "familiares" | "crecimiento";
type PanelKey = CatKey | "tv" | "vg";

type Tasks = Record<CatKey, string[]>;
type DoneMap = Record<CatKey, Record<string, boolean>>;

interface ChildTheme {
  color: string;
  background: string;
  opacity: number; // % overlay fondo
  panelOpacity: Record<PanelKey, number>; // % por panel
}

interface Child {
  id: string;
  name: string;
  age: number;
  theme: ChildTheme;
  tasks: Tasks;
}

interface PhaseCfg {
  videogamesMin: number | null;
  tvMin: number | null;
}

interface State {
  createdAt: string;
  pin: string;
  phase: "Fase 1" | "Fase 2" | "Fase 3";
  phases: Record<string, PhaseCfg>;
  theme: { background: string };
  rewards: string[];
  children: Child[];
  records: Record<
    string, // day
    Record<
      string, // childId
      { done: DoneMap; timers: { tv: number; vg: number } }
    >
  >;
}

// ---------- Utilidades ----------
const LS_KEY = "tfi_state_v3_3_1";
const todayDate = new Date();
const todayKey = () => todayDate.toLocaleDateString("en-CA");
const weekdayLong = todayDate.toLocaleDateString("es-ES", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});
const nowISO = () => new Date().toISOString();
const CATS: CatKey[] = ["personales", "familiares", "crecimiento"];

const asArray = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);

function loadState(): State | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as State) : null;
  } catch {
    return null;
  }
}
function saveState(s: State) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}
function safeTasks(tasks?: Partial<Tasks>): Tasks {
  const t = tasks || {};
  return {
    personales: asArray(t.personales),
    familiares: asArray(t.familiares),
    crecimiento: asArray(t.crecimiento),
  };
}
function buildSafeDone(tasks: Tasks, prevDone?: DoneMap): DoneMap {
  const prev = prevDone && typeof prevDone === "object" ? prevDone : ({} as DoneMap);
  const next: DoneMap = { personales: {}, familiares: {}, crecimiento: {} };
  CATS.forEach((cat) => {
    const list = asArray(tasks[cat]);
    next[cat] = { ...(prev[cat] || {}) };
    list.forEach((t) => {
      if (typeof next[cat][t] !== "boolean") next[cat][t] = false;
    });
  });
  return next;
}
function countDone(done: DoneMap): number {
  return CATS.reduce(
    (acc, cat) => acc + Object.values(done?.[cat] || {}).filter(Boolean).length,
    0
  );
}
function countTotalTasks(tasks: Tasks): number {
  return CATS.reduce((acc, cat) => acc + asArray(tasks[cat]).length, 0);
}
function formatMetaLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return "∞";
  if (value === 0) return "0m";
  return `${value}m`;
}

// ---------- Estado por defecto ----------
const COMMON_TASKS: Tasks = {
  personales: [
    "Hacer la cama",
    "Lavarse las manos al volver",
    "Cambiarse al volver del cole",
    "Mochila lista para mañana",
    "Cepillarse",
  ],
  familiares: [
    "Ordenar ropa y doblarla",
    "Poner o levantar la mesa",
    "Ordenar juguetes/espacios comunes",
  ],
  crecimiento: ["Leer 1 versículo o historia", "Agradecer por el día"],
};
const DEFAULT_REWARDS = [
  "Elegir película del viernes",
  "Postre especial",
  "Dormir 15 min más tarde",
  "Elegir juego de mesa",
];
const DEFAULT_THEME: ChildTheme = {
  color: "#2563eb",
  background: "",
  opacity: 40,
  panelOpacity: { personales: 70, familiares: 70, crecimiento: 70, tv: 70, vg: 70 },
};
const DEFAULT_THEME_OLI: ChildTheme = { ...DEFAULT_THEME, color: "#a78bfa" };

const DEFAULT_STATE: State = {
  createdAt: nowISO(),
  pin: "1234",
  phase: "Fase 2",
  phases: {
    "Fase 1": { videogamesMin: 90, tvMin: null },
    "Fase 2": { videogamesMin: 60, tvMin: 120 },
    "Fase 3": { videogamesMin: 60, tvMin: 60 },
  },
  theme: { background: "" },
  rewards: DEFAULT_REWARDS,
  children: [
    { id: "bauti", name: "Bauti", age: 10, theme: { ...DEFAULT_THEME }, tasks: COMMON_TASKS },
    { id: "oli", name: "Oli", age: 7, theme: { ...DEFAULT_THEME_OLI }, tasks: COMMON_TASKS },
  ],
  records: {},
};

// ---------- Hooks ----------
function useAppState() {
  const [state, setState] = useState<State>(() => loadState() || DEFAULT_STATE);
  useEffect(() => saveState(state), [state]);
  return [state, setState] as const;
}
function ensureDay(state: State, setState: (s: State) => void) {
  const d = todayKey();
  if (!state.records[d]) {
    const next: State = { ...state, records: { ...state.records, [d]: {} } };
    setState(next);
    return next;
  }
  return state;
}
function getDayChild(state: State, childId: string) {
  const d = todayKey();
  return state.records[d]?.[childId] || { done: buildSafeDone(COMMON_TASKS), timers: { tv: 0, vg: 0 } };
}
function setDayChild(
  state: State,
  setState: (s: State) => void,
  childId: string,
  updater: (e: { done: DoneMap; timers: { tv: number; vg: number } }) => { done: DoneMap; timers: { tv: number; vg: number } }
) {
  const d = todayKey();
  const current = getDayChild(state, childId);
  const nextEntry = updater(current);
  const next: State = {
    ...state,
    records: { ...state.records, [d]: { ...(state.records[d] || {}), [childId]: nextEntry } },
  };
  setState(next);
}

// ---------- UI ----------
const Pill: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ children, style }) => (
  <span className="inline-block rounded-full border px-3 py-1 text-xs font-medium" style={style}>
    {children}
  </span>
);
const SectionTitle: React.FC<React.PropsWithChildren> = ({ children }) => (
  <h3 className="text-sm font-semibold uppercase tracking-wide">{children}</h3>
);
const ProgressBar: React.FC<{ value: number; barColor?: string }> = ({ value, barColor = "#000" }) => (
  <div className="w-full h-3 bg-gray-200 rounded-full">
    <div className="h-3 rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: barColor }} />
  </div>
);
const BigButton: React.FC<React.PropsWithChildren<{ onClick?: () => void; style?: React.CSSProperties }>> = ({
  children,
  onClick,
  style,
}) => (
  <button onClick={onClick} style={style} className="w-full rounded-2xl border px-4 py-4 text-lg font-semibold active:scale-95">
    {children}
  </button>
);
const Toggle: React.FC<{ checked: boolean; onToggle: () => void; label: string; color: string }> = ({
  checked,
  onToggle,
  label,
  color,
}) => (
  <button
    onClick={onToggle}
    className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${checked ? "text-white" : "bg-white"}`}
    style={{ backgroundColor: checked ? color : "#fff", borderColor: color }}
  >
    <div className="h-5 w-5 rounded" style={{ backgroundColor: checked ? "#fff" : color }} />
    <span className="text-base">{label}</span>
  </button>
);

const Timer: React.FC<{
  seconds: number;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  color: string;
}> = ({ seconds, running, onStart, onStop, color }) => {
  const [local, setLocal] = useState(seconds);
  useEffect(() => setLocal(seconds), [seconds]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLocal((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return (
    <div className="flex items-center gap-2">
      <Pill style={{ borderColor: color }}>{fmt(local)}</Pill>
      {!running ? (
        <BigButton onClick={onStart} style={{ borderColor: color, color }}>
          ▶ Iniciar
        </BigButton>
      ) : (
        <BigButton onClick={onStop} style={{ borderColor: color, color }}>
          ■ Detener
        </BigButton>
      )}
    </div>
  );
};

// ---------- Tarjeta Niño ----------
const ChildFull: React.FC<{ child: Child; state: State; setState: (s: State) => void }> = ({ child, state, setState }) => {
  state = ensureDay(state, setState);
  const entry = getDayChild(state, child.id);
  const setEntry = (up: (e: { done: DoneMap; timers: { tv: number; vg: number } }) => { done: DoneMap; timers: { tv: number; vg: number } }) =>
    setDayChild(state, setState, child.id, up);

  const tasks = useMemo(() => safeTasks(child.tasks), [child.tasks]);
  const safeDone = useMemo(() => buildSafeDone(tasks, entry.done), [tasks, entry.done]);

  const totalTasks = countTotalTasks(tasks);
  const doneTasks = countDone(safeDone);
  const progress = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;

  const level1 = Object.values(safeDone.personales || {}).every(Boolean) && asArray(tasks.personales).length > 0;
  const level2 = level1 && Object.values(safeDone.familiares || {}).every(Boolean) && asArray(tasks.familiares).length > 0;
  const level3 = level2 && Object.values(safeDone.crecimiento || {}).every(Boolean) && asArray(tasks.crecimiento).length > 0;

  const phaseCfg = state.phases[state.phase];
  const targetTV = level1 ? phaseCfg.tvMin : null;
  const targetVG = level2 ? phaseCfg.videogamesMin : null;

  const [run, setRun] = useState<{ tv: boolean; vg: boolean }>({ tv: false, vg: false });
  useEffect(() => {
    if (!run.tv && !run.vg) return;
    const id = setInterval(() => {
      setEntry((curr) => {
        const timers = { ...(curr.timers || { tv: 0, vg: 0 }) };
        if (run.tv) timers.tv += 1;
        if (run.vg) timers.vg += 1;
        return { ...curr, timers };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [run]);

  const pct = (curr: number, target: number | null | undefined) => {
    if (!target) return 0;
    return Math.min(100, Math.round((curr / (target * 60)) * 100));
  };

  const toggleTask = (cat: CatKey, t: string) => {
    setEntry((curr) => {
      const baseTasks = safeTasks(child.tasks);
      const currDone = buildSafeDone(baseTasks, curr.done);
      const next = { ...curr };
      next.done = { ...currDone, [cat]: { ...currDone[cat], [t]: !currDone[cat][t] } };
      if (!next.timers) next.timers = { tv: 0, vg: 0 };
      return next;
    });
  };

  const timers = entry.timers || { tv: 0, vg: 0 };

  const color = child.theme?.color || "#000";
  const bg = child.theme?.background || state.theme?.background || "";
  const opacityPct = typeof child.theme?.opacity === "number" ? child.theme.opacity : 40;
  const overlayRGBA = `rgba(255,255,255,${Math.min(1, Math.max(0, opacityPct / 100))})`;
  const pOpacity = child.theme?.panelOpacity || DEFAULT_THEME.panelOpacity;
  const panelRGBA = (percent: number) => `rgba(255,255,255,${Math.min(1, Math.max(0, percent / 100))})`;

  return (
    <div className="w-full" style={{ aspectRatio: "16 / 9" }}>
      <div className="relative h-full w-full overflow-hidden rounded-2xl border" style={{ borderColor: color }}>
        {bg ? (
          <>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bg})` }} />
            <div className="absolute inset-0" style={{ background: overlayRGBA }} />
          </>
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${color}22, #ffffff)` }} />
        )}
        <div className="relative z-10 flex h-full w-full flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl font-extrabold" style={{ color }}>
              {child.name}
            </h2>
            <Pill style={{ borderColor: color }}>{state.phase}</Pill>
          </div>

          <div className="mb-2">
            <ProgressBar value={progress} barColor={color} />
            <div className="mt-1 text-xs" style={{ color }}>
              {doneTasks}/{totalTasks} completadas
            </div>
          </div>

          <div className="grid flex-1 grid-cols-3 gap-3">
            <div className="rounded-xl border p-3 backdrop-blur-sm" style={{ borderColor: color, backgroundColor: panelRGBA(pOpacity.personales) }}>
              <SectionTitle>Personales</SectionTitle>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {asArray(tasks.personales).map((t) => (
                  <Toggle key={t} label={t} checked={Boolean(safeDone?.personales?.[t])} onToggle={() => toggleTask("personales", t)} color={color} />
                ))}
              </div>
            </div>
            <div className="rounded-xl border p-3 backdrop-blur-sm" style={{ borderColor: color, backgroundColor: panelRGBA(pOpacity.familiares) }}>
              <SectionTitle>Familiares</SectionTitle>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {asArray(tasks.familiares).map((t) => (
                  <Toggle key={t} label={t} checked={Boolean(safeDone?.familiares?.[t])} onToggle={() => toggleTask("familiares", t)} color={color} />
                ))}
              </div>
            </div>
            <div className="rounded-xl border p-3 backdrop-blur-sm" style={{ borderColor: color, backgroundColor: panelRGBA(pOpacity.crecimiento) }}>
              <SectionTitle>Crecimiento</SectionTitle>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {asArray(tasks.crecimiento).map((t) => (
                  <Toggle key={t} label={t} checked={Boolean(safeDone?.crecimiento?.[t])} onToggle={() => toggleTask("crecimiento", t)} color={color} />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border p-3" style={{ borderColor: color, backgroundColor: panelRGBA(pOpacity.tv) }}>
              <SectionTitle>TV</SectionTitle>
              <div className="mt-2 flex items-center justify-between">
                <Pill style={{ borderColor: color }}>{level1 ? "Desbloqueado" : "Bloqueado"}</Pill>
                <Pill style={{ borderColor: color }}>Meta: {formatMetaLabel(phaseCfg.tvMin)}</Pill>
              </div>
              <div className="mt-3">
                <Timer seconds={timers.tv || 0} running={run.tv} onStart={() => level1 && setRun((r) => ({ ...r, tv: true }))} onStop={() => setRun((r) => ({ ...r, tv: false }))} color={color} />
                {targetTV ? (
                  <div className="mt-2">
                    <ProgressBar value={pct(timers.tv || 0, targetTV)} barColor={color} />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: color, backgroundColor: panelRGBA(pOpacity.vg) }}>
              <SectionTitle>Videojuegos</SectionTitle>
              <div className="mt-2 flex items-center justify-between">
                <Pill style={{ borderColor: color }}>{level2 ? "Desbloqueado" : "Bloqueado"}</Pill>
                <Pill style={{ borderColor: color }}>Meta: {formatMetaLabel(phaseCfg.videogamesMin)}</Pill>
              </div>
              <div className="mt-3">
                <Timer seconds={timers.vg || 0} running={run.vg} onStart={() => level2 && setRun((r) => ({ ...r, vg: true }))} onStop={() => setRun((r) => ({ ...r, vg: false }))} color={color} />
                {targetVG ? (
                  <div className="mt-2">
                    <ProgressBar value={pct(timers.vg || 0, targetVG)} barColor={color} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <SectionTitle>Premio por Nivel 3</SectionTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Pill style={{ borderColor: color }}>{level3 ? "Activo" : "Pendiente"}</Pill>
              <span className="text-sm">Ej.: {state.rewards.slice(0, 2).join(" · ")}{state.rewards.length > 2 ? "…" : ""}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Personalizar (sin PIN) ----------
const CustomizePanel: React.FC<{
  state: State;
  setState: (s: State) => void;
  onClose: () => void;
  currentIndex: number;
}> = ({ state, setState, onClose, currentIndex }) => {
  const [children, setChildren] = useState<Child[]>(state.children);
  const c = children[currentIndex];
  function patchChild(fn: (ch: Child) => Child) {
    const arr = [...children];
    arr[currentIndex] = fn(arr[currentIndex]);
    setChildren(arr);
    setState({ ...state, children: arr });
  }
  if (!c) return null;

  const theme = c.theme || DEFAULT_THEME;
  const p = theme.panelOpacity || DEFAULT_THEME.panelOpacity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-4 text-black">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Personalizar – {c.name}</h2>
          <button className="rounded-xl border px-3 py-1" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <div className="text-sm">Color principal</div>
            <input
              type="color"
              className="mt-1 h-10 w-full rounded"
              value={theme.color}
              onChange={(e) => patchChild((ch) => ({ ...ch, theme: { ...(ch.theme || DEFAULT_THEME), color: e.target.value } }))}
            />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm">Imagen de fondo (URL o archivo)</div>
            <input
              className="mt-1 w-full rounded-xl border p-2"
              placeholder="https://..."
              value={theme.background}
              onChange={(e) => patchChild((ch) => ({ ...ch, theme: { ...(ch.theme || DEFAULT_THEME), background: e.target.value } }))}
            />
            <div className="mt-2 flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const dataUrl = String(reader.result || "");
                    patchChild((ch) => ({ ...ch, theme: { ...(ch.theme || DEFAULT_THEME), background: dataUrl } }));
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <button
                className="rounded-xl border px-3 py-1 text-sm"
                onClick={() => patchChild((ch) => ({ ...ch, theme: { ...(ch.theme || DEFAULT_THEME), background: "" } }))}
              >
                Quitar fondo
              </button>
            </div>
          </div>
          <div>
            <div className="text-sm flex items-center justify-between">
              <span>Opacidad del fondo</span>
              <span className="text-xs px-2 py-1 rounded-full border">{theme.opacity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              className="mt-3 w-full"
              value={theme.opacity}
              onChange={(e) => patchChild((ch) => ({ ...ch, theme: { ...(ch.theme || DEFAULT_THEME), opacity: Number(e.target.value) } }))}
            />
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Opacidad por panel</h3>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              ["personales", "Personales"],
              ["familiares", "Familiares"],
              ["crecimiento", "Crecimiento"],
              ["tv", "TV"],
              ["vg", "Videojuegos"],
            ].map(([key, label]) => (
              <div key={key} className="rounded-xl border p-3">
                <div className="text-sm flex items-center justify-between">
                  <span>{label}</span>
                  <span className="text-xs px-2 py-1 rounded-full border">{p[key as PanelKey]}%</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={95}
                  className="mt-2 w-full"
                  value={p[key as PanelKey]}
                  onChange={(e) =>
                    patchChild((ch) => ({
                      ...ch,
                      theme: {
                        ...(ch.theme || DEFAULT_THEME),
                        panelOpacity: { ...(ch.theme?.panelOpacity || DEFAULT_THEME.panelOpacity), [key as PanelKey]: Number(e.target.value) },
                      },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Ajustes (con PIN) ----------
const AdminPanel: React.FC<{ state: State; setState: (s: State) => void; onClose: () => void }> = ({
  state,
  setState,
  onClose,
}) => {
  const [pinInput, setPinInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<"fases" | "seguridad" | "tareas" | "recompensas">("fases");

  const [phase, setPhase] = useState(state.phase);
  const [pin, setPin] = useState(state.pin);
  const [children, setChildren] = useState<Child[]>(state.children);
  const [appBg, setAppBg] = useState(state.theme?.background || "");
  const [rewards, setRewards] = useState<string[]>(state.rewards || DEFAULT_REWARDS);

  function save() {
    if (!authed) return;
    setState({ ...state, pin, phase, children, rewards, theme: { ...(state.theme || {}), background: appBg } });
    onClose();
  }
  function resetToday() {
    if (!authed) return;
    const d = todayKey();
    const next = { ...state };
    next.records[d] = {};
    setState(next);
  }
  function copyTasksToAll(fromIndex: number) {
    const base = children[fromIndex];
    if (!base) return;
    const baseTasks = safeTasks(base.tasks);
    const next = children.map((c, i) => (i === fromIndex ? c : { ...c, tasks: baseTasks }));
    setChildren(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-4 text-black">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Ajustes (Control parental)</h2>
          <button className="rounded-xl border px-3 py-1" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {!authed ? (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">PIN actual</label>
              <input
                type="password"
                className="mt-1 w-full rounded-xl border p-2"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setAuthed(pinInput === state.pin);
                }}
                placeholder="1234"
              />
            </div>
            <BigButton onClick={() => setAuthed(pinInput === state.pin)}>Acceder</BigButton>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {[
                ["fases", "Fases"],
                ["seguridad", "Seguridad"],
                ["tareas", "Tareas"],
                ["recompensas", "Recompensas"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  className={`rounded-full border px-3 py-1 text-sm ${tab === k ? "bg-black text-white" : "bg-white"}`}
                  onClick={() => setTab(k as any)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "fases" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {Object.entries(state.phases).map(([k, v]) => (
                  <button
                    key={k}
                    className={`rounded-2xl border p-3 text-left ${phase === k ? "bg-black text-white" : "bg-white"}`}
                    onClick={() => setPhase(k as State["phase"])}
                  >
                    <div className="text-lg font-semibold">{k}</div>
                    <div className="text-sm opacity-80">VG: {v.videogamesMin}m · TV: {v.tvMin != null ? `${v.tvMin}m` : "∞"}</div>
                  </button>
                ))}
              </div>
            )}

            {tab === "seguridad" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <SectionTitle>PIN</SectionTitle>
                  <input type="password" className="mt-1 w-full rounded-xl border p-2" value={pin} onChange={(e) => setPin(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <SectionTitle>Fondo general (URL)</SectionTitle>
                  <input className="mt-1 w-full rounded-xl border p-2" placeholder="https://..." value={appBg} onChange={(e) => setAppBg(e.target.value)} />
                </div>
              </div>
            )}

            {tab === "tareas" && (
              <div className="space-y-4">
                <SectionTitle>Niños y Tareas</SectionTitle>
                {children.map((c, idx) => (
                  <div key={c.id} className="rounded-xl border p-3">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <input
                        className="rounded-xl border p-2 font-semibold"
                        value={c.name}
                        onChange={(e) => {
                          const arr = [...children];
                          arr[idx] = { ...arr[idx], name: e.target.value };
                          setChildren(arr);
                        }}
                      />
                      <input
                        type="number"
                        className="rounded-xl border p-2"
                        value={c.age}
                        onChange={(e) => {
                          const arr = [...children];
                          arr[idx] = { ...arr[idx], age: Number(e.target.value) };
                          setChildren(arr);
                        }}
                      />
                      <button className="rounded-xl border px-3 py-1 text-sm" onClick={() => copyTasksToAll(idx)}>
                        Copiar tareas a todos
                      </button>
                    </div>
                    {CATS.map((cat) => (
                      <div key={cat} className="mb-2">
                        <div className="text-sm font-semibold capitalize">{cat}</div>
                        {asArray(c.tasks?.[cat]).map((t, i) => (
                          <div key={i} className="mt-1 flex gap-2">
                            <input
                              className="w-full rounded-xl border p-2"
                              value={t}
                              onChange={(e) => {
                                const arr = [...children];
                                const ts = asArray(arr[idx].tasks?.[cat]);
                                ts[i] = e.target.value;
                                arr[idx] = { ...arr[idx], tasks: { ...safeTasks(arr[idx].tasks), [cat]: ts } };
                                setChildren(arr);
                              }}
                            />
                            <button
                              className="rounded-xl border px-2"
                              onClick={() => {
                                const arr = [...children];
                                const ts = asArray(arr[idx].tasks?.[cat]);
                                ts.splice(i, 1);
                                arr[idx] = { ...arr[idx], tasks: { ...safeTasks(arr[idx].tasks), [cat]: ts } };
                                setChildren(arr);
                              }}
                            >
                              –
                            </button>
                          </div>
                        ))}
                        <button
                          className="mt-2 rounded-xl border px-3 py-1 text-sm"
                          onClick={() => {
                            const arr = [...children];
                            const ts = asArray(arr[idx].tasks?.[cat]);
                            ts.push("Nueva tarea");
                            arr[idx] = { ...arr[idx], tasks: { ...safeTasks(arr[idx].tasks), [cat]: ts } };
                            setChildren(arr);
                          }}
                        >
                          + Añadir
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {tab === "recompensas" && (
              <div className="space-y-2">
                <SectionTitle>Lista de recompensas</SectionTitle>
                {rewards.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className="w-full rounded-xl border p-2"
                      value={r}
                      onChange={(e) => {
                        const arr = [...rewards];
                        arr[i] = e.target.value;
                        setRewards(arr);
                      }}
                    />
                    <button
                      className="rounded-xl border px-2"
                      onClick={() => {
                        const arr = [...rewards];
                        arr.splice(i, 1);
                        setRewards(arr);
                      }}
                    >
                      –
                    </button>
                  </div>
                ))}
                <button className="rounded-xl border px-3 py-1 text-sm" onClick={() => setRewards((arr) => [...arr, "Nueva recompensa"])}>
                  + Añadir recompensa
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <BigButton onClick={resetToday}>Reiniciar día</BigButton>
              <BigButton onClick={save}>Guardar cambios</BigButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- App raíz ----------
function App() {
  const [state, setState] = useAppState();
  const [showAdmin, setShowAdmin] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [current, setCurrent] = useState(0);

  const kids = state.children || [];
  const kid = kids[current] || kids[0];

  // Progreso familiar
  const d = todayKey();
  const familyTotals = useMemo(() => {
    const totals = kids.map((c) => {
      const tasks = safeTasks(c.tasks);
      const entry = state.records[d]?.[c.id] || {};
      const done = buildSafeDone(tasks, (entry as any).done);
      return { totalTasks: countTotalTasks(tasks), doneTasks: countDone(done) };
    });
    return totals.reduce(
      (acc, it) => ({ totalTasks: acc.totalTasks + it.totalTasks, doneTasks: acc.doneTasks + it.doneTasks }),
      { totalTasks: 0, doneTasks: 0 }
    );
  }, [state, d, kids]);
  const familyProgress = familyTotals.totalTasks > 0 ? (familyTotals.doneTasks / familyTotals.totalTasks) * 100 : 0;

  // Smoke test
  useEffect(() => {
    try {
      const demoTasks = safeTasks(DEFAULT_STATE.children[0].tasks);
      const demoDone = buildSafeDone(demoTasks, {} as any);
      console.assert(typeof demoDone.personales["Hacer la cama"] === "boolean", "Smoke OK");
    } catch {}
  }, []);

  return (
    <div className="mx-auto max-w-6xl p-0">
      {/* Header */}
      <div className="mb-3 w-full rounded-b-2xl p-4" style={{ background: "linear-gradient(180deg, #111, #222)", color: "#fff" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">Tablero Familiar Interactivo</h1>
            <div className="text-sm opacity-90">{weekdayLong}</div>
          </div>
          <div className="flex items-center gap-2">
            <Pill style={{ borderColor: "#fff", color: "#fff" }}>{state.phase}</Pill>
            <button className="rounded-2xl border px-3 py-2" onClick={() => setShowCustomize(true)} style={{ borderColor: "#fff", color: "#fff" }}>
              Personalizar
            </button>
            <button className="rounded-2xl border px-3 py-2" onClick={() => setShowAdmin(true)} style={{ borderColor: "#fff", color: "#fff" }}>
              Ajustes
            </button>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar value={familyProgress} barColor="#fff" />
          <div className="mt-1 text-xs opacity-80">Progreso familiar del día</div>
        </div>
        {/* Selector niño */}
        <div className="mt-3 flex flex-wrap gap-2">
          {kids.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setCurrent(i)}
              className={`rounded-full border-2 px-4 py-2 font-semibold transition-all duration-200 ${i === current ? "text-white scale-105" : "text-gray-800 hover:scale-105"}`}
              style={{
                borderColor: c.theme?.color,
                backgroundColor: i === current ? c.theme?.color || "#000" : "#fff",
                color: i === current ? "#fff" : c.theme?.color || "#000",
                boxShadow: i === current ? `0 0 10px ${c.theme?.color}80` : "none",
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tablero 16:9 */}
      <div className="px-4">
        {kid && <ChildFull child={kid} state={state} setState={setState} />}
        <footer className="mt-4 text-center text-xs opacity-60 p-4">Hecho para uso familiar. Datos locales.</footer>
      </div>

      {showCustomize && <CustomizePanel state={state} setState={setState} onClose={() => setShowCustomize(false)} currentIndex={current} />}
      {showAdmin && <AdminPanel state={state} setState={setState} onClose={() => setShowAdmin(false)} />}
    </div>
  );
}

export default App;
