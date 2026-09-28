/**
 * Standalone vector export of the schematic. Renders the same symbols as the
 * editor into a self-contained SVG with a title block, so the output is a
 * true vector drawing rather than a screenshot.
 */
import { Position, getSmoothStepPath } from '@xyflow/react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Analysis } from '../calc/analysis';
import { CONDUCTOR_COLOURS } from '../data/cableTables';
import { STANDARDS } from '../model/rulebooks';
import type { Project } from '../model/types';
import { nodeSize, portPositions, strokeForCsa } from '../ui/schematic/layout';
import { Symbol } from '../ui/schematic/symbols';

const POS: Record<string, Position> = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function schematicSvg(project: Project, analysis: Analysis): string {
  const comps = project.components;
  if (!comps.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><text x="20" y="40">Empty design</text></svg>';
  const pad = 60;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of comps) {
    const { width, height } = nodeSize(c);
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + width);
    maxY = Math.max(maxY, c.y + height);
  }
  const titleH = 110;
  const width = Math.ceil(maxX - minX + pad * 2);
  const height = Math.ceil(maxY - minY + pad * 2 + titleH);
  const results = new Map(analysis.cables.map((r) => [r.cableId, r]));
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Inter, system-ui, sans-serif">`);
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
  parts.push(`<g transform="translate(${pad - minX},${pad - minY})">`);
  // Cables underneath symbols
  for (const w of project.cables) {
    const a = comps.find((c) => c.id === w.from.component);
    const b = comps.find((c) => c.id === w.to.component);
    if (!a || !b) continue;
    const pa = portPositions(a).find((p) => p.id === w.from.port);
    const pb = portPositions(b).find((p) => p.id === w.to.port);
    if (!pa || !pb) continue;
    const r = results.get(w.id);
    const colour = CONDUCTOR_COLOURS[r?.kind ?? 'any']?.hex ?? '#888';
    const [d, lx, ly] = getSmoothStepPath({
      sourceX: a.x + pa.x,
      sourceY: a.y + pa.y,
      targetX: b.x + pb.x,
      targetY: b.y + pb.y,
      sourcePosition: POS[pa.side],
      targetPosition: POS[pb.side],
      borderRadius: 6,
    });
    parts.push(`<path d="${d}" fill="none" stroke="${colour}" stroke-width="${strokeForCsa(r?.csa)}"/>`);
    const label = [w.params.tag, r?.csa ? `${r.csa} mm²` : '', w.params.lengthM ? `${w.params.lengthM} m` : ''].filter(Boolean).join(' · ');
    const lw = label.length * 5.2 + 8;
    parts.push(`<rect x="${lx - lw / 2}" y="${ly - 8}" width="${lw}" height="14" rx="3" fill="#ffffff" stroke="#d1d5db" stroke-width="0.5"/>`);
    parts.push(`<text x="${lx}" y="${ly + 3}" font-size="9" text-anchor="middle" fill="#374151">${esc(label)}</text>`);
  }
  for (const c of comps) {
    const { width: w, height: h } = nodeSize(c);
    const symbol = renderToStaticMarkup(createElement(Symbol, { component: c, width: w, height: h }));
    parts.push(`<g transform="translate(${c.x},${c.y})">${symbol}`);
    for (const p of portPositions(c)) {
      const colour = CONDUCTOR_COLOURS[p.kind]?.hex ?? '#888';
      parts.push(`<rect x="${p.x - 3}" y="${p.y - 3}" width="6" height="6" fill="${colour}" stroke="#fff" stroke-width="0.8"/>`);
      if (p.label) {
        const dx = p.side === 'left' ? -6 : p.side === 'right' ? 6 : 0;
        const dy = p.side === 'top' ? -6 : p.side === 'bottom' ? 12 : 3;
        const anchor = p.side === 'left' ? 'end' : p.side === 'right' ? 'start' : 'middle';
        parts.push(`<text x="${p.x + dx}" y="${p.y + dy}" font-size="7" text-anchor="${anchor}" fill="#4b5563">${esc(p.label)}</text>`);
      }
    }
    parts.push('</g>');
  }
  parts.push('</g>');
  // Title block
  const tbW = 420;
  const tbX = width - tbW - 10;
  const tbY = height - titleH + 10;
  const v = project.vessel;
  const stds = project.rulebook.standards.map((s) => STANDARDS.find((x) => x.id === s)?.title.split(' - ')[0] ?? s).join(', ');
  const errors = analysis.checks.filter((c) => c.severity === 'error').length;
  const warnings = analysis.checks.filter((c) => c.severity === 'warning').length;
  parts.push(`<g transform="translate(${tbX},${tbY})">`);
  parts.push(`<rect width="${tbW}" height="${titleH - 20}" fill="#fff" stroke="#111" stroke-width="1.2"/>`);
  parts.push(`<line x1="0" y1="24" x2="${tbW}" y2="24" stroke="#111"/>`);
  parts.push(`<text x="8" y="17" font-size="13" font-weight="700" fill="#111">${esc(project.name)}</text>`);
  parts.push(`<text x="${tbW - 8}" y="17" font-size="10" text-anchor="end" fill="#111">${esc(`${v.drawingNumber ?? ''} ${v.revision ? `Rev ${v.revision}` : ''}`)}</text>`);
  const rows = [
    ['Vessel', `${v.name}${v.type ? ` · ${v.type}` : ''}${v.loaM ? ` · ${v.loaM} m` : ''}`],
    ['Standards', stds],
    ['Date', new Date().toISOString().slice(0, 10) + (v.designer ? ` · ${v.designer}` : '')],
    ['Checks', `${errors} errors, ${warnings} warnings · sizes marked auto by the tool, verify before issue`],
  ];
  rows.forEach(([k, val], i) => {
    parts.push(`<text x="8" y="${40 + i * 14}" font-size="9" fill="#555">${esc(k)}</text>`);
    parts.push(`<text x="70" y="${40 + i * 14}" font-size="9" fill="#111">${esc(val)}</text>`);
  });
  parts.push('</g></svg>');
  return parts.join('');
}

export function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const match = svg.match(/width="(\d+)" height="(\d+)"/);
  const w = match ? Number(match[1]) : 1000;
  const h = match ? Number(match[2]) : 800;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render SVG'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'design';
}
