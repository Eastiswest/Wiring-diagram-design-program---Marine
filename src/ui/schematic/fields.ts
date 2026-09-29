import type { ComponentParams, ComponentType, NetKind } from '../../model/types';

export interface FieldSpec {
  key: keyof ComponentParams;
  label: string;
  type: 'number' | 'text' | 'select' | 'checkbox' | 'textarea';
  options?: { value: string | number; label: string }[];
  step?: number;
  unit?: string;
  hint?: string;
}

const voltage: FieldSpec = {
  key: 'voltage',
  label: 'Nominal voltage',
  type: 'select',
  unit: 'V',
  options: [12, 24, 36, 48].map((v) => ({ value: v, label: `${v} V` })),
};
const ratedA: FieldSpec = { key: 'ratedA', label: 'Rated current', type: 'number', unit: 'A' };
const ratedW: FieldSpec = { key: 'ratedW', label: 'Rated power', type: 'number', unit: 'W' };
const protection: FieldSpec[] = [
  { key: 'rating', label: 'Rating', type: 'number', unit: 'A' },
  {
    key: 'protectionType',
    label: 'Type',
    type: 'select',
    options: ['ANL', 'MEGA', 'MIDI', 'MRBF', 'Class T', 'blade', 'glass', 'MCB', 'MRCB', 'thermal'].map((v) => ({ value: v, label: v })),
  },
  { key: 'interruptA', label: 'Interrupt rating', type: 'number', unit: 'A', hint: 'AIC. Lithium banks need a high-AIC fuse such as Class T.' },
];
const loadCommon: FieldSpec[] = [
  { key: 'watts', label: 'Power', type: 'number', unit: 'W', hint: 'Leave amps at 0 to use watts.' },
  { key: 'amps', label: 'Current (overrides watts)', type: 'number', unit: 'A', step: 0.1 },
  { key: 'hoursPerDay', label: 'Hours per day', type: 'number', unit: 'h', step: 0.1 },
  { key: 'dutyCycle', label: 'Duty cycle', type: 'number', step: 0.05, hint: '1 = runs continuously while on; 0.4 = compressor style cycling.' },
  {
    key: 'category',
    label: 'Category',
    type: 'select',
    options: ['navigation', 'bilge', 'communications', 'electronics', 'lighting', 'refrigeration', 'pumps', 'engine', 'domestic', 'hvac', 'galley', 'other'].map((v) => ({ value: v, label: v })),
  },
  { key: 'critical', label: 'Critical circuit (3 % voltage drop)', type: 'checkbox' },
];
const netKindOptions: { value: NetKind; label: string }[] = [
  { value: 'dc+', label: 'DC positive' },
  { value: 'dc-', label: 'DC negative' },
  { value: 'ac-L', label: 'AC line' },
  { value: 'ac-N', label: 'AC neutral' },
  { value: 'ac-PE', label: 'AC earth' },
  { value: 'bond', label: 'Bonding' },
  { value: 'any', label: 'Any (inherit)' },
];
const neLink: FieldSpec = { key: 'neutralEarthLink', label: 'Neutral-earth link when supplying', type: 'checkbox' };

