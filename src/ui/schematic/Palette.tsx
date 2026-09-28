import { useState, type DragEvent } from 'react';
import { CATALOGUE, CATEGORY_LABELS, CATEGORY_ORDER } from '../../model/catalogue';
import type { ComponentType } from '../../model/types';

interface Props {
  onAdd: (type: ComponentType) => void;
}

export const DRAG_MIME = 'application/x-marine-component';

export function Palette({ onAdd }: Props) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const onDragStart = (e: DragEvent, type: ComponentType) => {
    e.dataTransfer.setData(DRAG_MIME, type);
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <aside className="palette">
      <input className="palette-search" placeholder="Search components" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="palette-scroll">
        {CATEGORY_ORDER.map((cat) => {
          const items = Object.values(CATALOGUE).filter((d) => d.category === cat && (!q || d.label.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)));
          if (!items.length) return null;
          return (
            <section key={cat} className="palette-group">
              <h4>{CATEGORY_LABELS[cat]}</h4>
              {items.map((d) => (
                <button key={d.type} className="palette-item" draggable onDragStart={(e) => onDragStart(e, d.type)} onClick={() => onAdd(d.type)} title={d.description}>
                  <span className="palette-ref">{d.refPrefix}</span>
                  <span>{d.label}</span>
                </button>
              ))}
            </section>
          );
        })}
      </div>
      <p className="palette-hint">Click to add at the centre, or drag onto the canvas. Drag between terminals to run a cable.</p>
    </aside>
  );
}
