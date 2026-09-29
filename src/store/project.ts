import { create } from 'zustand';
import { demoProject } from '../model/demo';
import { portDef } from '../model/catalogue';
import { makeCable, makeComponent, validateProject } from '../model/project';
import type { Cable, CableParams, Component, ComponentParams, ComponentType, Project, RulebookSettings, VesselInfo } from '../model/types';

const STORAGE_KEY = 'marine-electrical-designer/project';
const HISTORY_LIMIT = 100;

export type ViewId = 'schematic' | 'loads' | 'cables' | 'checks' | 'wiring' | 'settings';

export interface Selection {
  componentIds: string[];
  cableIds: string[];
}

interface State {
  project: Project;
  past: Project[];
  future: Project[];
  view: ViewId;
  selection: Selection;
  dirty: boolean;
  /** Incremented whenever the schematic should zoom to the selection. */
  focusToken: number;
  focusOn: (sel: Selection) => void;
  /** In-memory clipboard of copied components and the cables between them */
  clipboard?: { components: Component[]; cables: Cable[] };
  copySelection: () => number;
  /** Paste the clipboard, offset from the originals; returns the number of components pasted */
  paste: () => number;
  duplicateSelection: () => number;
  setView: (view: ViewId) => void;
  select: (sel: Selection) => void;
  /** Replace the project with history recorded. */
  commit: (mutate: (draft: Project) => void) => void;
  /** Move components without flooding history (called on drag end). */
  moveComponents: (positions: { id: string; x: number; y: number }[]) => void;
  addComponent: (type: ComponentType, x: number, y: number, params?: Partial<ComponentParams>) => Component;
  updateComponent: (id: string, params: Partial<ComponentParams>) => void;
  updateComponentRef: (id: string, ref: string) => void;
  removeComponents: (ids: string[]) => void;
  addCable: (from: Cable['from'], to: Cable['to'], overrides?: Partial<CableParams>) => Cable | undefined;
  updateCable: (id: string, params: Partial<CableParams>) => void;
  removeCables: (ids: string[]) => void;
  updateRulebook: (rb: Partial<RulebookSettings>) => void;
  updateVessel: (v: Partial<VesselInfo>) => void;
  renameProject: (name: string) => void;
  loadProject: (project: Project) => void;
  newFromDemo: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
}

