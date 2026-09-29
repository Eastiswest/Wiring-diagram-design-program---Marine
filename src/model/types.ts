/**
 * Core data model for a marine electrical design.
 *
 * A project is a graph: components (nodes) with typed ports, joined by cables
 * (edges). Everything else - the schematic, the point-to-point wiring view,
 * the load analysis, cable sizing and the rule checks - is derived from it.
 */

/** The electrical network a port or cable belongs to. */
export type NetKind =
  | 'dc+' // DC positive
  | 'dc-' // DC negative
  | 'ac-L' // AC line
  | 'ac-N' // AC neutral
  | 'ac-PE' // AC protective earth
  | 'bond' // Bonding / cathodic protection
  | 'n2k' // NMEA 2000 backbone / drop
  | 'pv+' // Solar array positive (pre-controller)
  | 'pv-' // Solar array negative (pre-controller)
  | 'any'; // Protection and switching devices inherit the network they are wired into

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface PortDef {
  id: string;
  label: string;
  kind: NetKind;
  side: Side;
  /** Ports sharing a group are internally connected (e.g. busbar studs, breaker in/out). */
  group?: string;
}

export type ComponentCategory =
  | 'dc-source'
  | 'dc-distribution'
  | 'dc-load'
  | 'ac-source'
  | 'ac-distribution'
  | 'ac-load'
  | 'bonding'
  | 'data'
  | 'general';

export type ComponentType =
  | 'battery'
  | 'alternator'
  | 'solar-array'
  | 'mppt'
  | 'dcdc'
  | 'charger'
  | 'inverter'
  | 'inverter-charger'
  | 'battery-switch'
  | 'battery-selector'
  | 'fuse'
  | 'breaker'
  | 'busbar'
  | 'dc-panel'
  | 'shunt'
  | 'dc-load'
  | 'shore-inlet'
  | 'galvanic-isolator'
  | 'isolation-transformer'
  | 'generator'
  | 'rcd'
  | 'ac-breaker-2p'
  | 'transfer-switch'
  | 'ac-panel'
  | 'ac-load'
  | 'ac-socket'
  | 'earth-plate'
  | 'bonding-bus'
  | 'anode'
  | 'underwater-metal'
  | 'n2k-backbone'
  | 'n2k-device'
  | 'n2k-power'
  | 'terminal-block'
  | 'junction';

export type BatteryChemistry = 'flooded' | 'agm' | 'gel' | 'lifepo4';
export type ProtectionType = 'ANL' | 'MEGA' | 'MIDI' | 'Class T' | 'blade' | 'glass' | 'MCB' | 'MRCB' | 'thermal';
export type LoadCategory =
  | 'navigation'
  | 'bilge'
  | 'communications'
  | 'electronics'
  | 'lighting'
  | 'refrigeration'
  | 'pumps'
  | 'engine'
  | 'domestic'
  | 'hvac'
  | 'galley'
  | 'other';

export interface PanelCircuit {
  id: string;
  name: string;
  /** Breaker or fuse rating, amps */
  rating: number;
}

/** Per-component parameters; only the fields relevant to the component type are used. */
export interface ComponentParams {
  name: string;
  /** Nominal voltage for DC devices (12/24/48) or AC (230) */
  voltage?: number;
  /** Battery */
  capacityAh?: number;
  chemistry?: BatteryChemistry;
  bankId?: string;
  /** Batteries in parallel making up the bank */
  parallelCount?: number;
  maxDischargeA?: number;
  shortCircuitA?: number;
  /** Rated current output of a source or converter */
  ratedA?: number;
  /** Rated power in watts (inverter, generator, solar array) */
  ratedW?: number;
  /** Charger current for inverter/chargers */
  chargerA?: number;
  /** Converter input voltage */
  inputVoltage?: number;
  /** Protection */
  protectionType?: ProtectionType;
  rating?: number;
  interruptA?: number;
  /** RCD sensitivity in mA */
  sensitivityMa?: number;
  /** Poles for AC breakers */
  poles?: number;
  /** Busbar / terminal block */
  netKind?: NetKind;
  portCount?: number;
  /** Panels */
  circuits?: PanelCircuit[];
  /** Loads */
  watts?: number;
  amps?: number;
  hoursPerDay?: number;
  dutyCycle?: number;
  critical?: boolean;
  category?: LoadCategory;
  powerFactor?: number;
  /** Switch state, used when tracing circuits */
  closed?: boolean;
  /** Selector switch position: off, 1, 2 or both */
  position?: 'off' | '1' | '2' | 'both';
  /** Neutral-earth link present (inverters, generators, isolation transformers) */
  neutralEarthLink?: boolean;
  /** Free text */
  notes?: string;
  location?: string;
}

export interface Component {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  params: ComponentParams;
  /** Reference designator, e.g. B1, F3, CB12 */
  ref: string;
}

export type InsulationTemp = 70 | 85 | 90 | 105;

export interface CableParams {
  /** Cable number / tag shown on the schematic and cable schedule */
  tag: string;
  lengthM: number;
  /** Conductor cross-section in mm². Undefined means "size automatically". */
  csa?: number;
  colour?: string;
  insulationTemp: InsulationTemp;
  inEngineSpace: boolean;
  /** Number of current-carrying conductors bundled with this one (including itself) */
  bundleCount: number;
  ambientC: number;
  /** Override the network kind inferred from the ports */
  kindOverride?: NetKind;
  notes?: string;
}

export interface Cable {
  id: string;
  from: { component: string; port: string };
  to: { component: string; port: string };
  params: CableParams;
}

export type StandardId = 'ISO13297' | 'ISO10133' | 'BMEA' | 'MCA' | 'CLASS' | 'BS7671';

export type VesselUse = 'leisure' | 'commercial' | 'classed';

export interface RulebookSettings {
  standards: StandardId[];
  vesselUse: VesselUse;
  /** Maximum voltage drop for critical DC circuits, percent */
  dcCriticalVdPct: number;
  /** Maximum voltage drop for other DC circuits, percent */
  dcGeneralVdPct: number;
  /** Maximum voltage drop for AC circuits, percent */
  acVdPct: number;
  /** Max unprotected length between battery terminal and first overcurrent device, metres */
  maxUnprotectedBatteryM: number;
  /** Protection must be at least this multiple of the continuous circuit current */
  protectionMarginFactor: number;
  /** Engine space derating factor applied to cable capacity */
  engineSpaceDerate: number;
  /** Design depth of discharge by chemistry */
  dodByChemistry: Record<BatteryChemistry, number>;
  /** Copper resistivity used for voltage drop, ohm·mm²/m */
  copperResistivity: number;
  /** Require a galvanic isolator or isolation transformer on shore power */
  requireGalvanicIsolation: boolean;
  /** Days of autonomy the house bank should provide */
  autonomyDays: number;
}

export interface VesselInfo {
  name: string;
  type: string;
  loaM?: number;
  builder?: string;
  hullNumber?: string;
  designer?: string;
  drawingNumber?: string;
  revision?: string;
}

export interface Project {
  id: string;
  schemaVersion: 1;
  name: string;
  createdAt: string;
  updatedAt: string;
  vessel: VesselInfo;
  rulebook: RulebookSettings;
  components: Component[];
  cables: Cable[];
}
