import { useState } from 'react';
import type { Analysis } from '../../calc/analysis';
import { CONDUCTOR_COLOURS } from '../../data/cableTables';
import { CATALOGUE, portsOf } from '../../model/catalogue';
import { useProject } from '../../store/project';

/**
 * Point-to-point wiring view: for every component, which cable lands on each
 * terminal and where its far end goes. This is the installer's view, generated
 * from the same data as the schematic.
 */
export function WiringView({ analysis }: { analysis: Analysis }) {
  const project = useProject((s) => s.project);
  const focusOn = useProject((s) => s.focusOn);
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const results = new Map(analysis.cables.map((r) => [r.cableId, r]));
  const comps = [...project.components]
    .filter((c) => !q || c.ref.toLowerCase().includes(q) || c.params.name.toLowerCase().includes(q) || (c.params.location ?? '').toLowerCase().includes(q))
    .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
  return (
    <div className="page">
      <h2>Point-to-point wiring</h2>
      <p className="muted">Terminal-by-terminal connection list for installation, generated from the schematic. Print this page for the installer.</p>
      <div className="toolbar-row no-print">
        <input placeholder="Filter by ref, name or location" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button onClick={() => window.print()}>Print</button>
      </div>
      {comps.map((c) => {
        const ports = portsOf(c);
        const rows = ports.map((port) => {
          const cables = project.cables.filter((w) => (w.from.component === c.id && w.from.port === port.id) || (w.to.component === c.id && w.to.port === port.id));
          return { port, cables };
        });
        if (!rows.some((r) => r.cables.length)) return null;
        return (
          <section key={c.id} className="card wiring-card">
            <h3>
              <button className="link" onClick={() => focusOn({ componentIds: [c.id], cableIds: [] })}>{c.ref}</button> {c.params.name}
              <span className="muted"> · {CATALOGUE[c.type].label}{c.params.location ? ` · ${c.params.location}` : ''}</span>
            </h3>
            <table className="data">
              <thead>
                <tr><th>Terminal</th><th>Net</th><th>Cable</th><th>Size</th><th>Colour</th><th className="num">Length m</th><th>Far end</th><th>Far terminal</th></tr>
              </thead>
              <tbody>
                {rows.flatMap(({ port, cables }) =>
                  cables.length
                    ? cables.map((w) => {
                        const r = results.get(w.id);
                        const farIsFrom = w.to.component === c.id && w.to.port === port.id;
                        const farId = farIsFrom ? w.from.component : w.to.component;
                        const farPort = farIsFrom ? w.from.port : w.to.port;
                        const far = project.components.find((x) => x.id === farId);
                        const farPortDef = far ? portsOf(far).find((p) => p.id === farPort) : undefined;
                        return (
                          <tr key={`${port.id}-${w.id}`}>
                            <td>{port.label || port.id}</td>
                            <td><span className="dot" style={{ background: CONDUCTOR_COLOURS[r?.kind ?? port.kind]?.hex }} /> {r?.kind ?? port.kind}</td>
                            <td>{w.params.tag}</td>
                            <td>{r?.csa ? `${r.csa} mm²` : '-'}</td>
                            <td>{w.params.colour || r?.expectedColour || '-'}</td>
                            <td className="num">{w.params.lengthM}</td>
                            <td>{far ? `${far.ref} ${far.params.name}` : '?'}{far?.params.location ? <span className="muted"> ({far.params.location})</span> : null}</td>
                            <td>{farPortDef?.label || farPort}</td>
                          </tr>
                        );
                      })
                    : [
                        <tr key={port.id} className="muted-row">
                          <td>{port.label || port.id}</td>
                          <td>{port.kind}</td>
                          <td colSpan={6} className="muted">spare</td>
                        </tr>,
                      ],
                )}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
