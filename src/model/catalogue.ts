import type {
  Component,
  ComponentCategory,
  ComponentParams,
  ComponentType,
  NetKind,
  PortDef,
  Side,
} from './types';

export interface ComponentDef {
  type: ComponentType;
  label: string;
  category: ComponentCategory;
  refPrefix: string;
  /** Symbol size in schematic units */
  width: number;
  height: number;
  defaults: ComponentParams;
  ports: (params: ComponentParams) => PortDef[];
  description: string;
}

const dcPair = (side: Side2 = 'lr'): PortDef[] =>
  side === 'lr'
    ? [
        { id: 'pos', label: '+', kind: 'dc+', side: 'right' },
        { id: 'neg', label: '-', kind: 'dc-', side: 'left' },
      ]
    : [
        { id: 'pos', label: '+', kind: 'dc+', side: 'left' },
        { id: 'neg', label: '-', kind: 'dc-', side: 'left' },
      ];
type Side2 = 'lr' | 'll';

const acTriple = (prefix: string, side: Side, group?: string): PortDef[] => [
  { id: `${prefix}L`, label: 'L', kind: 'ac-L', side, group: group ? `${group}L` : undefined },
  { id: `${prefix}N`, label: 'N', kind: 'ac-N', side, group: group ? `${group}N` : undefined },
  { id: `${prefix}PE`, label: 'PE', kind: 'ac-PE', side, group: group ? `${group}PE` : undefined },
];

function numbered(kind: NetKind, count: number, prefix = 'p'): PortDef[] {
  const ports: PortDef[] = [];
  for (let i = 0; i < count; i++) {
    ports.push({
      id: `${prefix}${i + 1}`,
      label: `${i + 1}`,
      kind,
      side: i % 2 === 0 ? 'left' : 'right',
      group: 'bus',
    });
  }
  return ports;
}

