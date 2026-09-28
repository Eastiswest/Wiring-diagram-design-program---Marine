/**
 * Electrical network model derived from the project graph.
 *
 * Builds a port-level graph: every (component, port) is a vertex; cables and
 * internal component links (busbar studs, breaker in/out, panel feeds) are
 * edges. Path tracing from loads and sources to batteries gives the current
 * carried by every cable.
 */
import { CATALOGUE, portsOf } from '../model/catalogue';
import type { Cable, Component, NetKind, PortDef, Project } from '../model/types';

export type PortKey = string;
export const portKey = (component: string, port: string): PortKey => `${component}:${port}`;
export const splitKey = (key: PortKey): { component: string; port: string } => {
  const i = key.indexOf(':');
  return { component: key.slice(0, i), port: key.slice(i + 1) };
};

export interface Adjacency {
  /** Neighbouring port key */
  to: PortKey;
  /** Cable id if this hop is a cable, otherwise the hop is internal to a component */
  cableId?: string;
}

export interface Network {
  project: Project;
  components: Map<string, Component>;
  cables: Map<string, Cable>;
  ports: Map<string, PortDef[]>;
  adj: Map<PortKey, Adjacency[]>;
  /** Net id for every port key */
  netOf: Map<PortKey, number>;
  /** Resolved kind for every net */
  netKind: Map<number, NetKind>;
  /** Nets whose ports disagree on kind (e.g. DC+ wired to DC-) */
  conflictingNets: Map<number, NetKind[]>;
  /** Resolved kind for every cable */
  cableKind: Map<string, NetKind>;
}

/** Components whose grouped ports are electrically joined, modelled through switch state. */
function internalLinks(component: Component, ports: PortDef[]): [string, string][] {
  const links: [string, string][] = [];
  if (component.type === 'battery-switch' && component.params.closed === false) return links;
  const groups = new Map<string, string[]>();
  for (const p of ports) {
    if (!p.group) continue;
    const list = groups.get(p.group) ?? [];
    list.push(p.id);
    groups.set(p.group, list);
  }
  if (component.type === 'dc-panel') {
    for (const p of ports) if (p.id.startsWith('out_')) links.push(['feed', p.id]);
  }
  if (component.type === 'ac-panel') {
    for (const p of ports) if (p.id.startsWith('out_')) links.push(['feedL', p.id]);
  }
  for (const ids of groups.values()) {
    for (let i = 1; i < ids.length; i++) links.push([ids[0], ids[i]]);
  }
  return links;
}

export function buildNetwork(project: Project): Network {
  const components = new Map(project.components.map((c) => [c.id, c]));
  const cables = new Map(project.cables.map((c) => [c.id, c]));
  const ports = new Map<string, PortDef[]>();
  const adj = new Map<PortKey, Adjacency[]>();
  const add = (a: PortKey, b: PortKey, cableId?: string) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ to: b, cableId });
    (adj.get(b) ?? adj.set(b, []).get(b)!).push({ to: a, cableId });
  };
  for (const c of project.components) {
    const defs = portsOf(c);
    ports.set(c.id, defs);
    for (const p of defs) if (!adj.has(portKey(c.id, p.id))) adj.set(portKey(c.id, p.id), []);
    for (const [a, b] of internalLinks(c, defs)) add(portKey(c.id, a), portKey(c.id, b));
  }
  for (const cable of project.cables) {
    if (!components.has(cable.from.component) || !components.has(cable.to.component)) continue;
    add(portKey(cable.from.component, cable.from.port), portKey(cable.to.component, cable.to.port), cable.id);
  }

  // Connected components => nets. Kind inference ignores 'any' ports.
  const netOf = new Map<PortKey, number>();
  const netKind = new Map<number, NetKind>();
  const conflictingNets = new Map<number, NetKind[]>();
  let netId = 0;
  for (const start of adj.keys()) {
    if (netOf.has(start)) continue;
    const id = netId++;
    const kinds = new Set<NetKind>();
    const stack = [start];
    netOf.set(start, id);
    while (stack.length) {
      const key = stack.pop()!;
      const { component, port } = splitKey(key);
      const def = ports.get(component)?.find((p) => p.id === port);
      if (def && def.kind !== 'any') kinds.add(def.kind);
      for (const n of adj.get(key) ?? []) {
        if (!netOf.has(n.to)) {
          netOf.set(n.to, id);
          stack.push(n.to);
        }
      }
    }
    for (const cable of project.cables) {
      if (cable.params.kindOverride && netOf.get(portKey(cable.from.component, cable.from.port)) === id) {
        kinds.add(cable.params.kindOverride);
      }
    }
    const list = [...kinds];
    if (list.length > 1) conflictingNets.set(id, list);
    netKind.set(id, list[0] ?? 'any');
  }

  const cableKind = new Map<string, NetKind>();
  for (const cable of project.cables) {
    const id = netOf.get(portKey(cable.from.component, cable.from.port));
    cableKind.set(cable.id, cable.params.kindOverride ?? (id === undefined ? 'any' : (netKind.get(id) ?? 'any')));
  }

  return { project, components, cables, ports, adj, netOf, netKind, conflictingNets, cableKind };
}

