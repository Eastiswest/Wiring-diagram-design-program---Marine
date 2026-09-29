import type { ReactElement } from 'react';
import type { Component } from '../../model/types';

interface Props {
  component: Component;
  width: number;
  height: number;
}

const stroke = 'var(--symbol-stroke, #1f2937)';
const fill = 'var(--symbol-fill, #ffffff)';

function Box({ width, height, rx = 4 }: { width: number; height: number; rx?: number }) {
  return <rect x={1} y={1} width={width - 2} height={height - 2} rx={rx} fill={fill} stroke={stroke} strokeWidth={1.5} />;
}

function Text({ x, y, children, size = 11, anchor = 'middle', weight }: { x: number; y: number; children: string; size?: number; anchor?: 'start' | 'middle' | 'end'; weight?: number }) {
  return (
    <text x={x} y={y} fontSize={size} textAnchor={anchor} fontFamily="Inter, system-ui, sans-serif" fill={stroke} fontWeight={weight}>
      {children}
    </text>
  );
}

/** Draw the schematic symbol for a component. Pure SVG so it is reused for export. */
export function Symbol({ component, width, height }: Props): ReactElement {
  const p = component.params;
  const cx = width / 2;
  const cy = height / 2;
  const title = <Text x={cx} y={height - 6} size={10}>{p.name}</Text>;
  const ref = <Text x={6} y={12} size={10} anchor="start" weight={600}>{component.ref}</Text>;
  switch (component.type) {
    case 'battery': {
      const plates = [];
      for (let i = 0; i < 3; i++) {
        const y = cy - 16 + i * 12;
        plates.push(<line key={`l${i}`} x1={cx - 18} x2={cx + 18} y1={y} y2={y} stroke={stroke} strokeWidth={3} />);
        plates.push(<line key={`s${i}`} x1={cx - 8} x2={cx + 8} y1={y + 6} y2={y + 6} stroke={stroke} strokeWidth={1.5} />);
      }
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          {plates}
          <Text x={width - 6} y={12} size={10} anchor="end">{`${p.voltage ?? ''} V ${p.capacityAh ?? ''} Ah`}</Text>
          <Text x={width - 6} y={24} size={9} anchor="end">{(p.chemistry ?? '').toUpperCase()}</Text>
          {title}
        </g>
      );
    }
    case 'alternator':
    case 'generator':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <circle cx={cx} cy={cy - 4} r={18} fill="none" stroke={stroke} strokeWidth={1.5} />
          <Text x={cx} y={cy} size={13} weight={600}>{component.type === 'alternator' ? 'G' : 'G~'}</Text>
          <Text x={width - 6} y={12} size={10} anchor="end">{component.type === 'alternator' ? `${p.ratedA ?? ''} A` : `${((p.ratedW ?? 0) / 1000).toFixed(1)} kW`}</Text>
          {title}
        </g>
      );
    case 'solar-array':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <rect x={cx - 22} y={cy - 18} width={44} height={28} fill="none" stroke={stroke} strokeWidth={1.5} />
          <line x1={cx - 22} y1={cy - 4} x2={cx + 22} y2={cy - 4} stroke={stroke} />
          <line x1={cx - 7} y1={cy - 18} x2={cx - 7} y2={cy + 10} stroke={stroke} />
          <line x1={cx + 7} y1={cy - 18} x2={cx + 7} y2={cy + 10} stroke={stroke} />
          <Text x={width - 6} y={12} size={10} anchor="end">{`${p.ratedW ?? ''} W`}</Text>
          {title}
        </g>
      );
    case 'mppt':
    case 'dcdc':
    case 'charger':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <rect x={cx - 20} y={cy - 16} width={40} height={28} fill="none" stroke={stroke} strokeWidth={1.5} />
          <line x1={cx - 20} y1={cy + 12} x2={cx + 20} y2={cy - 16} stroke={stroke} />
          <Text x={cx - 10} y={cy - 4} size={9}>{component.type === 'charger' ? '~' : '='}</Text>
          <Text x={cx + 10} y={cy + 9} size={9}>=</Text>
          <Text x={width - 6} y={12} size={10} anchor="end">{`${p.ratedA ?? ''} A`}</Text>
          {title}
        </g>
      );
    case 'inverter':
    case 'inverter-charger':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <rect x={cx - 22} y={cy - 18} width={44} height={32} fill="none" stroke={stroke} strokeWidth={1.5} />
          <line x1={cx - 22} y1={cy + 14} x2={cx + 22} y2={cy - 18} stroke={stroke} />
          <Text x={cx - 11} y={cy - 4} size={10}>=</Text>
          <Text x={cx + 11} y={cy + 10} size={10}>~</Text>
          <Text x={width - 6} y={12} size={10} anchor="end">{`${((p.ratedW ?? 0) / 1000).toFixed(1)} kW${p.chargerA ? ` / ${p.chargerA} A` : ''}`}</Text>
          {title}
        </g>
      );
    case 'battery-switch':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <line x1={10} y1={cy} x2={cx - 10} y2={cy} stroke={stroke} strokeWidth={2} />
          <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy - 12} stroke={stroke} strokeWidth={2} />
          <line x1={cx + 10} y1={cy} x2={width - 10} y2={cy} stroke={stroke} strokeWidth={2} />
          <circle cx={cx - 10} cy={cy} r={2.5} fill={stroke} />
          <circle cx={cx + 10} cy={cy} r={2.5} fill={stroke} />
          <Text x={width - 4} y={12} size={9} anchor="end">{`${p.ratedA ?? ''} A`}</Text>
        </g>
      );
    case 'battery-selector': {
      const pos = p.position ?? 'both';
      const angle = { off: 180, '1': 225, '2': 315, both: 270 }[pos];
      const rad = (angle * Math.PI) / 180;
      const kx = cx + 14 * Math.cos(rad);
      const ky = cy - 4 + 14 * Math.sin(rad);
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <circle cx={cx} cy={cy - 4} r={17} fill="none" stroke={stroke} strokeWidth={1.5} />
          <line x1={cx} y1={cy - 4} x2={kx} y2={ky} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
          <Text x={cx - 20} y={cy - 22} size={7}>1</Text>
          <Text x={cx + 20} y={cy - 22} size={7}>2</Text>
          <Text x={cx} y={cy - 24} size={7}>BOTH</Text>
          <Text x={cx} y={cy + 18} size={7}>OFF</Text>
          <Text x={width - 4} y={12} size={9} anchor="end">{`${p.ratedA ?? ''} A`}</Text>
          <Text x={cx} y={height - 4} size={9} weight={600}>{pos.toUpperCase()}</Text>
        </g>
      );
    }
    case 'fuse':
      return (
        <g>
          <Box width={width} height={height} />
          <rect x={10} y={cy - 6} width={width - 20} height={12} fill="none" stroke={stroke} strokeWidth={1.5} />
          <line x1={6} y1={cy} x2={width - 6} y2={cy} stroke={stroke} strokeWidth={1.5} />
          <Text x={cx} y={cy - 9} size={9} weight={600}>{`${component.ref} ${p.rating ?? ''} A`}</Text>
          <Text x={cx} y={height - 3} size={8}>{p.protectionType ?? ''}</Text>
        </g>
      );
    case 'breaker':
      return (
        <g>
          <Box width={width} height={height} />
          <line x1={6} y1={cy} x2={cx - 8} y2={cy} stroke={stroke} strokeWidth={1.5} />
          <line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy - 10} stroke={stroke} strokeWidth={1.5} />
          <line x1={cx + 8} y1={cy} x2={width - 6} y2={cy} stroke={stroke} strokeWidth={1.5} />
          <line x1={cx + 5} y1={cy - 13} x2={cx + 11} y2={cy - 7} stroke={stroke} strokeWidth={1.5} />
          <line x1={cx + 11} y1={cy - 13} x2={cx + 5} y2={cy - 7} stroke={stroke} strokeWidth={1.5} />
          <Text x={cx} y={height - 3} size={9} weight={600}>{`${component.ref} ${p.rating ?? ''} A`}</Text>
        </g>
      );
    case 'busbar':
    case 'bonding-bus':
      return (
        <g>
          <rect x={cx - 5} y={6} width={10} height={height - 12} fill={stroke} />
          <Text x={cx} y={height + 12} size={9} weight={600}>{`${component.ref} ${p.name}`}</Text>
        </g>
      );
    case 'dc-panel':
    case 'ac-panel': {
      const circuits = p.circuits ?? [];
      return (
        <g>
          <Box width={width} height={height} rx={2} />
          {ref}
          <Text x={width - 6} y={12} size={10} anchor="end">{p.name}</Text>
          <line x1={2} y1={18} x2={width - 2} y2={18} stroke={stroke} />
          {circuits.map((c, i) => {
            const y = (height * (i + 1)) / (circuits.length + 1);
            return (
              <g key={c.id}>
                <line x1={width - 34} y1={y} x2={width - 26} y2={y - 5} stroke={stroke} strokeWidth={1.2} />
                <line x1={width - 26} y1={y} x2={width - 6} y2={y} stroke={stroke} strokeWidth={1.2} />
                <Text x={width - 38} y={y + 3} size={8} anchor="end">{`${c.name} ${c.rating}A`}</Text>
              </g>
            );
          })}
        </g>
      );
    }
    case 'shunt':
      return (
        <g>
          <Box width={width} height={height} />
          <rect x={cx - 14} y={cy - 4} width={28} height={8} fill={stroke} />
          <line x1={6} y1={cy} x2={width - 6} y2={cy} stroke={stroke} strokeWidth={1.5} />
          <Text x={cx} y={height - 3} size={8}>{`${component.ref} ${p.ratedA ?? ''} A`}</Text>
        </g>
      );
    case 'dc-load':
    case 'ac-load':
    case 'n2k-power': {
      const amps = p.amps ?? (p.watts ?? 0) / (p.voltage ?? 12);
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <rect x={cx - 14} y={cy - 12} width={28} height={12} fill="none" stroke={stroke} strokeWidth={1.5} />
          <Text x={width - 6} y={12} size={10} anchor="end">{p.watts ? `${p.watts} W` : `${amps.toFixed(1)} A`}</Text>
          {p.critical ? <Text x={width - 6} y={24} size={8} anchor="end">CRITICAL</Text> : null}
          {title}
        </g>
      );
    }
    case 'ac-socket':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <circle cx={cx} cy={cy - 4} r={11} fill="none" stroke={stroke} strokeWidth={1.5} />
          <line x1={cx - 5} y1={cy - 8} x2={cx - 5} y2={cy} stroke={stroke} strokeWidth={2} />
          <line x1={cx + 5} y1={cy - 8} x2={cx + 5} y2={cy} stroke={stroke} strokeWidth={2} />
          {title}
        </g>
      );
    case 'shore-inlet':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <circle cx={cx} cy={cy - 2} r={14} fill="none" stroke={stroke} strokeWidth={1.5} />
          <circle cx={cx - 5} cy={cy - 6} r={2} fill={stroke} />
          <circle cx={cx + 5} cy={cy - 6} r={2} fill={stroke} />
          <circle cx={cx} cy={cy + 4} r={2} fill={stroke} />
          <Text x={width - 6} y={12} size={10} anchor="end">{`${p.ratedA ?? ''} A`}</Text>
          {title}
        </g>
      );
    case 'galvanic-isolator':
      return (
        <g>
          <Box width={width} height={height} />
          <polygon points={`${cx - 12},${cy - 8} ${cx - 12},${cy + 8} ${cx},${cy}`} fill="none" stroke={stroke} strokeWidth={1.5} />
          <polygon points={`${cx + 12},${cy - 8} ${cx + 12},${cy + 8} ${cx},${cy}`} fill="none" stroke={stroke} strokeWidth={1.5} />
          <line x1={6} y1={cy} x2={cx - 12} y2={cy} stroke={stroke} strokeWidth={1.5} />
          <line x1={cx + 12} y1={cy} x2={width - 6} y2={cy} stroke={stroke} strokeWidth={1.5} />
          <Text x={cx} y={height - 3} size={8}>{`${component.ref} GI`}</Text>
        </g>
      );
    case 'isolation-transformer':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <circle cx={cx - 9} cy={cy - 4} r={13} fill="none" stroke={stroke} strokeWidth={1.5} />
          <circle cx={cx + 9} cy={cy - 4} r={13} fill="none" stroke={stroke} strokeWidth={1.5} />
          {title}
        </g>
      );
    case 'rcd':
    case 'ac-breaker-2p':
      return (
        <g>
          <Box width={width} height={height} />
          <line x1={6} y1={cy - 8} x2={cx - 8} y2={cy - 8} stroke={stroke} strokeWidth={1.5} />
          <line x1={cx - 8} y1={cy - 8} x2={cx + 8} y2={cy - 16} stroke={stroke} strokeWidth={1.5} />
          <line x1={cx + 8} y1={cy - 8} x2={width - 6} y2={cy - 8} stroke={stroke} strokeWidth={1.5} />
          <line x1={6} y1={cy + 8} x2={cx - 8} y2={cy + 8} stroke={stroke} strokeWidth={1.5} />
          <line x1={cx - 8} y1={cy + 8} x2={cx + 8} y2={cy} stroke={stroke} strokeWidth={1.5} />
          <line x1={cx + 8} y1={cy + 8} x2={width - 6} y2={cy + 8} stroke={stroke} strokeWidth={1.5} />
          <line x1={cx} y1={cy - 12} x2={cx} y2={cy + 4} stroke={stroke} strokeDasharray="2 2" />
          <Text x={cx} y={height - 3} size={8} weight={600}>{`${component.ref} ${p.rating ?? ''}A${component.type === 'rcd' ? ` ${p.sensitivityMa ?? ''}mA` : ''}`}</Text>
        </g>
      );
    case 'transfer-switch':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <line x1={cx - 16} y1={cy - 10} x2={cx} y2={cy} stroke={stroke} strokeWidth={1.5} />
          <line x1={cx - 16} y1={cy + 10} x2={cx - 6} y2={cy + 4} stroke={stroke} strokeWidth={1.5} strokeDasharray="3 2" />
          <line x1={cx} y1={cy} x2={cx + 18} y2={cy} stroke={stroke} strokeWidth={1.5} />
          {title}
        </g>
      );
    case 'earth-plate':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <line x1={cx - 14} y1={cy} x2={cx + 14} y2={cy} stroke={stroke} strokeWidth={2} />
          <line x1={cx - 9} y1={cy + 5} x2={cx + 9} y2={cy + 5} stroke={stroke} strokeWidth={2} />
          <line x1={cx - 4} y1={cy + 10} x2={cx + 4} y2={cy + 10} stroke={stroke} strokeWidth={2} />
          <line x1={cx} y1={cy - 12} x2={cx} y2={cy} stroke={stroke} strokeWidth={2} />
          {title}
        </g>
      );
    case 'anode':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <ellipse cx={cx + 4} cy={cy} rx={16} ry={7} fill="none" stroke={stroke} strokeWidth={1.5} />
          {title}
        </g>
      );
    case 'underwater-metal':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <path d={`M${cx - 12} ${cy + 2} q6 -8 12 0 t12 0`} fill="none" stroke={stroke} strokeWidth={1.5} />
          {title}
        </g>
      );
    case 'n2k-backbone':
      return (
        <g>
          <rect x={4} y={cy - 5} width={width - 8} height={10} rx={3} fill="#5b8def" stroke={stroke} />
          <Text x={cx} y={cy - 9} size={10} weight={600}>{`${component.ref} ${p.name}`}</Text>
        </g>
      );
    case 'n2k-device':
      return (
        <g>
          <Box width={width} height={height} />
          {ref}
          <Text x={cx} y={cy + 6} size={10}>{p.name}</Text>
        </g>
      );
    case 'terminal-block':
      return (
        <g>
          <Box width={width} height={height} rx={2} />
          <Text x={cx} y={height + 12} size={9} weight={600}>{`${component.ref} ${p.name}`}</Text>
        </g>
      );
    case 'junction':
      return <circle cx={cx} cy={cy} r={5} fill={stroke} />;
  }
}
