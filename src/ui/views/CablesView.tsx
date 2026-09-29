import { useState } from 'react';
import type { Analysis } from '../../calc/analysis';
import { CSA_SIZES } from '../../data/cableTables';
import { useProject } from '../../store/project';

function fmt(n: number | undefined, d = 1): string {
  if (n === undefined || Number.isNaN(n)) return '-';
  return n.toFixed(d);
}

export function CablesView({ analysis }: { analysis: Analysis }) {
  const project = useProject((s) => s.project);
  const updateCable = useProject((s) => s.updateCable);
  const focusOn = useProject((s) => s.focusOn);
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const rows = analysis.cables
    .filter((r) => !q || [r.tag, r.fromLabel, r.toLabel, r.kind].some((s) => s.toLowerCase().includes(q)))
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  const totalLength = new Map<string, number>();
  for (const r of rows) if (r.csa) totalLength.set(`${r.csa}`, (totalLength.get(`${r.csa}`) ?? 0) + r.lengthM);
  return (
    <div className="page">
      <h2>Cable schedule</h2>
      <p className="muted">Every cable with its calculated current, protection and size. Edit length, size and colour directly. Sizes marked auto are recalculated whenever the design changes. Click a tag to find the cable on the schematic.</p>
      <div className="toolbar-row">
        <input placeholder="Filter by tag, component or network" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="muted">{rows.length} cables · {[...totalLength.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([csa, len]) => `${csa} mm²: ${len.toFixed(1)} m`).join(' · ')}</span>
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>Tag</th><th>From</th><th>To</th><th>Net</th><th className="num">Length m</th><th className="num">Load A</th><th className="num">Charge A</th><th>Protected by</th><th className="num">Must carry A</th><th>Size</th><th className="num">Capacity A</th><th className="num">Use %</th><th className="num">Drop V</th><th>Colour</th><th>Eng. space</th><th>Findings</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cable = project.cables.find((w) => w.id === r.cableId)!;
            return (
              <tr key={r.cableId} className={r.issues.length ? 'row-error' : ''}>
                <td><button className="link" onClick={() => focusOn({ componentIds: [], cableIds: [r.cableId] })}>{r.tag}</button></td>
                <td>{r.fromRef} <span className="muted">[{r.fromPort}]</span></td>
                <td>{r.toRef} <span className="muted">[{r.toPort}]</span></td>
                <td>{r.kind}</td>
                <td className="num"><input type="number" className="cell" step={0.1} min={0} value={cable.params.lengthM} onChange={(e) => updateCable(r.cableId, { lengthM: Number(e.target.value) })} /></td>
                <td className="num">{fmt(r.loadCurrentA)}</td>
                <td className="num">{r.chargeCurrentA ? fmt(r.chargeCurrentA) : r.crankCurrentA ? `${fmt(r.crankCurrentA, 0)} crank` : '-'}</td>
                <td>{r.protectedBy ? `${r.protectedBy.ref} ${r.protectedBy.rating} A` : <span className="muted">none</span>}</td>
                <td className="num">{fmt(r.requiredA)}</td>
                <td>
                  <select className="cell" value={cable.params.csa === undefined ? 'auto' : String(cable.params.csa)} onChange={(e) => updateCable(r.cableId, { csa: e.target.value === 'auto' ? undefined : Number(e.target.value) })}>
                    <option value="auto">auto{r.autoCsa ? ` ${r.autoCsa}` : ''}</option>
                    {CSA_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="num">{fmt(r.ampacityA, 0)}</td>
                <td className={`num${r.utilisationPct !== undefined && r.utilisationPct > 100 ? ' bad' : ''}`}>{fmt(r.utilisationPct, 0)}</td>
                <td className="num">{fmt(r.vdVolts, 2)}</td>
                <td><input className="cell" value={cable.params.colour ?? ''} placeholder={r.expectedColour} onChange={(e) => updateCable(r.cableId, { colour: e.target.value })} /></td>
                <td><input type="checkbox" checked={cable.params.inEngineSpace} onChange={(e) => updateCable(r.cableId, { inEngineSpace: e.target.checked })} /></td>
                <td className="issues">{r.issues.join(' ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
