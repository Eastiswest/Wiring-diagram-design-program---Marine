import type { Analysis, Severity } from '../../calc/analysis';
import { STANDARDS } from '../../model/rulebooks';
import { useProject } from '../../store/project';

const ORDER: Severity[] = ['error', 'warning', 'info'];
const TITLES: Record<Severity, string> = { error: 'Errors', warning: 'Warnings', info: 'Information' };

export function ChecksView({ analysis }: { analysis: Analysis }) {
  const focusOn = useProject((s) => s.focusOn);
  const standards = useProject((s) => s.project.rulebook.standards);
  return (
    <div className="page">
      <h2>Design checks</h2>
      <p className="muted">
        Rules applied: {standards.map((s) => STANDARDS.find((x) => x.id === s)?.title.split(' - ')[0] ?? s).join(', ')}. Errors must be resolved before the design is issued; warnings need an engineering decision. Click a finding to locate it.
      </p>
      {analysis.checks.length === 0 ? <p className="ok">No findings. The design passes every automated check.</p> : null}
      {ORDER.map((sev) => {
        const items = analysis.checks.filter((c) => c.severity === sev);
        if (!items.length) return null;
        return (
          <section key={sev} className="card">
            <h3>{TITLES[sev]} <span className="muted">({items.length})</span></h3>
            <ul className="check-list">
              {items.map((c) => (
                <li key={c.id} className={`check ${c.severity}`} onClick={() => focusOn({ componentIds: c.componentIds, cableIds: c.componentIds.length ? [] : c.cableIds })}>
                  <span className="sev">{c.severity}</span>
                  <span className="msg">{c.message}</span>
                  {c.standard && c.standard !== 'general' ? <span className="std">{c.standard}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <section className="card">
        <h3>What is checked</h3>
        <ul className="plain">
          <li>Every load has a supply and return path, a fuse or breaker on the supply, and a source of the right voltage.</li>
          <li>Cable capacity after derating (insulation grade, bundling, ambient temperature, engine space) covers the circuit current and the protective device rating.</li>
          <li>Voltage drop at each load against the critical and general limits in the rulebook, using the total current in every shared cable.</li>
          <li>Battery main fuse present, close to the terminal, and of a suitable interrupt rating for lithium banks.</li>
          <li>Shore power: 30 mA RCD, double-pole main disconnect close to the inlet, galvanic isolation, neutral-earth link at onboard sources, protective earth on every AC load.</li>
          <li>Bank autonomy against the target days and charge rate against the chemistry.</li>
          <li>Bonding of underwater metals and anodes, NMEA 2000 power and network load, conductor colours.</li>
          <li>MCA coded vessels: bilge, navigation light and second bank reminders.</li>
        </ul>
        <p className="muted">Cable rating tables are seeded from published UK tables and must be verified against the licensed standard before issue. They are editable in one file, <code>src/data/cableTables.ts</code>.</p>
      </section>
    </div>
  );
}
