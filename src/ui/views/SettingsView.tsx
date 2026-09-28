import { STANDARDS, VESSEL_USES, defaultRulebook } from '../../model/rulebooks';
import type { BatteryChemistry, StandardId } from '../../model/types';
import { useProject } from '../../store/project';

export function SettingsView() {
  const project = useProject((s) => s.project);
  const updateRulebook = useProject((s) => s.updateRulebook);
  const updateVessel = useProject((s) => s.updateVessel);
  const renameProject = useProject((s) => s.renameProject);
  const rb = project.rulebook;
  const v = project.vessel;
  const num = (key: keyof typeof rb, label: string, step = 0.1, hint?: string) => (
    <label className="field" key={key}>
      <span className="field-label">{label}</span>
      <input type="number" step={step} value={rb[key] as number} onChange={(e) => updateRulebook({ [key]: Number(e.target.value) })} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
  const toggleStandard = (id: StandardId, on: boolean) => {
    const set = new Set(rb.standards);
    if (on) set.add(id);
    else set.delete(id);
    updateRulebook({ standards: [...set] });
  };
  return (
    <div className="page narrow">
      <h2>Project settings</h2>
      <section className="card">
        <h3>Project and vessel</h3>
        <div className="grid2">
          <label className="field"><span className="field-label">Project name</span><input value={project.name} onChange={(e) => renameProject(e.target.value)} /></label>
          <label className="field"><span className="field-label">Vessel name</span><input value={v.name} onChange={(e) => updateVessel({ name: e.target.value })} /></label>
          <label className="field"><span className="field-label">Vessel type</span><input value={v.type} onChange={(e) => updateVessel({ type: e.target.value })} /></label>
          <label className="field"><span className="field-label">Length overall <em>m</em></span><input type="number" step={0.1} value={v.loaM ?? ''} onChange={(e) => updateVessel({ loaM: e.target.value ? Number(e.target.value) : undefined })} /></label>
          <label className="field"><span className="field-label">Builder</span><input value={v.builder ?? ''} onChange={(e) => updateVessel({ builder: e.target.value })} /></label>
          <label className="field"><span className="field-label">Hull number</span><input value={v.hullNumber ?? ''} onChange={(e) => updateVessel({ hullNumber: e.target.value })} /></label>
          <label className="field"><span className="field-label">Designer</span><input value={v.designer ?? ''} onChange={(e) => updateVessel({ designer: e.target.value })} /></label>
          <label className="field"><span className="field-label">Drawing number</span><input value={v.drawingNumber ?? ''} onChange={(e) => updateVessel({ drawingNumber: e.target.value })} /></label>
          <label className="field"><span className="field-label">Revision</span><input value={v.revision ?? ''} onChange={(e) => updateVessel({ revision: e.target.value })} /></label>
        </div>
      </section>
      <section className="card">
        <h3>Rulebook</h3>
        <div className="field">
          <span className="field-label">Vessel use</span>
          {VESSEL_USES.map((u) => (
            <label key={u.id} className="radio">
              <input type="radio" name="use" checked={rb.vesselUse === u.id} onChange={() => updateRulebook({ ...defaultRulebook(u.id) })} />
              <span><strong>{u.label}</strong> <span className="muted">{u.description}</span></span>
            </label>
          ))}
          <small>Changing the vessel use resets the limits below to that use's defaults.</small>
        </div>
        <div className="field">
          <span className="field-label">Standards applied</span>
          {STANDARDS.map((s) => (
            <label key={s.id} className="radio">
              <input type="checkbox" checked={rb.standards.includes(s.id)} onChange={(e) => toggleStandard(s.id, e.target.checked)} />
              <span><strong>{s.title}</strong> <span className="muted">{s.summary}</span></span>
            </label>
          ))}
        </div>
        <div className="grid2">
          {num('dcCriticalVdPct', 'DC voltage drop limit, critical circuits %')}
          {num('dcGeneralVdPct', 'DC voltage drop limit, other circuits %')}
          {num('acVdPct', 'AC voltage drop limit %')}
          {num('maxUnprotectedBatteryM', 'Max unprotected length at battery, m', 0.05, 'Cable between the battery positive and the first fuse.')}
          {num('protectionMarginFactor', 'Protection margin over continuous current', 0.05, 'Warn when the device rating is below this multiple of the load.')}
          {num('engineSpaceDerate', 'Engine space capacity factor', 0.01)}
          {num('copperResistivity', 'Copper resistivity ohm·mm²/m', 0.0005, '0.0175 at 20 °C; use 0.0195 for hot conductors.')}
          {num('autonomyDays', 'Target autonomy, days', 0.5)}
        </div>
        <div className="field">
          <span className="field-label">Design depth of discharge</span>
          <div className="grid4">
            {(['flooded', 'agm', 'gel', 'lifepo4'] as BatteryChemistry[]).map((c) => (
              <label key={c} className="field"><span className="field-label">{c}</span><input type="number" step={0.05} min={0.1} max={1} value={rb.dodByChemistry[c]} onChange={(e) => updateRulebook({ dodByChemistry: { ...rb.dodByChemistry, [c]: Number(e.target.value) } })} /></label>
            ))}
          </div>
        </div>
        <label className="field field-check"><span className="field-label">Require galvanic isolator or isolation transformer on shore power</span><input type="checkbox" checked={rb.requireGalvanicIsolation} onChange={(e) => updateRulebook({ requireGalvanicIsolation: e.target.checked })} /></label>
      </section>
      <section className="card">
        <h3>About the data</h3>
        <p>Cable current ratings, derating factors and colour conventions are seeded from published UK tables. They are a starting point for design, not a substitute for the licensed text of ISO 10133, ISO 13297, the BMEA Code of Practice or the MCA codes. Check the values before issuing a drawing.</p>
      </section>
    </div>
  );
}
