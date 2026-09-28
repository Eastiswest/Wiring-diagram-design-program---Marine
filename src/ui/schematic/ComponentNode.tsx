import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { memo } from 'react';
import { CONDUCTOR_COLOURS } from '../../data/cableTables';
import type { Component } from '../../model/types';
import { nodeSize, portPositions } from './layout';
import { Symbol } from './symbols';

export type ComponentNodeData = { component: Component; errors: number; warnings: number };
export type ComponentNodeType = Node<ComponentNodeData, 'component'>;

const POSITION: Record<string, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

function ComponentNodeInner({ data, selected }: NodeProps<ComponentNodeType>) {
  const { component, errors, warnings } = data;
  const { width, height } = nodeSize(component);
  const ports = portPositions(component);
  return (
    <div className={`component-node${selected ? ' selected' : ''}${errors ? ' has-error' : warnings ? ' has-warning' : ''}`} style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="symbol">
        <Symbol component={component} width={width} height={height} />
      </svg>
      {ports.map((p) => {
        const colour = CONDUCTOR_COLOURS[p.kind]?.hex ?? '#888';
        const labelSide = p.side;
        return (
          <div key={p.id} className={`port port-${labelSide}`} style={{ left: p.x, top: p.y }}>
            <Handle
              id={p.id}
              type="source"
              position={POSITION[p.side]}
              className={`handle kind-${p.kind}`}
              style={{ background: colour, borderColor: colour }}
              title={`${p.label} (${p.kind})`}
            />
            {p.label ? <span className="port-label">{p.label}</span> : null}
          </div>
        );
      })}
      {errors ? <span className="badge badge-error" title={`${errors} error(s)`}>{errors}</span> : warnings ? <span className="badge badge-warning" title={`${warnings} warning(s)`}>{warnings}</span> : null}
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeInner);