export interface Hop {
  from: PortKey;
  to: PortKey;
  cableId?: string;
}

export interface TraceResult {
  /** Port key where the trace ended (a matching target) */
  target: PortKey;
  hops: Hop[];
}

/**
 * Breadth-first trace from a port to the nearest port satisfying `isTarget`.
 * Returns the hop list, or undefined if nothing is reachable.
 */
export function trace(
  net: Network,
  start: PortKey,
  isTarget: (key: PortKey, component: Component, port: PortDef) => boolean,
  options: { avoidComponents?: Set<string> } = {},
): TraceResult | undefined {
  const prev = new Map<PortKey, Hop | null>();
  prev.set(start, null);
  const queue: PortKey[] = [start];
  while (queue.length) {
    const key = queue.shift()!;
    const { component, port } = splitKey(key);
    const comp = net.components.get(component);
    const def = net.ports.get(component)?.find((p) => p.id === port);
    if (comp && def && key !== start && isTarget(key, comp, def)) {
      const hops: Hop[] = [];
      let cur: PortKey = key;
      while (prev.get(cur)) {
        const h = prev.get(cur)!;
        hops.unshift(h);
        cur = h.from;
      }
      return { target: key, hops };
    }
    for (const n of net.adj.get(key) ?? []) {
      if (prev.has(n.to)) continue;
      const nextComp = splitKey(n.to).component;
      if (options.avoidComponents?.has(nextComp) && !n.cableId) continue;
      prev.set(n.to, { from: key, to: n.to, cableId: n.cableId });
      queue.push(n.to);
    }
  }
  return undefined;
}

/** All port keys reachable from a start port, without leaving through the given component types. */
export function reachable(net: Network, start: PortKey): Set<PortKey> {
  const seen = new Set<PortKey>([start]);
  const stack = [start];
  while (stack.length) {
    const key = stack.pop()!;
    for (const n of net.adj.get(key) ?? []) {
      if (!seen.has(n.to)) {
        seen.add(n.to);
        stack.push(n.to);
      }
    }
  }
  return seen;
}

/** Protection devices traversed on a path, with the effective rating. */
export interface ProtectionOnPath {
  componentId: string;
  ref: string;
  name: string;
  rating: number;
  interruptA?: number;
  protectionType?: string;
  /** Panel circuit id when the protection is a panel breaker */
  circuitId?: string;
}

export function protectionOnPath(net: Network, hops: Hop[]): ProtectionOnPath[] {
  const found: ProtectionOnPath[] = [];
  for (const h of hops) {
    if (h.cableId) continue;
    const a = splitKey(h.from);
    const b = splitKey(h.to);
    if (a.component !== b.component) continue;
    const comp = net.components.get(a.component);
    if (!comp) continue;
    const t = comp.type;
    if (t === 'fuse' || t === 'breaker' || t === 'rcd' || t === 'ac-breaker-2p') {
      if (!found.some((f) => f.componentId === comp.id)) {
        found.push({
          componentId: comp.id,
          ref: comp.ref,
          name: comp.params.name,
          rating: comp.params.rating ?? 0,
          interruptA: comp.params.interruptA,
          protectionType: comp.params.protectionType,
        });
      }
    } else if (t === 'dc-panel' || t === 'ac-panel') {
      const outPort = [a.port, b.port].find((p) => p.startsWith('out_'));
      if (outPort) {
        const circuitId = outPort.slice(4);
        const circuit = comp.params.circuits?.find((c) => c.id === circuitId);
        if (circuit && !found.some((f) => f.componentId === comp.id && f.circuitId === circuitId)) {
          found.push({
            componentId: comp.id,
            ref: `${comp.ref}/${circuit.name}`,
            name: circuit.name,
            rating: circuit.rating,
            protectionType: 'MCB',
            circuitId,
          });
        }
      }
    }
  }
  return found;
}

export const label = (c: Component): string => `${c.ref} ${c.params.name}`;
export const defOf = (type: Component['type']) => CATALOGUE[type];
