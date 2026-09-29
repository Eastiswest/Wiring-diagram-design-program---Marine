import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import type { CableResult } from '../../calc/analysis';
import { CONDUCTOR_COLOURS } from '../../data/cableTables';
import type { Cable } from '../../model/types';
import { strokeForCsa } from './layout';

export type CableEdgeData = { cable: Cable; result?: CableResult; error: boolean; warning: boolean; showLabels: boolean };
export type CableEdgeType = Edge<CableEdgeData, 'cable'>;

export function cableLabel(cable: Cable, result?: CableResult): string {
  const parts = [cable.params.tag];
  if (result?.stud) parts.push('stud');
  if (result?.csa) parts.push(`${result.csa} mm²${result.manual ? '' : '*'}`);
  if (cable.params.lengthM) parts.push(`${cable.params.lengthM} m`);
  return parts.join(' · ');
}

function CableEdgeInner(props: EdgeProps<CableEdgeType>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const kind = data?.result?.kind ?? 'any';
  const colour = CONDUCTOR_COLOURS[kind]?.hex ?? '#888';
  if (data?.result?.stud) {
    // Stud link: straight, heavy, unlabelled. Invisible when the fuse sits on the terminal.
    const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    return (
      <>
        {selected ? <BaseEdge path={path} style={{ stroke: '#2563eb', strokeWidth: 10, opacity: 0.35 }} /> : null}
        <BaseEdge path={path} style={{ stroke: '#6b7280', strokeWidth: 6, strokeLinecap: 'round' }} interactionWidth={16} />
      </>
    );
  }
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 6 });
  const width = strokeForCsa(data?.result?.csa);
  return (
    <>
      {selected ? <BaseEdge path={path} style={{ stroke: '#2563eb', strokeWidth: width + 4, opacity: 0.35 }} /> : null}
      {data?.error ? <BaseEdge path={path} style={{ stroke: '#dc2626', strokeWidth: width + 4, opacity: 0.3 }} /> : null}
      <BaseEdge path={path} markerEnd={markerEnd} style={{ stroke: colour, strokeWidth: width }} interactionWidth={16} />
      {data?.showLabels && data.cable ? (
        <EdgeLabelRenderer>
          <div
            className={`edge-label${data.error ? ' edge-label-error' : data.warning ? ' edge-label-warning' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {cableLabel(data.cable, data.result)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const CableEdge = memo(CableEdgeInner);