export const FIELDS: Record<ComponentType, FieldSpec[]> = {
  battery: [
    voltage,
    { key: 'capacityAh', label: 'Capacity per battery', type: 'number', unit: 'Ah' },
    { key: 'chemistry', label: 'Chemistry', type: 'select', options: [{ value: 'flooded', label: 'Flooded lead-acid' }, { value: 'agm', label: 'AGM' }, { value: 'gel', label: 'Gel' }, { value: 'lifepo4', label: 'LiFePO4 (lithium)' }] },
    { key: 'bankId', label: 'Bank id', type: 'text', hint: 'Batteries with the same bank id are summed as one bank.' },
    { key: 'maxDischargeA', label: 'Max continuous discharge', type: 'number', unit: 'A' },
    { key: 'shortCircuitA', label: 'Short-circuit current', type: 'number', unit: 'A', hint: 'From the battery datasheet; used to check the main fuse AIC.' },
  ],
  alternator: [voltage, ratedA],
  'solar-array': [ratedW, { key: 'voltage', label: 'Open-circuit voltage', type: 'number', unit: 'V' }, { key: 'ratedA', label: 'Short-circuit current', type: 'number', unit: 'A', step: 0.1 }],
  mppt: [voltage, { ...ratedA, label: 'Rated charge current' }],
  dcdc: [{ key: 'inputVoltage', label: 'Input voltage', type: 'select', unit: 'V', options: [12, 24, 48].map((v) => ({ value: v, label: `${v} V` })) }, { ...voltage, label: 'Output voltage' }, { ...ratedA, label: 'Rated output current' }],
  charger: [voltage, { ...ratedA, label: 'Charge current' }],
  inverter: [voltage, { ...ratedW, label: 'Continuous output' }, neLink],
  'inverter-charger': [voltage, { ...ratedW, label: 'Continuous inverter output' }, { key: 'chargerA', label: 'Charger current', type: 'number', unit: 'A' }, neLink],
  'battery-switch': [ratedA, { key: 'closed', label: 'Closed (on) for calculations', type: 'checkbox' }],
  'battery-selector': [
    ratedA,
    {
      key: 'position',
      label: 'Position used for calculations',
      type: 'select',
      options: [
        { value: 'off', label: 'OFF' },
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: 'both', label: 'BOTH (banks paralleled)' },
      ],
      hint: 'Check the design in each position you expect to use. BOTH joins the two banks.',
    },
  ],
  fuse: protection,
  'terminal-fuse': protection,
  breaker: protection,
  busbar: [{ key: 'netKind', label: 'Network', type: 'select', options: netKindOptions }, { key: 'portCount', label: 'Studs', type: 'number' }, ratedA],
  'dc-panel': [voltage],
  shunt: [ratedA],
  'dc-load': [voltage, ...loadCommon],
  starter: [
    voltage,
    { key: 'amps', label: 'Cranking current', type: 'number', unit: 'A', hint: 'From the engine manual; typically 400 to 800 A for small diesels at 12 V.' },
  ],
  'shore-inlet': [{ ...ratedA, label: 'Inlet rating', type: 'select', options: [16, 32, 63].map((v) => ({ value: v, label: `${v} A` })) }],
  'galvanic-isolator': [ratedA],
  'isolation-transformer': [{ ...ratedW, label: 'Rating', unit: 'VA' }, neLink],
  generator: [{ ...ratedW, label: 'Continuous output' }, neLink],
  rcd: [{ key: 'rating', label: 'Rating', type: 'number', unit: 'A' }, { key: 'sensitivityMa', label: 'Sensitivity', type: 'select', unit: 'mA', options: [10, 30, 100, 300].map((v) => ({ value: v, label: `${v} mA` })) }],
  'ac-breaker-2p': [{ key: 'rating', label: 'Rating', type: 'number', unit: 'A' }],
  'transfer-switch': [ratedA],
  'ac-panel': [],
  'ac-load': [{ key: 'watts', label: 'Power', type: 'number', unit: 'W' }, { key: 'powerFactor', label: 'Power factor', type: 'number', step: 0.05 }, { key: 'hoursPerDay', label: 'Hours per day', type: 'number', unit: 'h', step: 0.1 }, loadCommon[4]],
  'ac-socket': [{ key: 'watts', label: 'Assumed load', type: 'number', unit: 'W' }, { key: 'hoursPerDay', label: 'Hours per day', type: 'number', unit: 'h', step: 0.1 }],
  'earth-plate': [],
  'bonding-bus': [{ key: 'portCount', label: 'Studs', type: 'number' }],
  anode: [],
  'underwater-metal': [],
  'n2k-backbone': [{ key: 'portCount', label: 'Drop connectors', type: 'number' }],
  'n2k-device': [{ key: 'amps', label: 'Network load', type: 'number', unit: 'A', step: 0.05, hint: 'LEN x 50 mA' }],
  'n2k-power': [voltage, { key: 'amps', label: 'Supply current', type: 'number', unit: 'A', step: 0.1 }, { key: 'hoursPerDay', label: 'Hours per day', type: 'number', unit: 'h' }],
  'terminal-block': [{ key: 'netKind', label: 'Network', type: 'select', options: netKindOptions }, { key: 'portCount', label: 'Terminals', type: 'number' }],
  junction: [],
};