function loadInitial(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!validateProject(parsed)) return parsed as Project;
    }
  } catch {
    /* fall through to demo */
  }
  return demoProject();
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export const useProject = create<State>((set, get) => ({
  project: loadInitial(),
  past: [],
  future: [],
  view: 'schematic',
  selection: { componentIds: [], cableIds: [] },
  dirty: false,
  focusToken: 0,
  clipboard: undefined,
  copySelection: () => {
    const { project, selection } = get();
    const ids = new Set(selection.componentIds);
    const components = project.components.filter((c) => ids.has(c.id));
    if (!components.length) return 0;
    const cables = project.cables.filter((w) => ids.has(w.from.component) && ids.has(w.to.component));
    set({ clipboard: clone({ components, cables }) });
    return components.length;
  },
  paste: () => {
    const { clipboard } = get();
    if (!clipboard?.components.length) return 0;
    const idMap = new Map<string, string>();
    const newComponents: Component[] = [];
    const newCables: Cable[] = [];
    get().commit((d) => {
      for (const c of clipboard.components) {
        const copy = makeComponent({ ...d, components: [...d.components, ...newComponents] }, c.type, c.x + 40, c.y + 40, clone(c.params));
        idMap.set(c.id, copy.id);
        newComponents.push(copy);
      }
      d.components.push(...newComponents);
      for (const w of clipboard.cables) {
        const { tag: _tag, ...params } = clone(w.params);
        void _tag;
        const cable = makeCable({ ...d, cables: [...d.cables, ...newCables] }, { component: idMap.get(w.from.component)!, port: w.from.port }, { component: idMap.get(w.to.component)!, port: w.to.port }, params);
        newCables.push(cable);
      }
      d.cables.push(...newCables);
    });
    // Pasting again should land further along, not on top of the last paste.
    set({
      clipboard: { components: clipboard.components.map((c) => ({ ...c, x: c.x + 40, y: c.y + 40 })), cables: clipboard.cables },
      selection: { componentIds: newComponents.map((c) => c.id), cableIds: newCables.map((w) => w.id) },
    });
    return newComponents.length;
  },
  duplicateSelection: () => {
    if (!get().copySelection()) return 0;
    return get().paste();
  },
  focusOn: (selection) => set({ selection, view: 'schematic', focusToken: get().focusToken + 1 }),
  setView: (view) => set({ view }),
  select: (selection) => set({ selection }),
  commit: (mutate) => {
    const { project, past } = get();
    const draft = clone(project);
    mutate(draft);
    draft.updatedAt = new Date().toISOString();
    set({ project: draft, past: [...past.slice(-HISTORY_LIMIT), project], future: [], dirty: true });
  },
  moveComponents: (positions) => {
    const { project, past } = get();
    const draft = clone(project);
    for (const p of positions) {
      const c = draft.components.find((x) => x.id === p.id);
      if (c) {
        c.x = p.x;
        c.y = p.y;
      }
    }
    set({ project: draft, past: [...past.slice(-HISTORY_LIMIT), project], future: [], dirty: true });
  },
  addComponent: (type, x, y, params) => {
    const c = makeComponent(get().project, type, x, y, params);
    get().commit((d) => {
      d.components.push(c);
    });
    return c;
  },
  updateComponent: (id, params) =>
    get().commit((d) => {
      const c = d.components.find((x) => x.id === id);
      if (c) c.params = { ...c.params, ...params };
    }),
  updateComponentRef: (id, ref) =>
    get().commit((d) => {
      const c = d.components.find((x) => x.id === id);
      if (c) c.ref = ref;
    }),
  removeComponents: (ids) => {
    const set_ = new Set(ids);
    get().commit((d) => {
      d.components = d.components.filter((c) => !set_.has(c.id));
      d.cables = d.cables.filter((w) => !set_.has(w.from.component) && !set_.has(w.to.component));
    });
    set({ selection: { componentIds: [], cableIds: [] } });
  },
  addCable: (from, to, overrides) => {
    const { project } = get();
    if (from.component === to.component && from.port === to.port) return undefined;
    const exists = project.cables.some(
      (w) =>
        (w.from.component === from.component && w.from.port === from.port && w.to.component === to.component && w.to.port === to.port) ||
        (w.from.component === to.component && w.from.port === to.port && w.to.component === from.component && w.to.port === from.port),
    );
    if (exists) return undefined;
    const a = project.components.find((c) => c.id === from.component);
    const b = project.components.find((c) => c.id === to.component);
    const kinds = [a && portDef(a, from.port)?.kind, b && portDef(b, to.port)?.kind];
    const isAc = kinds.some((k) => k && k.startsWith('ac-'));
    const cable = makeCable(project, from, to, { ...(isAc ? { insulationTemp: 70 } : {}), ...overrides });
    get().commit((d) => {
      d.cables.push(cable);
    });
    return cable;
  },
  updateCable: (id, params) =>
    get().commit((d) => {
      const w = d.cables.find((x) => x.id === id);
      if (w) w.params = { ...w.params, ...params };
    }),
  removeCables: (ids) => {
    const set_ = new Set(ids);
    get().commit((d) => {
      d.cables = d.cables.filter((w) => !set_.has(w.id));
    });
    set({ selection: { componentIds: [], cableIds: [] } });
  },
  updateRulebook: (rb) =>
    get().commit((d) => {
      d.rulebook = { ...d.rulebook, ...rb };
    }),
  updateVessel: (v) =>
    get().commit((d) => {
      d.vessel = { ...d.vessel, ...v };
    }),
  renameProject: (name) =>
    get().commit((d) => {
      d.name = name;
    }),
  loadProject: (project) => set({ project, past: [], future: [], selection: { componentIds: [], cableIds: [] }, dirty: false, view: 'schematic' }),
  newFromDemo: () => get().loadProject(demoProject()),
  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], dirty: true });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    const next = future[0];
    set({ project: next, past: [...past, project], future: future.slice(1), dirty: true });
  },
  markSaved: () => set({ dirty: false }),
}));

// Autosave to localStorage, debounced.
let timer: number | undefined;
useProject.subscribe((state, prev) => {
  if (state.project === prev.project) return;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
    } catch {
      /* storage may be unavailable */
    }
  }, 400);
});

export function exportProjectJson(project: Project): string {
  return JSON.stringify(project, null, 2);
}
