import type { Analysis, CableResult, CheckResult } from '../../calc/analysis';
import { CONDUCTOR_COLOURS, CSA_SIZES } from '../../data/cableTables';
import { CATALOGUE, isAcLoad, isDcLoad, portsOf } from '../../model/catalogue';
import type { Cable, Component, ComponentParams, PanelCircuit } from '../../model/types';
import { useProject } from '../../store/project';
import { FIELDS, type FieldSpec } from './fields';

interface Props {
  analysis: Analysis;
}

function fmt(n: number | undefined, digits = 1): string {
  if (n === undefined || Number.isNaN(n)) return '-';
  if (!Number.isFinite(n)) return '∞';
  return n.toFixed(digits);
}

function ChecksFor({ checks }: { checks: CheckResult[] }) {
  if (!checks.length) return <p className="muted">No findings.</p>;
  return (
    <ul className="check-list compact">
      {checks.map((c) => (
        <li key={c.id} className={`check ${c.severity}`}>
          <span className="sev">{c.severity}</span> {c.message}
        </li>
      ))}
    </ul>
  );
}

function Field({ spec, value, onChange }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  const id = `f-${spec.key}`;
  let control;
  switch (spec.type) {
    case 'number':
      control = <input id={id} type="number" step={spec.step ?? 1} value={value === undefined || value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
      break;
    case 'select':
      control = (
        <select id={id} value={value === undefined ? '' : String(value)} onChange={(e) => { const opt = spec.options?.find((o) => String(o.value) === e.target.value); onChange(opt ? opt.value : e.target.value); }}>
          {spec.options?.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
      );
      break;
    case 'checkbox':
      control = <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
      break;
    case 'textarea':
      control = <textarea id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} rows={3} />;
      break;
    default:
      control = <input id={id} type="text" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <label className={`field${spec.type === 'checkbox' ? ' field-check' : ''}`} htmlFor={id}>
      <span className="field-label">{spec.label}{spec.unit ? <em> {spec.unit}</em> : null}</span>
      {control}
      {spec.hint ? <small>{spec.hint}</small> : null}
    </label>
  );
}

function CircuitsEditor({ circuits, onChange }: { circuits: PanelCircuit[]; onChange: (c: PanelCircuit[]) => void }) {
  const update = (i: number, patch: Partial<PanelCircuit>) => onChange(circuits.map((c, j) => (i === j ? { ...c, ...patch } : c)));
  const add = () => {
    let n = circuits.length + 1;
    while (circuits.some((c) => c.id === `c${n}`)) n++;
    onChange([...circuits, { id: `c${n}`, name: `Circuit ${n}`, rating: 10 }]);
  };
  return (
    <div className="circuits">
      <div className="field-label">Circuits (breaker per output)</div>
      {circuits.map((c, i) => (
        <div key={c.id} className="circuit-row">
          <input value={c.name} onChange={(e) => update(i, { name: e.target.value })} />
          <input type="number" value={c.rating} onChange={(e) => update(i, { rating: Number(e.target.value) })} style={{ width: 60 }} />
          <span>A</span>
          <button className="icon" title="Remove circuit (its cables are removed too)" onClick={() => onChange(circuits.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button className="small" onClick={add}>Add circuit</button>
    </div>
  );
}

function ComponentInspector({ component, analysis }: { component: Component; analysis: Analysis }) {
  const updateComponent = useProject((s) => s.updateComponent);
  const updateRef = useProject((s) => s.updateComponentRef);
  const removeComponents = useProject((s) => s.removeComponents);
  const addParallelBattery = useProject((s) => s.addParallelBattery);
  const commit = useProject((s) => s.commit);
  const def = CATALOGUE[component.type];
  const p = component.params;
  const set = (patch: Partial<ComponentParams>) => updateComponent(component.id, patch);
  const checks = analysis.checks.filter((c) => c.componentIds.includes(component.id));
  const load = analysis.loads.find((l) => l.loadId === component.id);
  const bank = component.type === 'battery' ? analysis.banks.find((b) => b.batteryIds.includes(component.id)) : undefined;
  const src = analysis.acSources.find((s) => s.sourceId === component.id);
  const setCircuits = (circuits: PanelCircuit[]) =>
    commit((d) => {
      const c = d.components.find((x) => x.id === component.id);
      if (!c) return;
      const kept = new Set(circuits.map((x) => `out_${x.id}`));
      c.params.circuits = circuits;
      d.cables = d.cables.filter((w) => !((w.from.component === c.id && w.from.port.startsWith('out_') && !kept.has(w.from.port)) || (w.to.component === c.id && w.to.port.startsWith('out_') && !kept.has(w.to.port))));
    });
  const setPortCount = (n: number) =>
    commit((d) => {
      const c = d.components.find((x) => x.id === component.id);
      if (!c) return;
      c.params.portCount = n;
      const valid = new Set(CATALOGUE[c.type].ports(c.params).map((x) => x.id));
      d.cables = d.cables.filter((w) => !((w.from.component === c.id && !valid.has(w.from.port)) || (w.to.component === c.id && !valid.has(w.to.port))));
    });
  return (
    <div className="inspector-body">
      <h3>{def.label}</h3>
      <p className="muted">{def.description}</p>
      <div className="field-row">
        <label className="field"><span className="field-label">Ref</span><input value={component.ref} onChange={(e) => updateRef(component.id, e.target.value)} /></label>
        <label className="field"><span className="field-label">Name</span><input value={p.name} onChange={(e) => set({ name: e.target.value })} /></label>
      </div>
      {FIELDS[component.type].map((spec) =>
        spec.key === 'portCount' ? (
          <Field key={spec.key} spec={spec} value={p.portCount} onChange={(v) => setPortCount(Math.max(1, Math.min(24, Number(v) || 1)))} />
        ) : (
          <Field key={spec.key} spec={spec} value={p[spec.key]} onChange={(v) => set({ [spec.key]: v })} />
        ),
      )}
      {(component.type === 'dc-panel' || component.type === 'ac-panel') && <CircuitsEditor circuits={p.circuits ?? []} onChange={setCircuits} />}
      {component.type === 'battery' ? (
        <div className="field">
          <span className="field-label">Parallel batteries</span>
          <div className="row-inline">
            <span>{bank ? `${bank.batteryIds.length} in bank ${bank.bankId}` : '1'}</span>
            <button className="small" onClick={() => addParallelBattery(component.id)}>Add battery in parallel</button>
          </div>
          <small>Adds another battery of this spec beside the bank and wires + to + and - to -. Each battery is its own component and can be moved.</small>
          {(p.parallelCount ?? 1) > 1 ? <small>This battery also carries a legacy multiplier of {p.parallelCount}; its capacity is counted {p.parallelCount} times. Set it to 1 after adding real batteries.</small> : null}
        </div>
      ) : null}
      <label className="field"><span className="field-label">Location on vessel</span><input value={p.location ?? ''} onChange={(e) => set({ location: e.target.value })} /></label>
      <label className="field"><span className="field-label">Notes</span><textarea rows={2} value={p.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></label>

      {load && (isDcLoad(component.type) || isAcLoad(component.type) || component.type === 'inverter' || component.type === 'inverter-charger' || component.type === 'dcdc' || component.type === 'charger') ? (
        <section className="result-block">
          <h4>Circuit</h4>
          <dl>
            <dt>Design current</dt><dd>{fmt(load.currentA)} A</dd>
            <dt>Supplied from</dt><dd>{load.sourceRef ?? '-'}{load.viaInverter ? ' (inverter)' : ''}</dd>
            <dt>Protection</dt><dd>{load.protection.length ? load.protection.map((x) => `${x.ref} ${x.rating} A`).join(' → ') : 'none'}</dd>
            <dt>Voltage drop</dt><dd>{fmt(load.vdVolts, 2)} V ({fmt(load.vdPct)} % of {load.vdLimitPct} %)</dd>
            {load.hoursPerDay ? <><dt>Energy per day</dt><dd>{fmt(load.dailyWh, 0)} Wh</dd></> : null}
          </dl>
        </section>
      ) : null}
      {bank ? (
        <section className="result-block">
          <h4>Bank {bank.name}</h4>
          <dl>
            <dt>Capacity</dt><dd>{fmt(bank.capacityAh, 0)} Ah ({fmt(bank.usableAh, 0)} Ah usable)</dd>
            <dt>Daily consumption</dt><dd>{fmt(bank.dailyAh, 0)} Ah</dd>
            <dt>Autonomy</dt><dd>{fmt(bank.autonomyDays)} days</dd>
            <dt>Peak load</dt><dd>{fmt(bank.peakLoadA, 0)} A</dd>
            <dt>Charge sources</dt><dd>{fmt(bank.chargeCurrentA, 0)} A ({fmt(bank.chargeRateC * 100, 0)} % of C)</dd>
          </dl>
        </section>
      ) : null}
      {src ? (
        <section className="result-block">
          <h4>AC source</h4>
          <dl>
            <dt>Rating</dt><dd>{fmt(src.ratedA, 0)} A</dd>
            <dt>Connected load</dt><dd>{fmt(src.connectedW, 0)} W / {fmt(src.connectedA)} A ({fmt(src.utilisationPct, 0)} %)</dd>
          </dl>
        </section>
      ) : null}
      <section className="result-block">
        <h4>Terminals</h4>
        <table className="mini">
          <tbody>
            {portsOf(component).map((port) => {
              const cables = analysis.cables.filter((c) => (c.cableId && ((analysis.network.cables.get(c.cableId)!.from.component === component.id && c.fromPort === port.id) || (analysis.network.cables.get(c.cableId)!.to.component === component.id && c.toPort === port.id))));
              return (
                <tr key={port.id}>
                  <td><span className="dot" style={{ background: CONDUCTOR_COLOURS[port.kind]?.hex }} /> {port.label || port.id}</td>
                  <td>{cables.length ? cables.map((c) => `${c.tag} → ${c.fromRef === component.ref ? c.toRef : c.fromRef}`).join(', ') : <span className="muted">not connected</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="result-block">
        <h4>Findings</h4>
        <ChecksFor checks={checks} />
      </section>
      <button className="danger" onClick={() => removeComponents([component.id])}>Delete component</button>
    </div>
  );
}

function CableInspector({ cable, result, analysis }: { cable: Cable; result?: CableResult; analysis: Analysis }) {
  const updateCable = useProject((s) => s.updateCable);
  const removeCables = useProject((s) => s.removeCables);
  const set = (patch: Partial<Cable['params']>) => updateCable(cable.id, patch);
  const p = cable.params;
  const checks = analysis.checks.filter((c) => c.cableIds.includes(cable.id));
  const from = analysis.network.components.get(cable.from.component);
  const to = analysis.network.components.get(cable.to.component);
  return (
    <div className="inspector-body">
      <h3>Cable {p.tag}</h3>
      <p className="muted">{from?.ref} {from?.params.name} [{cable.from.port}] → {to?.ref} {to?.params.name} [{cable.to.port}]</p>
      <div className="field-row">
        <label className="field"><span className="field-label">Tag</span><input value={p.tag} onChange={(e) => set({ tag: e.target.value })} /></label>
        <label className="field"><span className="field-label">Length <em>m</em></span><input type="number" step={0.1} min={0} value={p.lengthM} onChange={(e) => set({ lengthM: Number(e.target.value) })} /></label>
      </div>
      <label className="field">
        <span className="field-label">Conductor size</span>
        <select value={p.csa === undefined ? 'auto' : String(p.csa)} onChange={(e) => set({ csa: e.target.value === 'auto' ? undefined : Number(e.target.value) })}>
          <option value="auto">Automatic{result?.autoCsa ? ` (${result.autoCsa} mm²)` : ''}</option>
          {CSA_SIZES.map((s) => (
            <option key={s} value={s}>{s} mm²</option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <label className="field"><span className="field-label">Colour</span><input value={p.colour ?? ''} placeholder={result ? result.expectedColour : ''} onChange={(e) => set({ colour: e.target.value })} /></label>
        <label className="field">
          <span className="field-label">Insulation</span>
          <select value={p.insulationTemp} onChange={(e) => set({ insulationTemp: Number(e.target.value) as Cable['params']['insulationTemp'] })}>
            {[70, 85, 90, 105].map((t) => (
              <option key={t} value={t}>{t} °C</option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field"><span className="field-label">Conductors bundled</span><input type="number" min={1} value={p.bundleCount} onChange={(e) => set({ bundleCount: Math.max(1, Number(e.target.value)) })} /></label>
        <label className="field"><span className="field-label">Ambient <em>°C</em></span><input type="number" value={p.ambientC} onChange={(e) => set({ ambientC: Number(e.target.value) })} /></label>
      </div>
      <label className="field field-check"><span className="field-label">Runs through engine space</span><input type="checkbox" checked={p.inEngineSpace} onChange={(e) => set({ inEngineSpace: e.target.checked })} /></label>
      <label className="field"><span className="field-label">Notes</span><textarea rows={2} value={p.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></label>
      {result ? (
        <section className="result-block">
          <h4>Sizing</h4>
          <dl>
            <dt>Network</dt><dd>{result.kind} ({result.expectedColour})</dd>
            <dt>Load current</dt><dd>{fmt(result.loadCurrentA)} A</dd>
            {result.chargeCurrentA ? <><dt>Charge current</dt><dd>{fmt(result.chargeCurrentA)} A</dd></> : null}
            <dt>Protected by</dt><dd>{result.protectedBy ? `${result.protectedBy.ref} ${result.protectedBy.rating} A` : 'none'}</dd>
            <dt>Must carry</dt><dd>{fmt(result.requiredA)} A</dd>
            <dt>Size</dt><dd>{result.csa ? `${result.csa} mm² ${result.manual ? '(fixed)' : '(auto)'}` : '-'}</dd>
            <dt>Derating</dt><dd>× {fmt(result.deratingFactor, 2)}</dd>
            <dt>Capacity</dt><dd>{fmt(result.ampacityA, 0)} A ({fmt(result.utilisationPct, 0)} % used)</dd>
            <dt>Drop in this cable</dt><dd>{fmt(result.vdVolts, 2)} V</dd>
          </dl>
        </section>
      ) : null}
      <section className="result-block">
        <h4>Findings</h4>
        <ChecksFor checks={checks} />
      </section>
      <button className="danger" onClick={() => removeCables([cable.id])}>Delete cable</button>
    </div>
  );
}

export function Inspector({ analysis }: Props) {
  const selection = useProject((s) => s.selection);
  const project = useProject((s) => s.project);
  if (selection.componentIds.length === 1 && selection.cableIds.length === 0) {
    const c = project.components.find((x) => x.id === selection.componentIds[0]);
    if (c) return <aside className="inspector"><ComponentInspector key={c.id} component={c} analysis={analysis} /></aside>;
  }
  if (selection.cableIds.length === 1 && selection.componentIds.length === 0) {
    const w = project.cables.find((x) => x.id === selection.cableIds[0]);
    if (w) return <aside className="inspector"><CableInspector key={w.id} cable={w} result={analysis.cables.find((r) => r.cableId === w.id)} analysis={analysis} /></aside>;
  }
  const total = selection.componentIds.length + selection.cableIds.length;
  return (
    <aside className="inspector">
      <div className="inspector-body">
        <h3>{total > 1 ? `${total} items selected` : 'Nothing selected'}</h3>
        <p className="muted">{total > 1 ? 'Press Delete to remove them, Ctrl+C / Ctrl+V to copy and paste them, or Ctrl+D to duplicate. Select a single item to edit it.' : 'Select a component or cable to edit its parameters and see its sizing and findings. Ctrl+C / Ctrl+V copies and pastes selected components, Ctrl+D duplicates.'}</p>
        <section className="result-block">
          <h4>Design summary</h4>
          <dl>
            <dt>Components</dt><dd>{project.components.length}</dd>
            <dt>Cables</dt><dd>{project.cables.length}</dd>
            <dt>Errors</dt><dd>{analysis.checks.filter((c) => c.severity === 'error').length}</dd>
            <dt>Warnings</dt><dd>{analysis.checks.filter((c) => c.severity === 'warning').length}</dd>
          </dl>
        </section>
        <section className="result-block">
          <h4>Legend</h4>
          <ul className="legend">
            {Object.entries(CONDUCTOR_COLOURS).filter(([k]) => k !== 'any').map(([k, v]) => (
              <li key={k}><span className="dot" style={{ background: v.hex }} /> {k} – {v.name}</li>
            ))}
          </ul>
          <p className="muted">Cable labels: tag · size (* = automatic) · length.</p>
        </section>
      </div>
    </aside>
  );
}
