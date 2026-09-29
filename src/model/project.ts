import { CATALOGUE } from './catalogue';
import { defaultRulebook } from './rulebooks';
import type { Cable, CableParams, Component, ComponentParams, ComponentType, Project, VesselInfo, VesselUse } from './types';

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function newProject(name: string, vessel: Partial<VesselInfo>, vesselUse: VesselUse): Project {
  const now = new Date().toISOString();
  return {
    id: uid('prj'),
    schemaVersion: 1,
    name,
    createdAt: now,
    updatedAt: now,
    vessel: { name: vessel.name ?? name, type: vessel.type ?? '', ...vessel },
    rulebook: defaultRulebook(vesselUse),
    components: [],
    cables: [],
  };
}

/** Next free reference designator for a component type, e.g. F1, F2 ... */
export function nextRef(project: Project, type: ComponentType): string {
  const prefix = CATALOGUE[type].refPrefix;
  const used = new Set(project.components.map((c) => c.ref));
  for (let i = 1; i < 10000; i++) {
    const ref = `${prefix}${i}`;
    if (!used.has(ref)) return ref;
  }
  return `${prefix}${Date.now()}`;
}

export function nextCableTag(project: Project): string {
  const used = new Set(project.cables.map((c) => c.params.tag));
  for (let i = 1; i < 100000; i++) {
    const tag = `W${String(i).padStart(3, '0')}`;
    if (!used.has(tag)) return tag;
  }
  return `W${Date.now()}`;
}

export function makeComponent(project: Project, type: ComponentType, x: number, y: number, params: Partial<ComponentParams> = {}): Component {
  const def = CATALOGUE[type];
  const defaults = JSON.parse(JSON.stringify(def.defaults)) as ComponentParams;
  return {
    id: uid('c'),
    type,
    x,
    y,
    ref: nextRef(project, type),
    params: { ...defaults, ...params },
  };
}

export function defaultCableParams(project: Project, overrides: Partial<CableParams> = {}): CableParams {
  return {
    tag: nextCableTag(project),
    lengthM: 1,
    insulationTemp: project.rulebook.defaultInsulationDc ?? 105,
    inEngineSpace: false,
    bundleCount: 1,
    ambientC: 30,
    ...overrides,
  };
}

export function makeCable(project: Project, from: Cable['from'], to: Cable['to'], overrides: Partial<CableParams> = {}): Cable {
  return { id: uid('w'), from, to, params: defaultCableParams(project, overrides) };
}

/** Validate a parsed JSON object as a project. Returns an error message when it is not one. */
export function validateProject(obj: unknown): string | undefined {
  if (!obj || typeof obj !== 'object') return 'File is not a project.';
  const p = obj as Partial<Project>;
  if (p.schemaVersion !== 1) return 'Unsupported project version.';
  if (!Array.isArray(p.components) || !Array.isArray(p.cables)) return 'Project is missing components or cables.';
  for (const c of p.components) if (!CATALOGUE[c.type]) return `Unknown component type "${c.type}".`;
  return undefined;
}
