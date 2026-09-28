import type { Analysis, LoadCircuit } from '../../calc/analysis';
import { useProject } from '../../store/project';

function fmt(n: number | undefined, d = 1): string {
  if (n === undefined || Number.isNaN(n)) return '-';
  if (!Number.isFinite(n)) return '∞';
  return n.toFixed(d);
}

function LoadTable({ loads, voltage }: { loads: LoadCircuit[]; voltage?: number }) {
  const focusOn = useProject((s) => s.focusOn);
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Ref</th><th>Load</th><th>Category</th><th className="num">W</th><th className="num">A</th><th className="num">h/day</th><th className="num">Duty</th><th className="num">Wh/day</th>
          {voltage ? <th className="num">Ah/day</th> : null}
          <th className="num">Vd %</th><th>Protection</th><th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {loads.map((l) => (
          <tr key={l.loadId} className={l.issues.length ? 'row-error' : ''} onClick={() => focusOn({ componentIds: [l.loadId], cableIds: [] })}>
            <td>{l.ref}</td>
            <td>{l.name}{l.critical ? <span className="tag">critical</span> : null}</td>
            <td>{l.category}</td>
            <td className="num">{fmt(l.watts, 0)}</td>
            <td className="num">{fmt(l.currentA)}</td>
            <td className="num">{fmt(l.hoursPerDay)}</td>
            <td className="num">{fmt(l.dutyCycle, 2)}</td>
            <td className="num">{fmt(l.dailyWh, 0)}</td>
            {voltage ? <td className="num">{fmt(l.dailyWh / voltage)}</td> : null}
            <td className={`num${l.vdPct !== undefined && l.vdPct > l.vdLimitPct ? ' bad' : ''}`}>{fmt(l.vdPct)} / {l.vdLimitPct}</td>
            <td>{l.protection.map((p) => `${p.ref} ${p.rating}A`).join(' → ') || '-'}</td>
            <td className="issues">{l.issues.join(' ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LoadsView({ analysis }: { analysis: Analysis }) {
  const rb = useProject((s) => s.project.rulebook);
  const orphans = analysis.loads.filter((l) => l.kind === 'dc' && !l.bankId && !l.viaConverter);
  return (
    <div className="page">
      <h2>Load analysis</h2>
      <p className="muted">Daily energy budget per battery bank, with usable capacity from the depth of discharge in the rulebook, and connected load per AC source. Click a row to find it on the schematic.</p>
      {analysis.banks.map((b) => (
        <section key={b.bankId} className="card">
          <h3>{b.name} <span className="muted">({b.voltage} V {b.chemistry.toUpperCase()}, bank id {b.bankId})</span></h3>
          <div className="stats">
            <div><span className="stat-label">Capacity</span><span className="stat-value">{fmt(b.capacityAh, 0)} Ah</span></div>
            <div><span className="stat-label">Usable ({fmt((rb.dodByChemistry[b.chemistry as keyof typeof rb.dodByChemistry] ?? 0.5) * 100, 0)} % DoD)</span><span className="stat-value">{fmt(b.usableAh, 0)} Ah</span></div>
            <div><span className="stat-label">Daily consumption</span><span className="stat-value">{fmt(b.dailyAh, 0)} Ah</span></div>
            <div><span className="stat-label">Autonomy</span><span className={`stat-value${b.autonomyDays < rb.autonomyDays ? ' bad' : ''}`}>{fmt(b.autonomyDays)} days</span></div>
            <div><span className="stat-label">Peak load</span><span className="stat-value">{fmt(b.peakLoadA, 0)} A</span></div>
            <div><span className="stat-label">Charging</span><span className="stat-value">{fmt(b.chargeCurrentA, 0)} A ({fmt(b.chargeRateC * 100, 0)} % C)</span></div>
          </div>
          {b.loads.length ? <LoadTable loads={b.loads} voltage={b.voltage} /> : <p className="muted">No loads connected to this bank.</p>}
        </section>
      ))}
      {orphans.length ? (
        <section className="card">
          <h3>DC loads without a bank</h3>
          <LoadTable loads={orphans} />
        </section>
      ) : null}
      {analysis.acSources.map((s) => (
        <section key={s.sourceId} className="card">
          <h3>{s.ref} {s.name} <span className="muted">({s.type})</span></h3>
          <div className="stats">
            <div><span className="stat-label">Rating</span><span className="stat-value">{fmt(s.ratedA, 0)} A</span></div>
            <div><span className="stat-label">Connected load</span><span className="stat-value">{fmt(s.connectedW, 0)} W</span></div>
            <div><span className="stat-label">Connected current</span><span className={`stat-value${s.connectedA > s.ratedA ? ' bad' : ''}`}>{fmt(s.connectedA)} A ({fmt(s.utilisationPct, 0)} %)</span></div>
          </div>
          {s.loads.length ? <LoadTable loads={s.loads} /> : <p className="muted">No loads supplied from this source.</p>}
        </section>
      ))}
      {!analysis.banks.length && !analysis.acSources.length ? <p className="muted">Add a battery or AC source on the schematic to start.</p> : null}
    </div>
  );
}
