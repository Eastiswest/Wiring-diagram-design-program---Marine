import { CATALOGUE, portsOf } from '../../model/catalogue';
import type { Component, PortDef, Project, Side } from '../../model/types';

export interface NodeSize {
  width: number;
  height: number;
}

export interface PortPosition extends PortDef {
  /** Position relative to the node's top-left corner */
  x: number;
  y: number;
}

const PORT_PITCH = 20;

export function nodeSize(component: Component): NodeSize {
  const def = CATALOGUE[component.type];
  const ports = portsOf(component);
  const count = (side: Side) => ports.filter((p) => p.side === side).length;
  const vertical = Math.max(count('left'), count('right'));
  const horizontal = Math.max(count('top'), count('bottom'));
  return {
    width: Math.max(def.width, horizontal * PORT_PITCH + 24),
    height: Math.max(def.height, vertical * PORT_PITCH + 24),
  };
}

export function portPositions(component: Component): PortPosition[] {
  const { width, height } = nodeSize(component);
  const ports = portsOf(component);
  const out: PortPosition[] = [];
  for (const side of ['left', 'right', 'top', 'bottom'] as Side[]) {
    const list = ports.filter((p) => p.side === side);
    list.forEach((p, i) => {
      const t = (i + 1) / (list.length + 1);
      let x = 0;
      let y = 0;
      switch (side) {
        case 'left':
          x = 0;
          y = height * t;
          break;
        case 'right':
          x = width;
          y = height * t;
          break;
        case 'top':
          x = width * t;
          y = 0;
          break;
        case 'bottom':
          x = width * t;
          y = height;
          break;
      }
      out.push({ ...p, x, y });
    });
  }
  return out;
}

/** Stroke width used for a cable on the schematic, from its cross-section. */
export function strokeForCsa(csa?: number): number {
  if (!csa) return 1.5;
  if (csa <= 1.5) return 1.5;
  if (csa <= 6) return 2;
  if (csa <= 25) return 3;
  if (csa <= 70) return 4;
  return 5;
}

/** Position for a terminal fuse so that its stud port sits exactly on the battery's positive terminal. */
export function studPosition(battery: Component, fuse: Component): { x: number; y: number } {
  const bPos = portPositions(battery).find((p) => p.id === 'pos');
  const fStud = portPositions(fuse).find((p) => p.id === 'in');
  if (!bPos || !fStud) return { x: battery.x, y: battery.y };
  return { x: Math.round(battery.x + bPos.x - fStud.x), y: Math.round(battery.y + bPos.y - fStud.y) };
}

/** Terminal fuses bolted to a battery: connected to its positive by a zero-length stud link. */
export function attachedTerminalFuses(project: Project, batteryId: string): Component[] {
  const ids = new Set<string>();
  for (const w of project.cables) {
    if (w.params.lengthM > 0) continue;
    const ends = [w.from, w.to];
    const bat = ends.find((e) => e.component === batteryId && e.port === 'pos');
    const fuse = ends.find((e) => e.port === 'in' && project.components.find((c) => c.id === e.component)?.type === 'terminal-fuse');
    if (bat && fuse) ids.add(fuse.component);
  }
  return project.components.filter((c) => ids.has(c.id));
}
