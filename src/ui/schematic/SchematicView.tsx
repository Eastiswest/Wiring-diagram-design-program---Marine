import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type IsValidConnection,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { Analysis } from '../../calc/analysis';
import { portDef } from '../../model/catalogue';
import type { ComponentType } from '../../model/types';
import { useProject } from '../../store/project';
import { CableEdge, type CableEdgeType } from './CableEdge';
import { ComponentNode, type ComponentNodeType } from './ComponentNode';
import { Inspector } from './Inspector';
import { DRAG_MIME, Palette } from './Palette';

const nodeTypes = { component: ComponentNode };
const edgeTypes = { cable: CableEdge };

function Canvas({ analysis, showLabels }: { analysis: Analysis; showLabels: boolean }) {
  const project = useProject((s) => s.project);
  const selection = useProject((s) => s.selection);
  const focusToken = useProject((s) => s.focusToken);
  const select = useProject((s) => s.select);
  const moveComponents = useProject((s) => s.moveComponents);
  const addComponent = useProject((s) => s.addComponent);
  const addCable = useProject((s) => s.addCable);
  const removeComponents = useProject((s) => s.removeComponents);
  const removeCables = useProject((s) => s.removeCables);
  const [nodes, setNodes, onNodesChange] = useNodesState<ComponentNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CableEdgeType>([]);
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const severityByComponent = useMemo(() => {
    const m = new Map<string, { errors: number; warnings: number }>();
    const w = new Map<string, { errors: number; warnings: number }>();
    for (const c of analysis.checks) {
      for (const id of c.componentIds) {
        const e = m.get(id) ?? { errors: 0, warnings: 0 };
        if (c.severity === 'error') e.errors++;
        else if (c.severity === 'warning') e.warnings++;
        m.set(id, e);
      }
      for (const id of c.cableIds) {
        const e = w.get(id) ?? { errors: 0, warnings: 0 };
        if (c.severity === 'error') e.errors++;
        else if (c.severity === 'warning') e.warnings++;
        w.set(id, e);
      }
    }
    return { components: m, cables: w };
  }, [analysis]);

  useEffect(() => {
    const selectedC = new Set(selection.componentIds);
    const selectedW = new Set(selection.cableIds);
    setNodes((cur) => {
      const prev = new Map(cur.map((n) => [n.id, n]));
      return project.components.map((c) => {
        const p = prev.get(c.id);
        const sev = severityByComponent.components.get(c.id) ?? { errors: 0, warnings: 0 };
        return {
          ...(p ?? {}),
          id: c.id,
          type: 'component' as const,
          position: p?.dragging ? p.position : { x: c.x, y: c.y },
          data: { component: c, errors: sev.errors, warnings: sev.warnings },
          selected: selectedC.has(c.id),
        };
      });
    });
    const results = new Map(analysis.cables.map((r) => [r.cableId, r]));
    setEdges((cur) => {
      const prev = new Map(cur.map((e) => [e.id, e]));
      return project.cables.map((w) => {
        const sev = severityByComponent.cables.get(w.id) ?? { errors: 0, warnings: 0 };
        return {
          ...(prev.get(w.id) ?? {}),
          id: w.id,
          type: 'cable' as const,
          source: w.from.component,
          sourceHandle: w.from.port,
          target: w.to.component,
          targetHandle: w.to.port,
          data: { cable: w, result: results.get(w.id), error: sev.errors > 0, warning: sev.warnings > 0, showLabels },
          selected: selectedW.has(w.id),
        };
      });
    });
  }, [project, analysis, selection, severityByComponent, showLabels, setNodes, setEdges]);

  useEffect(() => {
    if (!focusToken) return;
    const ids = selection.componentIds;
    const t = window.setTimeout(() => {
      if (ids.length) rf.fitView({ nodes: ids.map((id) => ({ id })), duration: 400, padding: 0.5, maxZoom: 1.5 });
      else if (selection.cableIds.length) {
        const cable = project.cables.find((w) => w.id === selection.cableIds[0]);
        if (cable) rf.fitView({ nodes: [{ id: cable.from.component }, { id: cable.to.component }], duration: 400, padding: 0.5, maxZoom: 1.5 });
      }
    }, 50);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken]);

  const onSelectionChange = useCallback(
    ({ nodes: n, edges: e }: OnSelectionChangeParams) => {
      const componentIds = n.map((x) => x.id);
      const cableIds = e.map((x) => x.id);
      const cur = useProject.getState().selection;
      if (componentIds.join() === cur.componentIds.join() && cableIds.join() === cur.cableIds.join()) return;
      select({ componentIds, cableIds });
    },
    [select],
  );

  const isValidConnection: IsValidConnection = useCallback(
    (conn) => {
      const c = conn as Connection;
      if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return false;
      if (c.source === c.target && c.sourceHandle === c.targetHandle) return false;
      const a = project.components.find((x) => x.id === c.source);
      const b = project.components.find((x) => x.id === c.target);
      if (!a || !b) return false;
      const pa = portDef(a, c.sourceHandle);
      const pb = portDef(b, c.targetHandle);
      if (!pa || !pb) return false;
      return pa.kind === 'any' || pb.kind === 'any' || pa.kind === pb.kind;
    },
    [project],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.sourceHandle || !c.targetHandle) return;
      addCable({ component: c.source, port: c.sourceHandle }, { component: c.target, port: c.targetHandle });
    },
    [addCable],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DRAG_MIME) as ComponentType;
      if (!type) return;
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addComponent(type, Math.round(pos.x / 10) * 10, Math.round(pos.y / 10) * 10);
    },
    [rf, addComponent],
  );

  const addAtCentre = useCallback(
    (type: ComponentType) => {
      const el = wrapper.current;
      const rect = el?.getBoundingClientRect();
      const centre = rect ? rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 0, y: 0 };
      const c = addComponent(type, Math.round(centre.x / 10) * 10, Math.round(centre.y / 10) * 10);
      select({ componentIds: [c.id], cableIds: [] });
    },
    [rf, addComponent, select],
  );

  return (
    <>
      <Palette onAdd={addAtCentre} />
      <div className="canvas" ref={wrapper} onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={(_e, _node, dragged) => moveComponents(dragged.map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) })))}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          connectionMode={ConnectionMode.Loose}
          onSelectionChange={onSelectionChange}
          onNodesDelete={(deleted) => removeComponents(deleted.map((n) => n.id))}
          onEdgesDelete={(deleted) => removeCables(deleted.map((e) => e.id))}
          deleteKeyCode={['Delete', 'Backspace']}
          snapToGrid
          snapGrid={[10, 10]}
          fitView
          minZoom={0.1}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} />
          <Controls />
          <MiniMap pannable zoomable nodeStrokeWidth={2} />
        </ReactFlow>
      </div>
    </>
  );
}

export function SchematicView({ analysis }: { analysis: Analysis }) {
  const [showLabels, setShowLabels] = useState(true);
  return (
    <div className="schematic">
      <ReactFlowProvider>
        <Canvas analysis={analysis} showLabels={showLabels} />
      </ReactFlowProvider>
      <div className="inspector-column">
        <label className="toolbar-check"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Cable labels</label>
        <Inspector analysis={analysis} />
      </div>
    </div>
  );
}
