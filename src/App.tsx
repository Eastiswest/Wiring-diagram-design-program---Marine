import { useEffect, useRef, useState } from 'react';
import { download, safeFilename, schematicSvg, svgToPng } from './export/svg';
import { validateProject } from './model/project';
import type { Project } from './model/types';
import { exportProjectJson, useProject, type ViewId } from './store/project';
import { NewProjectDialog } from './ui/NewProjectDialog';
import { SchematicView } from './ui/schematic/SchematicView';
import { useAnalysis } from './ui/useAnalysis';
import { CablesView } from './ui/views/CablesView';
import { ChecksView } from './ui/views/ChecksView';
import { LoadsView } from './ui/views/LoadsView';
import { SettingsView } from './ui/views/SettingsView';
import { WiringView } from './ui/views/WiringView';

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'schematic', label: 'Schematic' },
  { id: 'loads', label: 'Loads & banks' },
  { id: 'cables', label: 'Cable schedule' },
  { id: 'checks', label: 'Checks' },
  { id: 'wiring', label: 'Wiring list' },
  { id: 'settings', label: 'Settings' },
];

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export function App() {
  const project = useProject((s) => s.project);
  const view = useProject((s) => s.view);
  const setView = useProject((s) => s.setView);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const dirty = useProject((s) => s.dirty);
  const markSaved = useProject((s) => s.markSaved);
  const loadProject = useProject((s) => s.loadProject);
  const newFromDemo = useProject((s) => s.newFromDemo);
  const copySelection = useProject((s) => s.copySelection);
  const paste = useProject((s) => s.paste);
  const duplicateSelection = useProject((s) => s.duplicateSelection);
  const analysis = useAnalysis();
  const [showNew, setShowNew] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveJson();
      } else if (mod && e.key.toLowerCase() === 'c') {
        const n = copySelection();
        if (n) setMessage(`Copied ${n} component${n === 1 ? '' : 's'}.`);
      } else if (mod && e.key.toLowerCase() === 'v') {
        const n = paste();
        if (n) e.preventDefault();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, project, copySelection, paste, duplicateSelection]);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(undefined), 4000);
    return () => window.clearTimeout(t);
  }, [message]);

  const saveJson = () => {
    download(`${safeFilename(project.name)}.marine.json`, new Blob([exportProjectJson(project)], { type: 'application/json' }));
    markSaved();
    setMessage('Project saved as JSON.');
  };
  const openJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const err = validateProject(parsed);
      if (err) throw new Error(err);
      loadProject(parsed as Project);
      setMessage(`Opened ${file.name}.`);
    } catch (e) {
      setMessage(`Could not open file: ${(e as Error).message}`);
    }
  };
  const exportSvg = () => {
    download(`${safeFilename(project.name)}.svg`, new Blob([schematicSvg(project, analysis)], { type: 'image/svg+xml' }));
  };
  const exportPng = async () => {
    try {
      download(`${safeFilename(project.name)}.png`, await svgToPng(schematicSvg(project, analysis)));
    } catch (e) {
      setMessage(`PNG export failed: ${(e as Error).message}`);
    }
  };
  const errors = analysis.checks.filter((c) => c.severity === 'error').length;
  const warnings = analysis.checks.filter((c) => c.severity === 'warning').length;

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">
          <span className="brand-mark">⚓</span>
          <div>
            <div className="brand-title">Marine Electrical Designer</div>
            <div className="brand-sub">{project.name}{dirty ? ' •' : ''}</div>
          </div>
        </div>
        <nav className="tabs">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)}>
              {v.label}
              {v.id === 'checks' && (errors || warnings) ? <span className={`pill ${errors ? 'pill-error' : 'pill-warning'}`}>{errors || warnings}</span> : null}
            </button>
          ))}
        </nav>
        <div className="actions">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
          <span className="sep" />
          <button onClick={() => setShowNew(true)}>New</button>
          <button onClick={() => fileInput.current?.click()}>Open</button>
          <button onClick={saveJson} title="Save project file (Ctrl+S)">Save</button>
          <span className="sep" />
          <button onClick={exportSvg}>Export SVG</button>
          <button onClick={exportPng}>Export PNG</button>
          <span className="sep" />
          <button onClick={() => { if (confirm('Replace the current design with the demo? Save first if you want to keep it.')) newFromDemo(); }}>Demo</button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openJson(f); e.target.value = ''; }} />
        </div>
      </header>
      <main className={`main view-${view}`}>
        {view === 'schematic' ? <SchematicView analysis={analysis} /> : null}
        {view === 'loads' ? <LoadsView analysis={analysis} /> : null}
        {view === 'cables' ? <CablesView analysis={analysis} /> : null}
        {view === 'checks' ? <ChecksView analysis={analysis} /> : null}
        {view === 'wiring' ? <WiringView analysis={analysis} /> : null}
        {view === 'settings' ? <SettingsView /> : null}
      </main>
      {message ? <div className="toast">{message}</div> : null}
      {showNew ? <NewProjectDialog onClose={() => setShowNew(false)} /> : null}
    </div>
  );
}