export const CATALOGUE: Record<ComponentType, ComponentDef> = {
  battery: {
    type: 'battery',
    label: 'Battery bank',
    category: 'dc-source',
    refPrefix: 'B',
    width: 120,
    height: 80,
    defaults: {
      name: 'House bank',
      voltage: 12,
      capacityAh: 200,
      chemistry: 'agm',
      bankId: 'house',
      parallelCount: 1,
    },
    ports: () => [
      { id: 'pos', label: '+', kind: 'dc+', side: 'top' },
      { id: 'neg', label: '-', kind: 'dc-', side: 'bottom' },
    ],
    description: 'Battery or bank of batteries. Set chemistry, nominal voltage and capacity.',
  },
  alternator: {
    type: 'alternator',
    label: 'Alternator',
    category: 'dc-source',
    refPrefix: 'G',
    width: 90,
    height: 80,
    defaults: { name: 'Engine alternator', voltage: 12, ratedA: 80 },
    ports: () => dcPair(),
    description: 'Engine-driven alternator. Rated output current sets the charging cable size.',
  },
  'solar-array': {
    type: 'solar-array',
    label: 'Solar array',
    category: 'dc-source',
    refPrefix: 'PV',
    width: 100,
    height: 80,
    defaults: { name: 'Solar array', ratedW: 400, voltage: 36, ratedA: 11 },
    ports: () => [
      { id: 'pos', label: '+', kind: 'pv+', side: 'right' },
      { id: 'neg', label: '-', kind: 'pv-', side: 'right' },
    ],
    description: 'PV panels before the charge controller. Set Voc and Isc as voltage and rated current.',
  },
  mppt: {
    type: 'mppt',
    label: 'MPPT controller',
    category: 'dc-source',
    refPrefix: 'SC',
    width: 110,
    height: 90,
    defaults: { name: 'MPPT charger', voltage: 12, ratedA: 30 },
    ports: () => [
      { id: 'pvpos', label: 'PV+', kind: 'pv+', side: 'left' },
      { id: 'pvneg', label: 'PV-', kind: 'pv-', side: 'left' },
      { id: 'pos', label: 'B+', kind: 'dc+', side: 'right' },
      { id: 'neg', label: 'B-', kind: 'dc-', side: 'right' },
    ],
    description: 'Solar charge controller. Rated output current sets the battery cable size.',
  },
  dcdc: {
    type: 'dcdc',
    label: 'DC-DC charger',
    category: 'dc-source',
    refPrefix: 'DC',
    width: 110,
    height: 90,
    defaults: { name: 'DC-DC charger', inputVoltage: 12, voltage: 12, ratedA: 30 },
    ports: () => [
      { id: 'inpos', label: 'IN+', kind: 'dc+', side: 'left' },
      { id: 'inneg', label: 'IN-', kind: 'dc-', side: 'left' },
      { id: 'pos', label: 'OUT+', kind: 'dc+', side: 'right' },
      { id: 'neg', label: 'OUT-', kind: 'dc-', side: 'right' },
    ],
    description: 'Battery-to-battery charger or voltage converter.',
  },
  charger: {
    type: 'charger',
    label: 'Battery charger',
    category: 'dc-source',
    refPrefix: 'CH',
    width: 120,
    height: 90,
    defaults: { name: 'Mains charger', voltage: 12, ratedA: 40 },
    ports: () => [...acTriple('in', 'left'), { id: 'pos', label: 'B+', kind: 'dc+', side: 'right' }, { id: 'neg', label: 'B-', kind: 'dc-', side: 'right' }],
    description: 'AC powered battery charger.',
  },
  inverter: {
    type: 'inverter',
    label: 'Inverter',
    category: 'ac-source',
    refPrefix: 'INV',
    width: 120,
    height: 90,
    defaults: { name: 'Inverter', voltage: 12, ratedW: 2000, neutralEarthLink: true },
    ports: () => [
      { id: 'pos', label: 'B+', kind: 'dc+', side: 'left' },
      { id: 'neg', label: 'B-', kind: 'dc-', side: 'left' },
      ...acTriple('out', 'right'),
    ],
    description: 'DC to AC inverter. Rated watts sets the DC input current.',
  },
  'inverter-charger': {
    type: 'inverter-charger',
    label: 'Inverter / charger',
    category: 'ac-source',
    refPrefix: 'INV',
    width: 140,
    height: 110,
    defaults: { name: 'Inverter/charger', voltage: 12, ratedW: 3000, chargerA: 120, neutralEarthLink: true },
    ports: () => [
      { id: 'pos', label: 'B+', kind: 'dc+', side: 'left' },
      { id: 'neg', label: 'B-', kind: 'dc-', side: 'left' },
      ...acTriple('in', 'left'),
      ...acTriple('out', 'right'),
    ],
    description: 'Combined inverter and charger with AC pass-through and transfer relay.',
  },
  'battery-switch': {
    type: 'battery-switch',
    label: 'Battery switch',
    category: 'dc-distribution',
    refPrefix: 'S',
    width: 70,
    height: 60,
    defaults: { name: 'Battery switch', ratedA: 300, closed: true },
    ports: () => [
      { id: 'in', label: 'IN', kind: 'any', side: 'left', group: 'sw' },
      { id: 'out', label: 'OUT', kind: 'any', side: 'right', group: 'sw' },
    ],
    description: 'Main battery isolator. Modelled closed for circuit calculations.',
  },
  'battery-selector': {
    type: 'battery-selector',
    label: 'Battery selector (1-2-BOTH-OFF)',
    category: 'dc-distribution',
    refPrefix: 'S',
    width: 100,
    height: 80,
    defaults: { name: 'Battery selector', ratedA: 300, position: 'both' },
    ports: () => [
      { id: 'in1', label: '1', kind: 'dc+', side: 'left' },
      { id: 'in2', label: '2', kind: 'dc+', side: 'left' },
      { id: 'out', label: 'COM', kind: 'dc+', side: 'right' },
    ],
    description: 'Four-position selector joining bank 1, bank 2 or both to the common output. The position set here is used for the calculations; BOTH parallels the banks.',
  },
  fuse: {
    type: 'fuse',
    label: 'Fuse',
    category: 'dc-distribution',
    refPrefix: 'F',
    width: 60,
    height: 40,
    defaults: { name: 'Fuse', protectionType: 'MIDI', rating: 60, interruptA: 2000 },
    ports: () => [
      { id: 'in', label: 'IN', kind: 'any', side: 'left', group: 'f' },
      { id: 'out', label: 'OUT', kind: 'any', side: 'right', group: 'f' },
    ],
    description: 'Fuse. Rating is checked against the cable it protects and the circuit current.',
  },
  'terminal-fuse': {
    type: 'terminal-fuse',
    label: 'MRBF terminal fuse',
    category: 'dc-distribution',
    refPrefix: 'F',
    width: 70,
    height: 44,
    defaults: { name: 'MRBF terminal fuse', protectionType: 'MRBF', rating: 150, interruptA: 10000 },
    ports: () => [
      { id: 'in', label: 'STUD', kind: 'dc+', side: 'left', group: 'f' },
      { id: 'out', label: 'OUT', kind: 'any', side: 'right', group: 'f' },
    ],
    description: 'Marine Rated Battery Fuse bolted directly onto the battery positive stud. 30 to 300 A, 10 kA interrupt at 14 V (2 kA at 32 V). The STUD side connects to the battery with no cable length.',
  },
  breaker: {
    type: 'breaker',
    label: 'DC breaker',
    category: 'dc-distribution',
    refPrefix: 'CB',
    width: 60,
    height: 40,
    defaults: { name: 'Breaker', protectionType: 'thermal', rating: 30, interruptA: 3000 },
    ports: () => [
      { id: 'in', label: 'IN', kind: 'any', side: 'left', group: 'cb' },
      { id: 'out', label: 'OUT', kind: 'any', side: 'right', group: 'cb' },
    ],
    description: 'Single-pole DC circuit breaker.',
  },
  busbar: {
    type: 'busbar',
    label: 'Busbar',
    category: 'dc-distribution',
    refPrefix: 'BB',
    width: 40,
    height: 120,
    defaults: { name: 'Busbar', netKind: 'dc+', portCount: 6, ratedA: 250 },
    ports: (p) => numbered(p.netKind ?? 'dc+', p.portCount ?? 6),
    description: 'Distribution busbar. Choose the network (DC+, DC-, AC L/N/PE, bonding) and number of studs.',
  },
  'dc-panel': {
    type: 'dc-panel',
    label: 'DC distribution panel',
    category: 'dc-distribution',
    refPrefix: 'DP',
    width: 150,
    height: 160,
    defaults: {
      name: 'DC panel',
      voltage: 12,
      circuits: [
        { id: 'c1', name: 'Nav lights', rating: 5 },
        { id: 'c2', name: 'Cabin lights', rating: 10 },
        { id: 'c3', name: 'Instruments', rating: 5 },
        { id: 'c4', name: 'Bilge pump', rating: 10 },
      ],
    },
    ports: (p) => [
      { id: 'feed', label: 'FEED+', kind: 'dc+', side: 'left' },
      ...(p.circuits ?? []).map<PortDef>((c) => ({ id: `out_${c.id}`, label: c.name, kind: 'dc+', side: 'right' })),
    ],
    description: 'Breaker panel. Each circuit is a breaker with its own rating and output terminal.',
  },
  shunt: {
    type: 'shunt',
    label: 'Shunt / monitor',
    category: 'dc-distribution',
    refPrefix: 'SH',
    width: 80,
    height: 40,
    defaults: { name: 'Battery monitor shunt', ratedA: 500 },
    ports: () => [
      { id: 'in', label: 'BATT', kind: 'dc-', side: 'left', group: 'sh' },
      { id: 'out', label: 'LOAD', kind: 'dc-', side: 'right', group: 'sh' },
    ],
    description: 'Negative-side shunt for a battery monitor.',
  },
  'dc-load': {
    type: 'dc-load',
    label: 'DC load',
    category: 'dc-load',
    refPrefix: 'L',
    width: 110,
    height: 60,
    defaults: {
      name: 'DC load',
      voltage: 12,
      watts: 24,
      hoursPerDay: 4,
      dutyCycle: 1,
      critical: false,
      category: 'lighting',
    },
    ports: () => dcPair('ll'),
    description: 'Any DC consumer. Enter watts or amps, hours per day and whether it is a critical circuit.',
  },
  starter: {
    type: 'starter',
    label: 'Engine starter motor',
    category: 'dc-load',
    refPrefix: 'M',
    width: 110,
    height: 70,
    defaults: { name: 'Engine starter', voltage: 12, amps: 600, hoursPerDay: 0, dutyCycle: 1, category: 'engine' },
    ports: () => dcPair('ll'),
    description: 'Cranking motor. Enter the cranking current from the engine data. The cranking circuit is sized on voltage drop and is exempt from overcurrent protection.',
  },
  'shore-inlet': {
    type: 'shore-inlet',
    label: 'Shore power inlet',
    category: 'ac-source',
    refPrefix: 'SP',
    width: 100,
    height: 80,
    defaults: { name: 'Shore inlet', voltage: 230, ratedA: 16 },
    ports: () => acTriple('', 'right'),
    description: 'Shore power inlet socket. Rated 16 A or 32 A.',
  },
  'galvanic-isolator': {
    type: 'galvanic-isolator',
    label: 'Galvanic isolator',
    category: 'ac-distribution',
    refPrefix: 'GI',
    width: 80,
    height: 40,
    defaults: { name: 'Galvanic isolator', ratedA: 32 },
    ports: () => [
      { id: 'in', label: 'PE IN', kind: 'ac-PE', side: 'left', group: 'gi' },
      { id: 'out', label: 'PE OUT', kind: 'ac-PE', side: 'right', group: 'gi' },
    ],
    description: 'Blocks low-voltage galvanic currents on the shore earth conductor.',
  },
  'isolation-transformer': {
    type: 'isolation-transformer',
    label: 'Isolation transformer',
    category: 'ac-distribution',
    refPrefix: 'T',
    width: 120,
    height: 90,
    defaults: { name: 'Isolation transformer', ratedW: 3600, neutralEarthLink: true },
    ports: () => [...acTriple('in', 'left'), ...acTriple('out', 'right')],
    description: 'Fully isolates the vessel AC system from shore earth.',
  },
  generator: {
    type: 'generator',
    label: 'Generator',
    category: 'ac-source',
    refPrefix: 'GEN',
    width: 100,
    height: 80,
    defaults: { name: 'Generator', voltage: 230, ratedW: 4000, neutralEarthLink: true },
    ports: () => acTriple('', 'right'),
    description: 'AC generator set.',
  },
  rcd: {
    type: 'rcd',
    label: 'RCD / RCBO',
    category: 'ac-distribution',
    refPrefix: 'RCD',
    width: 80,
    height: 60,
    defaults: { name: 'RCD', protectionType: 'MRCB', rating: 32, sensitivityMa: 30, poles: 2 },
    ports: () => [
      { id: 'inL', label: 'L', kind: 'ac-L', side: 'left', group: 'L' },
      { id: 'inN', label: 'N', kind: 'ac-N', side: 'left', group: 'N' },
      { id: 'outL', label: 'L', kind: 'ac-L', side: 'right', group: 'L' },
      { id: 'outN', label: 'N', kind: 'ac-N', side: 'right', group: 'N' },
    ],
    description: 'Residual current device, double-pole. Sensitivity 30 mA for shore inlets.',
  },
  'ac-breaker-2p': {
    type: 'ac-breaker-2p',
    label: 'AC breaker (2P)',
    category: 'ac-distribution',
    refPrefix: 'CB',
    width: 80,
    height: 60,
    defaults: { name: 'Main breaker', protectionType: 'MCB', rating: 16, poles: 2 },
    ports: () => [
      { id: 'inL', label: 'L', kind: 'ac-L', side: 'left', group: 'L' },
      { id: 'inN', label: 'N', kind: 'ac-N', side: 'left', group: 'N' },
      { id: 'outL', label: 'L', kind: 'ac-L', side: 'right', group: 'L' },
      { id: 'outN', label: 'N', kind: 'ac-N', side: 'right', group: 'N' },
    ],
    description: 'Double-pole AC circuit breaker.',
  },
  'transfer-switch': {
    type: 'transfer-switch',
    label: 'Transfer switch',
    category: 'ac-distribution',
    refPrefix: 'TS',
    width: 120,
    height: 100,
    defaults: { name: 'Source selector', ratedA: 32 },
    ports: () => [
      { id: 'aL', label: '1 L', kind: 'ac-L', side: 'left', group: 'L' },
      { id: 'aN', label: '1 N', kind: 'ac-N', side: 'left', group: 'N' },
      { id: 'bL', label: '2 L', kind: 'ac-L', side: 'left', group: 'L' },
      { id: 'bN', label: '2 N', kind: 'ac-N', side: 'left', group: 'N' },
      { id: 'outL', label: 'L', kind: 'ac-L', side: 'right', group: 'L' },
      { id: 'outN', label: 'N', kind: 'ac-N', side: 'right', group: 'N' },
    ],
    description: 'Manual or automatic source selector between shore, generator and inverter.',
  },
  'ac-panel': {
    type: 'ac-panel',
    label: 'AC distribution panel',
    category: 'ac-distribution',
    refPrefix: 'AP',
    width: 150,
    height: 160,
    defaults: {
      name: 'AC panel',
      voltage: 230,
      circuits: [
        { id: 'c1', name: 'Sockets', rating: 16 },
        { id: 'c2', name: 'Water heater', rating: 16 },
        { id: 'c3', name: 'Battery charger', rating: 10 },
      ],
    },
    ports: (p) => [
      { id: 'feedL', label: 'L', kind: 'ac-L', side: 'left' },
      { id: 'feedN', label: 'N', kind: 'ac-N', side: 'left', group: 'N' },
      { id: 'feedPE', label: 'PE', kind: 'ac-PE', side: 'left', group: 'PE' },
      ...(p.circuits ?? []).map<PortDef>((c) => ({ id: `out_${c.id}`, label: c.name, kind: 'ac-L', side: 'right' })),
      { id: 'busN', label: 'N bus', kind: 'ac-N', side: 'bottom', group: 'N' },
      { id: 'busPE', label: 'PE bus', kind: 'ac-PE', side: 'bottom', group: 'PE' },
    ],
    description: 'AC consumer unit with a breaker per circuit plus neutral and earth bars.',
  },
  'ac-load': {
    type: 'ac-load',
    label: 'AC load',
    category: 'ac-load',
    refPrefix: 'AL',
    width: 110,
    height: 70,
    defaults: { name: 'AC load', voltage: 230, watts: 1000, hoursPerDay: 1, powerFactor: 1, category: 'domestic' },
    ports: () => acTriple('', 'left'),
    description: 'Fixed AC appliance. Watts and power factor set the line current.',
  },
  'ac-socket': {
    type: 'ac-socket',
    label: 'AC socket outlet',
    category: 'ac-load',
    refPrefix: 'SK',
    width: 90,
    height: 60,
    defaults: { name: 'Socket', voltage: 230, watts: 500, hoursPerDay: 1, powerFactor: 1, category: 'domestic' },
    ports: () => acTriple('', 'left'),
    description: 'Socket outlet. Watts is the assumed connected load for diversity.',
  },
  'earth-plate': {
    type: 'earth-plate',
    label: 'Hull earth / earth plate',
    category: 'bonding',
    refPrefix: 'E',
    width: 80,
    height: 60,
    defaults: { name: 'Earth plate' },
    ports: () => [
      { id: 'pe', label: 'PE', kind: 'ac-PE', side: 'top' },
      { id: 'bond', label: 'BOND', kind: 'bond', side: 'top' },
      { id: 'neg', label: 'DC-', kind: 'dc-', side: 'top' },
    ],
    description: 'Common earth point joining AC protective earth, bonding and DC negative where the standard calls for it.',
  },
  'bonding-bus': {
    type: 'bonding-bus',
    label: 'Bonding busbar',
    category: 'bonding',
    refPrefix: 'BND',
    width: 40,
    height: 120,
    defaults: { name: 'Bonding bus', netKind: 'bond', portCount: 6 },
    ports: (p) => numbered('bond', p.portCount ?? 6),
    description: 'Bonding conductor busbar for underwater metals and anodes.',
  },
  anode: {
    type: 'anode',
    label: 'Sacrificial anode',
    category: 'bonding',
    refPrefix: 'AN',
    width: 70,
    height: 50,
    defaults: { name: 'Hull anode' },
    ports: () => [{ id: 'bond', label: 'BOND', kind: 'bond', side: 'left' }],
    description: 'Zinc, aluminium or magnesium anode.',
  },
  'underwater-metal': {
    type: 'underwater-metal',
    label: 'Underwater metal',
    category: 'bonding',
    refPrefix: 'UM',
    width: 90,
    height: 50,
    defaults: { name: 'Prop shaft' },
    ports: () => [{ id: 'bond', label: 'BOND', kind: 'bond', side: 'left' }],
    description: 'Shaft, rudder stock, through-hull or keel bolt that needs bonding.',
  },
  'n2k-backbone': {
    type: 'n2k-backbone',
    label: 'NMEA 2000 backbone',
    category: 'data',
    refPrefix: 'N2K',
    width: 200,
    height: 40,
    defaults: { name: 'N2K backbone', portCount: 6 },
    ports: (p) => [
      { id: 'term1', label: 'TERM', kind: 'n2k', side: 'left', group: 'bb' },
      ...numbered('n2k', p.portCount ?? 6, 'drop').map<PortDef>((x) => ({ ...x, side: 'bottom', group: 'bb' })),
      { id: 'term2', label: 'TERM', kind: 'n2k', side: 'right', group: 'bb' },
    ],
    description: 'Backbone with T-connectors. Drops hang off the bottom ports.',
  },
  'n2k-device': {
    type: 'n2k-device',
    label: 'NMEA 2000 device',
    category: 'data',
    refPrefix: 'ND',
    width: 100,
    height: 50,
    defaults: { name: 'MFD', amps: 0.2 },
    ports: () => [{ id: 'n2k', label: 'N2K', kind: 'n2k', side: 'top' }],
    description: 'Device on a drop cable. Amps is the network load (LEN × 50 mA).',
  },
  'n2k-power': {
    type: 'n2k-power',
    label: 'NMEA 2000 power tap',
    category: 'data',
    refPrefix: 'NP',
    width: 100,
    height: 60,
    defaults: { name: 'N2K power', voltage: 12, amps: 1, hoursPerDay: 24, dutyCycle: 1, category: 'electronics', critical: true },
    ports: () => [
      { id: 'pos', label: '+', kind: 'dc+', side: 'left' },
      { id: 'neg', label: '-', kind: 'dc-', side: 'left' },
      { id: 'n2k', label: 'N2K', kind: 'n2k', side: 'right' },
    ],
    description: 'Power insertion point for the backbone. Behaves as a DC load.',
  },
  'terminal-block': {
    type: 'terminal-block',
    label: 'Terminal block',
    category: 'general',
    refPrefix: 'TB',
    width: 40,
    height: 100,
    defaults: { name: 'Terminal block', netKind: 'any', portCount: 4 },
    ports: (p) => numbered(p.netKind ?? 'any', p.portCount ?? 4),
    description: 'Common terminal strip. All terminals are linked.',
  },
  junction: {
    type: 'junction',
    label: 'Junction',
    category: 'general',
    refPrefix: 'J',
    width: 24,
    height: 24,
    defaults: { name: 'Junction', netKind: 'any' },
    ports: () => [
      { id: 'a', label: '', kind: 'any', side: 'left', group: 'j' },
      { id: 'b', label: '', kind: 'any', side: 'right', group: 'j' },
      { id: 'c', label: '', kind: 'any', side: 'top', group: 'j' },
      { id: 'd', label: '', kind: 'any', side: 'bottom', group: 'j' },
    ],
    description: 'Wire junction / splice.',
  },
};

