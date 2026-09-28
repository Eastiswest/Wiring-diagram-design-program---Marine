import { useState } from 'react';
import { newProject } from '../model/project';
import { STANDARDS, VESSEL_USES, defaultRulebook } from '../model/rulebooks';
import type { StandardId, VesselUse } from '../model/types';
import { useProject } from '../store/project';

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const loadProject = useProject((s) => s.loadProject);
  const [name, setName] = useState('New vessel');
  const [vesselName, setVesselName] = useState('');
  const [vesselType, setVesselType] = useState('');
  const [loa, setLoa] = useState('');
  const [use, setUse] = useState<VesselUse>('leisure');
  const [standards, setStandards] = useState<StandardId[]>(defaultRulebook('leisure').standards);
  const chooseUse = (u: VesselUse) => {
    setUse(u);
    setStandards(defaultRulebook(u).standards);
  };
  const toggle = (id: StandardId) => setStandards((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const create = () => {
    const p = newProject(name.trim() || 'New vessel', { name: vesselName || name, type: vesselType, loaM: loa ? Number(loa) : undefined }, use);
    p.rulebook.standards = standards;
    loadProject(p);
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New project</h2>
        <div className="grid2">
          <label className="field"><span className="field-label">Project name</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span className="field-label">Vessel name</span><input value={vesselName} onChange={(e) => setVesselName(e.target.value)} /></label>
          <label className="field"><span className="field-label">Vessel type</span><input placeholder="Sailing yacht, motor cruiser, workboat" value={vesselType} onChange={(e) => setVesselType(e.target.value)} /></label>
          <label className="field"><span className="field-label">Length overall <em>m</em></span><input type="number" step={0.1} value={loa} onChange={(e) => setLoa(e.target.value)} /></label>
        </div>
        <div className="field">
          <span className="field-label">Vessel use</span>
          {VESSEL_USES.map((u) => (
            <label key={u.id} className="radio">
              <input type="radio" name="new-use" checked={use === u.id} onChange={() => chooseUse(u.id)} />
              <span><strong>{u.label}</strong> <span className="muted">{u.description}</span></span>
            </label>
          ))}
        </div>
        <div className="field">
          <span className="field-label">Standards to check against</span>
          {STANDARDS.map((s) => (
            <label key={s.id} className="radio">
              <input type="checkbox" checked={standards.includes(s.id)} onChange={() => toggle(s.id)} />
              <span><strong>{s.title}</strong> <span className="muted">{s.summary}</span></span>
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={create}>Create project</button>
        </div>
      </div>
    </div>
  );
}