export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  'dc-source': 'DC sources & charging',
  'dc-distribution': 'DC distribution & protection',
  'dc-load': 'DC loads',
  'ac-source': 'AC sources',
  'ac-distribution': 'AC distribution & protection',
  'ac-load': 'AC loads',
  bonding: 'Bonding & cathodic',
  data: 'NMEA 2000',
  general: 'General',
};

export const CATEGORY_ORDER: ComponentCategory[] = [
  'dc-source',
  'dc-distribution',
  'dc-load',
  'ac-source',
  'ac-distribution',
  'ac-load',
  'bonding',
  'data',
  'general',
];

export function portsOf(component: Component): PortDef[] {
  return CATALOGUE[component.type].ports(component.params);
}

export function portDef(component: Component, portId: string): PortDef | undefined {
  return portsOf(component).find((p) => p.id === portId);
}

/** Categories that count as a DC "consumer" for load analysis. */
export function isDcLoad(type: ComponentType): boolean {
  return type === 'dc-load' || type === 'n2k-power' || type === 'starter';
}

export function isAcLoad(type: ComponentType): boolean {
  return type === 'ac-load' || type === 'ac-socket';
}

export function isProtection(type: ComponentType): boolean {
  return type === 'fuse' || type === 'terminal-fuse' || type === 'breaker' || type === 'rcd' || type === 'ac-breaker-2p';
}

export function isDcSource(type: ComponentType): boolean {
  return ['battery', 'alternator', 'mppt', 'dcdc', 'charger', 'inverter-charger'].includes(type);
}
