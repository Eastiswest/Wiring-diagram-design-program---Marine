/**
 * Full design analysis: load circuits, cable currents, automatic sizing,
 * voltage drop, battery bank budget and rule checks.
 */
import { isAcLoad, isDcLoad } from '../model/catalogue';
import type { Cable, Component, InsulationTemp, NetKind, Project, RulebookSettings, StandardId } from '../model/types';
import { AMPACITY, CONDUCTOR_COLOURS, CSA_SIZES, ambientFactor, baseAmpacity, bundlingFactor } from '../data/cableTables';
import {
  buildNetwork,
  portKey,
  protectionOnPath,
  reachable,
  splitKey,
  trace,
  type Hop,
  type Network,
  type ProtectionOnPath,
} from './network';

export const INVERTER_EFFICIENCY = 0.85;
export const DCDC_EFFICIENCY = 0.92;
export const CHARGER_EFFICIENCY = 0.9;
/** Minimum conductor size for power circuits, mm² */
export const MIN_POWER_CSA = 1;

export interface LoadCircuit {
  loadId: string;
  ref: string;
  name: string;
  kind: 'dc' | 'ac';
  voltage: number;
  /** Continuous design current, amps */
  currentA: number;
  watts: number;
  hoursPerDay: number;
  dutyCycle: number;
  /** Energy per day at the load, Wh */
  dailyWh: number;
  critical: boolean;
  category: string;
  /** Battery bank or AC source that supplies the load */
  sourceId?: string;
  sourceRef?: string;
  bankId?: string;
  supplyPath?: Hop[];
  returnPath?: Hop[];
  pePath?: Hop[];
  protection: ProtectionOnPath[];
  vdVolts?: number;
  vdPct?: number;
  vdLimitPct: number;
  /** For AC loads supplied from an inverter, the inverter's id */
  viaInverter?: string;
  /** For DC loads supplied through a DC-DC converter output */
  viaConverter?: string;
  /** Momentary load (engine cranking): sized on voltage drop, exempt from protection */
  intermittent?: boolean;
  issues: string[];
}

export interface CableResult {
  cableId: string;
  tag: string;
  kind: NetKind;
  fromLabel: string;
  toLabel: string;
  fromRef: string;
  toRef: string;
  fromPort: string;
  toPort: string;
  lengthM: number;
  loadCurrentA: number;
  chargeCurrentA: number;
  /** Momentary cranking current through this cable, amps */
  crankCurrentA: number;
  designCurrentA: number;
  /** Rating of the device protecting this cable, if any */
  protectedBy?: ProtectionOnPath;
  /** Current the cable must be rated for: max(design current, protection rating) */
  requiredA: number;
  autoCsa?: number;
  csa?: number;
  manual: boolean;
  deratingFactor: number;
  ampacityA?: number;
  vdVolts?: number;
  utilisationPct?: number;
  expectedColour: string;
  colourOk: boolean;
  insulationTemp: InsulationTemp;
  issues: string[];
}

export interface BankAnalysis {
  bankId: string;
  name: string;
  batteryIds: string[];
  voltage: number;
  chemistry: string;
  capacityAh: number;
  usableAh: number;
  dailyAh: number;
  peakLoadA: number;
  autonomyDays: number;
  /** All charge sources reaching the bank, amps */
  chargeCurrentA: number;
  /** Regulated chargers only (mains, DC-DC, solar), amps */
  chargerCurrentA: number;
  /** chargerCurrentA as a fraction of capacity */
  chargeRateC: number;
  loads: LoadCircuit[];
}

export interface AcSourceAnalysis {
  sourceId: string;
  ref: string;
  name: string;
  type: string;
  ratedA: number;
  connectedW: number;
  connectedA: number;
  utilisationPct: number;
  loads: LoadCircuit[];
}

export type Severity = 'error' | 'warning' | 'info';

export interface CheckResult {
  id: string;
  severity: Severity;
  message: string;
  componentIds: string[];
  cableIds: string[];
  standard?: StandardId | 'general';
}

export interface Analysis {
  network: Network;
  loads: LoadCircuit[];
  cables: CableResult[];
  banks: BankAnalysis[];
  acSources: AcSourceAnalysis[];
  checks: CheckResult[];
}

const DC_SUPPLY_TYPES = new Set(['battery', 'dcdc']);
const AC_SOURCE_TYPES = new Set(['shore-inlet', 'generator', 'inverter', 'inverter-charger', 'isolation-transformer']);

function acSourcePort(c: Component, which: 'L' | 'N' | 'PE'): string {
  if (c.type === 'shore-inlet' || c.type === 'generator') return which;
  return `out${which}`;
}

function isAcSourcePort(c: Component, portId: string, which: 'L' | 'N' | 'PE'): boolean {
  return AC_SOURCE_TYPES.has(c.type) && acSourcePort(c, which) === portId;
}

export function cableDerating(cable: Cable, rulebook: RulebookSettings): number {
  const p = cable.params;
  let f = bundlingFactor(p.bundleCount || 1) * ambientFactor(p.ambientC ?? 30, p.insulationTemp);
  if (p.inEngineSpace && (p.ambientC ?? 30) <= 30) f *= rulebook.engineSpaceDerate;
  return f;
}

export function deratedAmpacity(csa: number, cable: Cable, rulebook: RulebookSettings): number {
  return baseAmpacity(csa, cable.params.insulationTemp) * cableDerating(cable, rulebook);
}

/** Smallest standard size whose derated capacity covers the required current. */
export function sizeForCurrent(requiredA: number, cable: Cable, rulebook: RulebookSettings, minCsa = MIN_POWER_CSA): number {
  const f = cableDerating(cable, rulebook);
  const table = AMPACITY[cable.params.insulationTemp];
  for (let i = 0; i < CSA_SIZES.length; i++) {
    if (CSA_SIZES[i] < minCsa) continue;
    if (table[i] * f >= requiredA) return CSA_SIZES[i];
  }
  return CSA_SIZES[CSA_SIZES.length - 1];
}

export function nextSize(csa: number): number | undefined {
  const i = CSA_SIZES.indexOf(csa as (typeof CSA_SIZES)[number]);
  if (i < 0) return CSA_SIZES.find((s) => s > csa);
  return CSA_SIZES[i + 1];
}

export function cableResistance(lengthM: number, csa: number, rulebook: RulebookSettings): number {
  return (rulebook.copperResistivity * lengthM) / csa;
}

function loadCurrent(c: Component): { currentA: number; watts: number; voltage: number } {
  const p = c.params;
  const voltage = p.voltage ?? 12;
  if (c.type === 'ac-load' || c.type === 'ac-socket') {
    const watts = p.watts ?? 0;
    const pf = p.powerFactor ?? 1;
    return { currentA: watts / (voltage * pf), watts, voltage };
  }
  if (p.amps !== undefined && p.amps > 0) return { currentA: p.amps, watts: p.amps * voltage, voltage };
  const watts = p.watts ?? 0;
  return { currentA: watts / voltage, watts, voltage };
}

function cablesOn(hops: Hop[] | undefined): string[] {
  return (hops ?? []).filter((h) => h.cableId).map((h) => h.cableId!);
}

/**
 * Walk a path from the source end to the load end and work out which
 * protection device protects each cable on the way.
 */
function assignProtection(net: Network, hops: Hop[], out: Map<string, ProtectionOnPath[]>, sourceFallback?: ProtectionOnPath) {
  let current: ProtectionOnPath | undefined = sourceFallback;
  for (let i = hops.length - 1; i >= 0; i--) {
    const h = hops[i];
    if (h.cableId) {
      if (current) (out.get(h.cableId) ?? out.set(h.cableId, []).get(h.cableId)!).push(current);
      continue;
    }
    const found = protectionOnPath(net, [h]);
    if (found.length) current = found[0];
  }
}

export function analyse(project: Project): Analysis {
  const net = buildNetwork(project);
  const rb = project.rulebook;
  const loads: LoadCircuit[] = [];
  const checks: CheckResult[] = [];
  const loadCurrentOnCable = new Map<string, number>();
  const chargeCurrentOnCable = new Map<string, number>();
  const crankCurrentOnCable = new Map<string, number>();
  const protectionOnCable = new Map<string, ProtectionOnPath[]>();
  const addCurrent = (map: Map<string, number>, hops: Hop[] | undefined, amps: number) => {
    for (const id of cablesOn(hops)) map.set(id, (map.get(id) ?? 0) + amps);
  };

  const comps = project.components;
  const byId = net.components;

  // ---- Net kind conflicts -------------------------------------------------
  for (const [netId, kinds] of net.conflictingNets) {
    const ids = new Set<string>();
    for (const [key, id] of net.netOf) if (id === netId) ids.add(splitKey(key).component);
    checks.push({
      id: `net-conflict-${netId}`,
      severity: 'error',
      message: `Conductors of different networks are joined: ${kinds.join(', ')}.`,
      componentIds: [...ids],
      cableIds: project.cables.filter((c) => net.netOf.get(portKey(c.from.component, c.from.port)) === netId).map((c) => c.id),
      standard: 'general',
    });
  }

  // ---- DC loads (incl. inverters and converters as loads) -----------------
  const dcLoadComponents = comps.filter((c) => isDcLoad(c.type) || c.type === 'inverter' || c.type === 'inverter-charger' || c.type === 'dcdc');

  // A battery is always the preferred supply. Only when no battery is reachable
  // does a DC-DC converter output count as the source (a separate voltage system).
  // The return path must end at the same source the supply came from; negatives
  // are commoned between banks, so the nearest battery negative is often the wrong one.
  const traceDc = (c: Component, posPort: string, negPort: string) => {
    const target = (types: Set<string>, port: string, onlyId?: string) => (_k: string, comp: Component, p: { id: string }) =>
      types.has(comp.type) && p.id === port && comp.id !== c.id && (onlyId === undefined || comp.id === onlyId);
    const batteryOnly = new Set(['battery']);
    const supply = trace(net, portKey(c.id, posPort), target(batteryOnly, 'pos')) ?? trace(net, portKey(c.id, posPort), target(DC_SUPPLY_TYPES, 'pos'));
    const srcId = supply ? splitKey(supply.target).component : undefined;
    const ret =
      (srcId ? trace(net, portKey(c.id, negPort), target(DC_SUPPLY_TYPES, 'neg', srcId)) : undefined) ??
      trace(net, portKey(c.id, negPort), target(batteryOnly, 'neg')) ??
      trace(net, portKey(c.id, negPort), target(DC_SUPPLY_TYPES, 'neg'));
    return { supply, ret };
  };

  for (const c of dcLoadComponents) {
    const p = c.params;
    const voltage = p.voltage ?? 12;
    let currentA = 0;
    let watts = 0;
    let hours = p.hoursPerDay ?? 0;
    const duty = p.dutyCycle ?? 1;
    let name = p.name;
    if (c.type === 'inverter' || c.type === 'inverter-charger') {
      const draw = (p.ratedW ?? 0) / (voltage * INVERTER_EFFICIENCY);
      currentA = Math.max(draw, p.chargerA ?? 0);
      watts = currentA * voltage;
      hours = 0; // daily energy comes from the AC loads it feeds, added later
      name = `${p.name} (DC side)`;
    } else if (c.type === 'dcdc') {
      const vin = p.inputVoltage ?? voltage;
      currentA = ((p.ratedA ?? 0) * voltage) / vin / DCDC_EFFICIENCY;
      watts = currentA * vin;
      hours = 0;
      name = `${p.name} (input)`;
    } else {
      const lc = loadCurrent(c);
      currentA = lc.currentA;
      watts = lc.watts;
    }
    const posPort = c.type === 'dcdc' ? 'inpos' : 'pos';
    const negPort = c.type === 'dcdc' ? 'inneg' : 'neg';
    const { supply, ret } = traceDc(c, posPort, negPort);
    const supplyVoltage = c.type === 'dcdc' ? (p.inputVoltage ?? voltage) : voltage;
    const intermittent = c.type === 'starter';
    const load: LoadCircuit = {
      loadId: c.id,
      ref: c.ref,
      name,
      kind: 'dc',
      intermittent,
      voltage: supplyVoltage,
      currentA,
      watts,
      hoursPerDay: hours,
      dutyCycle: duty,
      dailyWh: watts * hours * duty,
      critical: p.critical ?? false,
      category: p.category ?? 'other',
      supplyPath: supply?.hops,
      returnPath: ret?.hops,
      protection: supply ? protectionOnPath(net, supply.hops) : [],
      vdLimitPct: intermittent ? (rb.starterVdPct ?? 5) : p.critical ? rb.dcCriticalVdPct : rb.dcGeneralVdPct,
      issues: [],
    };
    if (supply) {
      const src = byId.get(splitKey(supply.target).component)!;
      load.sourceId = src.id;
      load.sourceRef = src.ref;
      if (src.type === 'battery') load.bankId = src.params.bankId ?? src.id;
      else if (src.type === 'dcdc') load.viaConverter = src.id;
      const srcVoltage = src.params.voltage ?? 12;
      if (Math.abs(srcVoltage - supplyVoltage) > 0.5) {
        load.issues.push(`Load is ${supplyVoltage} V but its supply ${src.ref} is ${srcVoltage} V.`);
        checks.push({
          id: `voltage-mismatch-${c.id}`,
          severity: 'error',
          message: `${c.ref} ${p.name} is rated ${supplyVoltage} V but is supplied from ${src.ref} ${src.params.name} at ${srcVoltage} V.`,
          componentIds: [c.id, src.id],
          cableIds: [],
          standard: 'general',
        });
      }
    } else {
      load.issues.push('No path from the positive terminal to a battery or converter output.');
      checks.push({
        id: `no-supply-${c.id}`,
        severity: 'error',
        message: `${c.ref} ${p.name}: positive terminal has no path to a battery or DC-DC output.`,
        componentIds: [c.id],
        cableIds: [],
        standard: 'general',
      });
    }
    if (!ret) {
      load.issues.push('No path from the negative terminal back to the battery.');
      checks.push({
        id: `no-return-${c.id}`,
        severity: 'error',
        message: `${c.ref} ${p.name}: negative terminal has no return path to the battery.`,
        componentIds: [c.id],
        cableIds: [],
        standard: 'general',
      });
    }
    if (supply && load.protection.length === 0 && intermittent) {
      checks.push({
        id: `starter-unprotected-${c.id}`,
        severity: 'info',
        message: `${c.ref} ${p.name}: cranking circuit has no overcurrent protection. This is permitted for engine cranking conductors; keep the run short and well supported.`,
        componentIds: [c.id],
        cableIds: cablesOn(supply.hops),
        standard: 'ISO10133',
      });
    } else if (supply && load.protection.length === 0) {
      load.issues.push('No overcurrent protection on the positive supply.');
      checks.push({
        id: `unprotected-${c.id}`,
        severity: 'error',
        message: `${c.ref} ${p.name} has no fuse or breaker between it and ${load.sourceRef}.`,
        componentIds: [c.id],
        cableIds: cablesOn(supply.hops),
        standard: 'ISO10133',
      });
    }
    if (supply) assignProtection(net, supply.hops, protectionOnCable);
    if (intermittent) {
      addCurrent(crankCurrentOnCable, supply?.hops, currentA);
      addCurrent(crankCurrentOnCable, ret?.hops, currentA);
    } else {
      addCurrent(loadCurrentOnCable, supply?.hops, currentA);
      addCurrent(loadCurrentOnCable, ret?.hops, currentA);
    }
    loads.push(load);
  }

  // ---- AC loads -----------------------------------------------------------
  const acLeafLoads = comps.filter((c) => isAcLoad(c.type) || c.type === 'charger');
  const acPassThrough = comps.filter((c) => c.type === 'inverter-charger' || c.type === 'isolation-transformer');

  const traceAc = (c: Component, lPort: string, nPort: string, pePort: string) => {
    const supply = trace(net, portKey(c.id, lPort), (_k, comp, port) => comp.id !== c.id && isAcSourcePort(comp, port.id, 'L'));
    const srcId = supply ? splitKey(supply.target).component : undefined;
    const ret = trace(
      net,
      portKey(c.id, nPort),
      (_k, comp, port) => comp.id !== c.id && isAcSourcePort(comp, port.id, 'N') && (srcId === undefined || comp.id === srcId),
    );
    const pe = trace(
      net,
      portKey(c.id, pePort),
      (_k, comp, port) => comp.id !== c.id && ((isAcSourcePort(comp, port.id, 'PE') && (srcId === undefined || comp.id === srcId)) || (comp.type === 'earth-plate' && port.id === 'pe')),
    );
    return { supply, ret, pe };
  };

  const makeAcLoad = (c: Component, currentA: number, watts: number, hours: number, name: string, ports: [string, string, string]): LoadCircuit => {
    const p = c.params;
    const { supply, ret, pe } = traceAc(c, ports[0], ports[1], ports[2]);
    const load: LoadCircuit = {
      loadId: c.id,
      ref: c.ref,
      name,
      kind: 'ac',
      voltage: 230,
      currentA,
      watts,
      hoursPerDay: hours,
      dutyCycle: p.dutyCycle ?? 1,
      dailyWh: watts * hours * (p.dutyCycle ?? 1),
      critical: p.critical ?? false,
      category: p.category ?? 'other',
      supplyPath: supply?.hops,
      returnPath: ret?.hops,
      pePath: pe?.hops,
      protection: supply ? protectionOnPath(net, supply.hops) : [],
      vdLimitPct: rb.acVdPct,
      issues: [],
    };
    if (supply) {
      const src = byId.get(splitKey(supply.target).component)!;
      load.sourceId = src.id;
      load.sourceRef = src.ref;
      if (src.type === 'inverter' || src.type === 'inverter-charger') load.viaInverter = src.id;
    } else {
      load.issues.push('No path from L to an AC source.');
      checks.push({
        id: `ac-no-supply-${c.id}`,
        severity: 'error',
        message: `${c.ref} ${p.name}: line terminal has no path to shore, generator, inverter or transformer.`,
        componentIds: [c.id],
        cableIds: [],
        standard: 'general',
      });
    }
    if (!ret) {
      load.issues.push('No neutral return to the source.');
      checks.push({
        id: `ac-no-neutral-${c.id}`,
        severity: 'error',
        message: `${c.ref} ${p.name}: neutral has no return path to its source.`,
        componentIds: [c.id],
        cableIds: [],
        standard: 'ISO13297',
      });
    }
    if (!pe) {
      load.issues.push('No protective earth.');
      checks.push({
        id: `ac-no-pe-${c.id}`,
        severity: 'error',
        message: `${c.ref} ${p.name}: protective earth is not connected back to the source earth or hull earth.`,
        componentIds: [c.id],
        cableIds: [],
        standard: 'ISO13297',
      });
    }
    if (supply && load.protection.length === 0) {
      load.issues.push('No overcurrent protection on L.');
      checks.push({
        id: `ac-unprotected-${c.id}`,
        severity: 'error',
        message: `${c.ref} ${p.name} has no breaker between it and ${load.sourceRef}.`,
        componentIds: [c.id],
        cableIds: cablesOn(supply.hops),
        standard: 'ISO13297',
      });
    }
    if (supply) {
      const src = byId.get(splitKey(supply.target).component)!;
      const fallback: ProtectionOnPath | undefined =
        src.type === 'shore-inlet'
          ? { componentId: src.id, ref: src.ref, name: 'Shore pedestal breaker', rating: src.params.ratedA ?? 16, protectionType: 'MCB' }
          : undefined;
      assignProtection(net, supply.hops, protectionOnCable, fallback);
    }
    addCurrent(loadCurrentOnCable, supply?.hops, currentA);
    addCurrent(loadCurrentOnCable, ret?.hops, currentA);
    return load;
  };

  for (const c of acLeafLoads) {
    const p = c.params;
    if (c.type === 'charger') {
      const dcV = p.voltage ?? 12;
      const inputW = ((p.ratedA ?? 0) * dcV) / CHARGER_EFFICIENCY;
      loads.push(makeAcLoad(c, inputW / 230, inputW, p.hoursPerDay ?? 0, `${p.name} (AC input)`, ['inL', 'inN', 'inPE']));
    } else {
      const lc = loadCurrent(c);
      loads.push(makeAcLoad(c, lc.currentA, lc.watts, p.hoursPerDay ?? 0, p.name, ['L', 'N', 'PE']));
    }
  }
  // Pass-through devices: their AC input carries whatever they feed downstream.
  for (const c of acPassThrough) {
    const p = c.params;
    const downstream = loads.filter((l) => l.kind === 'ac' && l.sourceId === c.id);
    const downstreamA = downstream.reduce((s, l) => s + l.currentA, 0);
    const downstreamW = downstream.reduce((s, l) => s + l.watts, 0);
    let currentA = downstreamA;
    let watts = downstreamW;
    if (c.type === 'inverter-charger') {
      const chargerInW = ((p.chargerA ?? 0) * (p.voltage ?? 12)) / CHARGER_EFFICIENCY;
      currentA += chargerInW / 230;
      watts += chargerInW;
    }
    loads.push(makeAcLoad(c, currentA, watts, 0, `${p.name} (AC input)`, ['inL', 'inN', 'inPE']));
  }

  // ---- Charging sources ---------------------------------------------------
  const chargeSources = comps.filter((c) => ['alternator', 'mppt', 'dcdc', 'charger', 'inverter-charger'].includes(c.type));
  const chargeIntoBank = new Map<string, number>();
  /** Charge current from regulated chargers only (alternators are limited by battery acceptance). */
  const chargerIntoBank = new Map<string, number>();
  for (const c of chargeSources) {
    const amps = c.type === 'inverter-charger' ? (c.params.chargerA ?? 0) : (c.params.ratedA ?? 0);
    if (!amps) continue;
    const sup = trace(net, portKey(c.id, 'pos'), (_k, comp, port) => comp.type === 'battery' && port.id === 'pos');
    const supId = sup ? splitKey(sup.target).component : undefined;
    const ret =
      (supId ? trace(net, portKey(c.id, 'neg'), (_k, comp, port) => comp.id === supId && port.id === 'neg') : undefined) ??
      trace(net, portKey(c.id, 'neg'), (_k, comp, port) => comp.type === 'battery' && port.id === 'neg');
    if (sup) {
      const bat = byId.get(splitKey(sup.target).component)!;
      const bankId = bat.params.bankId ?? bat.id;
      chargeIntoBank.set(bankId, (chargeIntoBank.get(bankId) ?? 0) + amps);
      if (c.type !== 'alternator') chargerIntoBank.set(bankId, (chargerIntoBank.get(bankId) ?? 0) + amps);
      // The cable between a charge source and the battery needs its own protection at the battery end.
      const prot = protectionOnPath(net, sup.hops);
      if (prot.length === 0 && c.type !== 'inverter-charger') {
        checks.push({
          id: `charge-unprotected-${c.id}`,
          severity: c.type === 'alternator' ? 'warning' : 'error',
          message: `${c.ref} ${c.params.name}: charging cable to ${bat.ref} has no overcurrent protection${c.type === 'alternator' ? ' (permitted for alternator output if the cable is short and the standard allows it)' : ''}.`,
          componentIds: [c.id, bat.id],
          cableIds: cablesOn(sup.hops),
          standard: 'ISO10133',
        });
      }
      assignProtection(net, sup.hops, protectionOnCable);
    } else {
      checks.push({
        id: `charge-no-battery-${c.id}`,
        severity: 'warning',
        message: `${c.ref} ${c.params.name}: output is not connected to a battery.`,
        componentIds: [c.id],
        cableIds: [],
        standard: 'general',
      });
    }
    addCurrent(chargeCurrentOnCable, sup?.hops, amps);
    addCurrent(chargeCurrentOnCable, ret?.hops, amps);
  }

  // ---- Battery interconnects --------------------------------------------------
  // Cables joining batteries of the same bank share the bank's current in a way the
  // path trace cannot see, so they are sized for the whole bank's load or charge current.
  const bankOf = (c: Component) => c.params.bankId ?? c.id;
  const bankLoadA = new Map<string, number>();
  for (const l of loads) if (l.kind === 'dc' && l.bankId) bankLoadA.set(l.bankId, (bankLoadA.get(l.bankId) ?? 0) + l.currentA);
  for (const cable of project.cables) {
    const a = byId.get(cable.from.component);
    const b = byId.get(cable.to.component);
    if (!a || !b || a.type !== 'battery' || b.type !== 'battery' || bankOf(a) !== bankOf(b)) continue;
    const bankId = bankOf(a);
    loadCurrentOnCable.set(cable.id, Math.max(loadCurrentOnCable.get(cable.id) ?? 0, bankLoadA.get(bankId) ?? 0));
    chargeCurrentOnCable.set(cable.id, Math.max(chargeCurrentOnCable.get(cable.id) ?? 0, chargeIntoBank.get(bankId) ?? 0));
  }

  // ---- Cable results and automatic sizing ---------------------------------
  const cableResults = new Map<string, CableResult>();
  for (const cable of project.cables) {
    const from = byId.get(cable.from.component);
    const to = byId.get(cable.to.component);
    if (!from || !to) continue;
    const kind = net.cableKind.get(cable.id) ?? 'any';
    const loadA = loadCurrentOnCable.get(cable.id) ?? 0;
    const chargeA = chargeCurrentOnCable.get(cable.id) ?? 0;
    const designA = Math.max(loadA, chargeA);
    const prots = protectionOnCable.get(cable.id) ?? [];
    const protectedBy = prots.length ? prots.reduce((a, b) => (a.rating <= b.rating ? a : b)) : undefined;
    const requiredA = Math.max(designA, kind === 'ac-PE' || kind === 'bond' ? 0 : (protectedBy?.rating ?? 0));
    const expected = CONDUCTOR_COLOURS[kind] ?? CONDUCTOR_COLOURS.any;
    const colour = (cable.params.colour ?? '').trim().toLowerCase();
    const colourOk = !colour || expected.accepted.length === 0 || expected.accepted.includes(colour);
    const isPower = !['n2k', 'any'].includes(kind);
    const r: CableResult = {
      cableId: cable.id,
      tag: cable.params.tag,
      kind,
      fromLabel: `${from.ref} ${from.params.name}`,
      toLabel: `${to.ref} ${to.params.name}`,
      fromRef: from.ref,
      toRef: to.ref,
      fromPort: cable.from.port,
      toPort: cable.to.port,
      lengthM: cable.params.lengthM,
      loadCurrentA: loadA,
      chargeCurrentA: chargeA,
      crankCurrentA: crankCurrentOnCable.get(cable.id) ?? 0,
      designCurrentA: designA,
      protectedBy,
      requiredA,
      manual: cable.params.csa !== undefined,
      deratingFactor: cableDerating(cable, rb),
      expectedColour: expected.name,
      colourOk,
      insulationTemp: cable.params.insulationTemp,
      issues: [],
    };
    if (isPower) {
      r.autoCsa = sizeForCurrent(requiredA, cable, rb);
      r.csa = cable.params.csa ?? r.autoCsa;
    } else {
      r.csa = cable.params.csa;
    }
    cableResults.set(cable.id, r);
  }

  // Voltage drop: iterate, upsizing automatic cables on the worst path.
  const pathCurrent = (load: LoadCircuit, r: CableResult) => (load.intermittent ? r.crankCurrentA : r.loadCurrentA);
  const computeVd = (load: LoadCircuit): number => {
    let vd = 0;
    for (const id of [...cablesOn(load.supplyPath), ...cablesOn(load.returnPath)]) {
      const r = cableResults.get(id);
      const cable = net.cables.get(id);
      if (!r || !cable || !r.csa) continue;
      vd += pathCurrent(load, r) * cableResistance(cable.params.lengthM, r.csa, rb);
    }
    return vd;
  };
  for (let iter = 0; iter < 200; iter++) {
    let changed = false;
    for (const load of loads) {
      if (!load.supplyPath || !load.returnPath) continue;
      const vd = computeVd(load);
      const pct = (vd / load.voltage) * 100;
      if (pct <= load.vdLimitPct) continue;
      // Pick the automatic cable with the largest contribution that can still grow.
      let best: CableResult | undefined;
      let bestScore = -1;
      for (const id of [...cablesOn(load.supplyPath), ...cablesOn(load.returnPath)]) {
        const r = cableResults.get(id);
        const cable = net.cables.get(id);
        if (!r || !cable || r.manual || !r.csa || !nextSize(r.csa)) continue;
        const score = pathCurrent(load, r) * cableResistance(cable.params.lengthM, r.csa, rb);
        if (score > bestScore) {
          bestScore = score;
          best = r;
        }
      }
      if (best && best.csa) {
        best.csa = nextSize(best.csa)!;
        best.autoCsa = best.csa;
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const load of loads) {
    if (!load.supplyPath || !load.returnPath) continue;
    load.vdVolts = computeVd(load);
    load.vdPct = (load.vdVolts / load.voltage) * 100;
    if (load.vdPct > load.vdLimitPct + 1e-9) {
      load.issues.push(`Voltage drop ${load.vdPct.toFixed(1)} % exceeds ${load.vdLimitPct} %.`);
      checks.push({
        id: `vd-${load.loadId}`,
        severity: 'error',
        message: `${load.ref} ${load.name}: voltage drop ${load.vdPct.toFixed(1)} % exceeds the ${load.vdLimitPct} % limit for ${load.critical ? 'critical' : 'general'} ${load.kind.toUpperCase()} circuits. Fixed-size cables on the path need upsizing.`,
        componentIds: [load.loadId],
        cableIds: [...cablesOn(load.supplyPath), ...cablesOn(load.returnPath)],
        standard: load.kind === 'dc' ? 'ISO10133' : 'ISO13297',
      });
    }
  }

  // Final cable numbers and checks.
  for (const r of cableResults.values()) {
    const cable = net.cables.get(r.cableId)!;
    if (r.csa) {
      r.ampacityA = deratedAmpacity(r.csa, cable, rb);
      r.vdVolts = r.designCurrentA * cableResistance(cable.params.lengthM, r.csa, rb);
      r.utilisationPct = r.ampacityA > 0 ? (r.designCurrentA / r.ampacityA) * 100 : undefined;
      if (r.designCurrentA > r.ampacityA + 1e-9) {
        r.issues.push(`Design current ${r.designCurrentA.toFixed(1)} A exceeds derated capacity ${r.ampacityA.toFixed(0)} A.`);
        checks.push({
          id: `cable-overload-${r.cableId}`,
          severity: 'error',
          message: `Cable ${r.tag} (${r.fromRef} to ${r.toRef}): ${r.designCurrentA.toFixed(1)} A through ${r.csa} mm² rated ${r.ampacityA.toFixed(0)} A after derating.`,
          componentIds: [],
          cableIds: [r.cableId],
          standard: 'ISO10133',
        });
      }
      if (r.protectedBy && r.protectedBy.rating > r.ampacityA + 1e-9 && r.kind !== 'ac-PE' && r.kind !== 'bond') {
        r.issues.push(`Protected by ${r.protectedBy.rating} A device but rated ${r.ampacityA.toFixed(0)} A.`);
        checks.push({
          id: `cable-underprotected-${r.cableId}`,
          severity: 'error',
          message: `Cable ${r.tag} (${r.csa} mm², ${r.ampacityA.toFixed(0)} A derated) is protected by ${r.protectedBy.ref} rated ${r.protectedBy.rating} A. The device rating must not exceed the cable capacity.`,
          componentIds: [r.protectedBy.componentId],
          cableIds: [r.cableId],
          standard: 'ISO10133',
        });
      }
      const isPower = !['n2k', 'any'].includes(r.kind);
      if (isPower && r.csa < MIN_POWER_CSA) {
        checks.push({
          id: `cable-min-csa-${r.cableId}`,
          severity: 'warning',
          message: `Cable ${r.tag} is ${r.csa} mm². Fixed power wiring should be at least ${MIN_POWER_CSA} mm².`,
          componentIds: [],
          cableIds: [r.cableId],
          standard: 'ISO10133',
        });
      }
    } else if (!['n2k', 'any'].includes(r.kind)) {
      r.issues.push('No size assigned.');
    }
    if (r.kind === 'any') {
      checks.push({
        id: `cable-unassigned-${r.cableId}`,
        severity: 'warning',
        message: `Cable ${r.tag} (${r.fromRef} to ${r.toRef}) is not connected to any identifiable network, so it cannot be sized.`,
        componentIds: [],
        cableIds: [r.cableId],
        standard: 'general',
      });
    }
    if (!r.colourOk) {
      checks.push({
        id: `cable-colour-${r.cableId}`,
        severity: 'warning',
        message: `Cable ${r.tag} is coloured "${cable.params.colour}" but ${r.kind} conductors should be ${r.expectedColour}.`,
        componentIds: [],
        cableIds: [r.cableId],
        standard: r.kind.startsWith('ac') ? 'ISO13297' : 'ISO10133',
      });
    }
    if (r.lengthM <= 0) {
      checks.push({
        id: `cable-length-${r.cableId}`,
        severity: 'warning',
        message: `Cable ${r.tag} has no length, so its voltage drop is zero. Enter the run length.`,
        componentIds: [],
        cableIds: [r.cableId],
        standard: 'general',
      });
    }
  }

  // ---- Protection vs load current ----------------------------------------
  for (const load of loads) {
    if (!load.protection.length || load.currentA <= 0 || load.intermittent) continue;
    const nearest = load.protection[0];
    if (nearest.rating < load.currentA) {
      checks.push({
        id: `prot-under-${load.loadId}`,
        severity: 'error',
        message: `${load.ref} ${load.name} draws ${load.currentA.toFixed(1)} A but its protection ${nearest.ref} is rated ${nearest.rating} A.`,
        componentIds: [load.loadId, nearest.componentId],
        cableIds: [],
        standard: 'general',
      });
    } else if (nearest.rating < load.currentA * rb.protectionMarginFactor) {
      checks.push({
        id: `prot-margin-${load.loadId}`,
        severity: 'warning',
        message: `${load.ref} ${load.name}: protection ${nearest.ref} (${nearest.rating} A) is under ${rb.protectionMarginFactor}x the ${load.currentA.toFixed(1)} A continuous current and may trip in service.`,
        componentIds: [load.loadId, nearest.componentId],
        cableIds: [],
        standard: 'BMEA',
      });
    }
  }

  // ---- Battery specific checks --------------------------------------------
  const batteries = comps.filter((c) => c.type === 'battery');
  for (const bat of batteries) {
    // Every conductor leaving the positive terminal needs a protective device close to it.
    const posKey = portKey(bat.id, 'pos');
    const terminalCables = project.cables.filter((w) => (w.from.component === bat.id && w.from.port === 'pos') || (w.to.component === bat.id && w.to.port === 'pos'));
    let first: ReturnType<typeof trace> | undefined;
    for (const w of terminalCables) {
      const farKey = w.from.component === bat.id && w.from.port === 'pos' ? portKey(w.to.component, w.to.port) : portKey(w.from.component, w.from.port);
      const farComp = byId.get(splitKey(farKey).component);
      // Interconnects between batteries of the same bank are part of the bank, not a feeder.
      if (farComp && farComp.type === 'battery' && bankOf(farComp) === bankOf(bat)) continue;
      const isProt = (comp: Component) => ['fuse', 'breaker'].includes(comp.type);
      let hops: Hop[] = [{ from: posKey, to: farKey, cableId: w.id }];
      let device: Component | undefined = farComp && isProt(farComp) ? farComp : undefined;
      if (!device) {
        const onward = trace(net, farKey, (_k, comp) => comp.id !== bat.id && isProt(comp), {});
        if (onward) {
          hops = [...hops, ...onward.hops];
          device = byId.get(splitKey(onward.target).component);
        }
      }
      if (!device) continue;
      if (!first) first = { target: portKey(device.id, 'in'), hops };
      const len = cablesOn(hops).reduce((s, id) => s + (net.cables.get(id)?.params.lengthM ?? 0), 0);
      if (len > rb.maxUnprotectedBatteryM) {
        checks.push({
          id: `battery-unprotected-len-${bat.id}-${w.id}`,
          severity: 'warning',
          message: `${bat.ref} ${bat.params.name}: ${len.toFixed(2)} m of unprotected conductor between the positive terminal and ${device.ref}. Limit set to ${rb.maxUnprotectedBatteryM} m.`,
          componentIds: [bat.id],
          cableIds: cablesOn(hops),
          standard: 'ISO10133',
        });
      }
    }
    if (first) {
      const dev = byId.get(splitKey(first.target).component)!;
      if (bat.params.chemistry === 'lifepo4') {
        const sc = bat.params.shortCircuitA;
        const aic = dev.params.interruptA ?? 0;
        if (dev.params.protectionType !== 'Class T' || (sc && aic < sc)) {
          checks.push({
            id: `lithium-fuse-${bat.id}`,
            severity: 'warning',
            message: `${bat.ref} is lithium. Main protection ${dev.ref} is ${dev.params.protectionType ?? 'unspecified'} with ${aic || 'unknown'} A interrupt rating; a Class T or equivalent high-AIC fuse rated above the bank short-circuit current${sc ? ` (${sc} A)` : ''} is expected.`,
            componentIds: [bat.id, dev.id],
            cableIds: [],
            standard: 'BMEA',
          });
        }
      }
    } else {
      // Only a feeder leaving the terminal needs a fuse; a battery whose positive
      // carries nothing but bank interconnects is protected through its siblings.
      const feeder = terminalCables.some((w) => {
        const farId = w.from.component === bat.id && w.from.port === 'pos' ? w.to.component : w.from.component;
        const far = byId.get(farId);
        if (far && far.type === 'battery' && bankOf(far) === bankOf(bat)) return false;
        // A conductor that only reaches a starter motor is a cranking conductor and is exempt.
        const reach = reachable(net, portKey(farId, w.from.component === bat.id ? w.to.port : w.from.port));
        const others = [...reach].some((k) => {
          const comp = byId.get(splitKey(k).component);
          return comp && comp.id !== bat.id && comp.type !== 'starter' && comp.type !== 'battery-switch' && comp.type !== 'battery-selector' && comp.type !== 'junction' && comp.type !== 'terminal-block';
        });
        return others;
      });
      if (feeder) {
        checks.push({
          id: `battery-no-fuse-${bat.id}`,
          severity: 'error',
          message: `${bat.ref} ${bat.params.name}: no fuse or breaker on the positive conductor.`,
          componentIds: [bat.id],
          cableIds: [],
          standard: 'ISO10133',
        });
      }
    }
  }

  // ---- Battery selector switches ---------------------------------------------
  for (const sw of comps.filter((c) => c.type === 'battery-selector')) {
    const pos = sw.params.position ?? 'both';
    const bat = (port: string) => {
      const t = trace(net, portKey(sw.id, port), (_k, comp, p) => comp.type === 'battery' && p.id === 'pos', { avoidComponents: new Set([sw.id]) });
      return t ? byId.get(splitKey(t.target).component) : undefined;
    };
    const b1 = bat('in1');
    const b2 = bat('in2');
    if (pos === 'both' && b1 && b2) {
      const v1 = b1.params.voltage ?? 12;
      const v2 = b2.params.voltage ?? 12;
      if (Math.abs(v1 - v2) > 0.5) {
        checks.push({
          id: `selector-voltage-${sw.id}`,
          severity: 'error',
          message: `${sw.ref} ${sw.params.name} in BOTH parallels ${b1.ref} (${v1} V) with ${b2.ref} (${v2} V).`,
          componentIds: [sw.id, b1.id, b2.id],
          cableIds: [],
          standard: 'general',
        });
      } else if (b1.params.chemistry !== b2.params.chemistry) {
        checks.push({
          id: `selector-chemistry-${sw.id}`,
          severity: 'warning',
          message: `${sw.ref} ${sw.params.name} in BOTH parallels a ${b1.params.chemistry} bank with a ${b2.params.chemistry} bank. Mixed chemistries should not be left paralleled.`,
          componentIds: [sw.id, b1.id, b2.id],
          cableIds: [],
          standard: 'BMEA',
        });
      }
    }
    if (pos === 'off') {
      checks.push({
        id: `selector-off-${sw.id}`,
        severity: 'info',
        message: `${sw.ref} ${sw.params.name} is set to OFF, so nothing downstream of it is supplied in this analysis.`,
        componentIds: [sw.id],
        cableIds: [],
        standard: 'general',
      });
    }
  }

  // ---- Bank analysis ------------------------------------------------------
  const bankMap = new Map<string, BankAnalysis>();
  for (const bat of batteries) {
    const id = bat.params.bankId ?? bat.id;
    const capacity = (bat.params.capacityAh ?? 0) * (bat.params.parallelCount ?? 1);
    const existing = bankMap.get(id);
    if (existing) {
      existing.batteryIds.push(bat.id);
      existing.capacityAh += capacity;
    } else {
      bankMap.set(id, {
        bankId: id,
        name: bat.params.name,
        batteryIds: [bat.id],
        voltage: bat.params.voltage ?? 12,
        chemistry: bat.params.chemistry ?? 'agm',
        capacityAh: capacity,
        usableAh: 0,
        dailyAh: 0,
        peakLoadA: 0,
        autonomyDays: 0,
        chargeCurrentA: chargeIntoBank.get(id) ?? 0,
        chargerCurrentA: chargerIntoBank.get(id) ?? 0,
        chargeRateC: 0,
        loads: [],
      });
    }
  }
  // Energy delivered through inverters and converters is charged to the bank feeding them.
  const inverterEnergy = new Map<string, number>();
  for (const l of loads) if (l.viaInverter) inverterEnergy.set(l.viaInverter, (inverterEnergy.get(l.viaInverter) ?? 0) + l.dailyWh / INVERTER_EFFICIENCY);
  const converterEnergy = new Map<string, number>();
  for (const l of loads) if (l.viaConverter) converterEnergy.set(l.viaConverter, (converterEnergy.get(l.viaConverter) ?? 0) + l.dailyWh / DCDC_EFFICIENCY);
  for (const l of loads) {
    if (l.kind !== 'dc' || !l.bankId) continue;
    const bank = bankMap.get(l.bankId);
    if (!bank) continue;
    const extraWh = (inverterEnergy.get(l.loadId) ?? 0) + (converterEnergy.get(l.loadId) ?? 0);
    if (extraWh) l.dailyWh += extraWh;
    bank.loads.push(l);
    bank.dailyAh += l.dailyWh / bank.voltage;
    if (!l.intermittent) bank.peakLoadA += l.currentA;
  }
  for (const bank of bankMap.values()) {
    const dod = rb.dodByChemistry[bank.chemistry as keyof typeof rb.dodByChemistry] ?? 0.5;
    bank.usableAh = bank.capacityAh * dod;
    bank.autonomyDays = bank.dailyAh > 0 ? bank.usableAh / bank.dailyAh : Infinity;
    bank.chargeRateC = bank.capacityAh > 0 ? bank.chargerCurrentA / bank.capacityAh : 0;
    if (bank.dailyAh > 0 && bank.autonomyDays < rb.autonomyDays) {
      checks.push({
        id: `bank-autonomy-${bank.bankId}`,
        severity: 'warning',
        message: `${bank.name}: ${bank.dailyAh.toFixed(0)} Ah/day against ${bank.usableAh.toFixed(0)} Ah usable gives ${bank.autonomyDays.toFixed(1)} days, below the ${rb.autonomyDays} day target.`,
        componentIds: bank.batteryIds,
        cableIds: [],
        standard: 'BMEA',
      });
    }
    if (bank.chemistry !== 'lifepo4' && bank.chargeRateC > 0.3) {
      checks.push({
        id: `bank-charge-high-${bank.bankId}`,
        severity: 'warning',
        message: `${bank.name}: regulated charger current ${bank.chargerCurrentA.toFixed(0)} A is ${(bank.chargeRateC * 100).toFixed(0)} % of capacity, above the usual 30 % limit for lead-acid (alternator output excluded).`,
        componentIds: bank.batteryIds,
        cableIds: [],
        standard: 'BMEA',
      });
    }
    if (bank.chargeCurrentA === 0 && bank.loads.length) {
      checks.push({
        id: `bank-no-charge-${bank.bankId}`,
        severity: 'info',
        message: `${bank.name} has loads but no charging source connected.`,
        componentIds: bank.batteryIds,
        cableIds: [],
        standard: 'general',
      });
    }
  }

  // ---- AC source analysis and shore power checks --------------------------
  const acSources: AcSourceAnalysis[] = [];
  for (const src of comps.filter((c) => AC_SOURCE_TYPES.has(c.type))) {
    const fed = loads.filter((l) => l.kind === 'ac' && l.sourceId === src.id);
    const ratedA =
      src.type === 'shore-inlet' ? (src.params.ratedA ?? 16) : (src.params.ratedW ?? 0) / 230;
    const connectedA = fed.reduce((s, l) => s + l.currentA, 0);
    acSources.push({
      sourceId: src.id,
      ref: src.ref,
      name: src.params.name,
      type: src.type,
      ratedA,
      connectedW: fed.reduce((s, l) => s + l.watts, 0),
      connectedA,
      utilisationPct: ratedA > 0 ? (connectedA / ratedA) * 100 : 0,
      loads: fed,
    });
    if (ratedA > 0 && connectedA > ratedA) {
      checks.push({
        id: `ac-source-overload-${src.id}`,
        severity: 'info',
        message: `${src.ref} ${src.params.name}: connected load ${connectedA.toFixed(1)} A exceeds the ${ratedA.toFixed(0)} A rating. Acceptable only if diversity is justified.`,
        componentIds: [src.id],
        cableIds: [],
        standard: 'ISO13297',
      });
    }
    if ((src.type === 'inverter' || src.type === 'inverter-charger' || src.type === 'generator') && fed.length && src.params.neutralEarthLink === false) {
      checks.push({
        id: `ac-ne-link-${src.id}`,
        severity: 'warning',
        message: `${src.ref} ${src.params.name} supplies AC loads but has no neutral-to-earth link. The neutral must be connected to earth at the source when it supplies the vessel so that RCDs operate.`,
        componentIds: [src.id],
        cableIds: [],
        standard: 'ISO13297',
      });
    }
    if (src.type === 'shore-inlet') {
      const rcdOk = fed.length === 0 || fed.every((l) => l.protection.some((p) => byId.get(p.componentId)?.type === 'rcd' && (byId.get(p.componentId)?.params.sensitivityMa ?? 999) <= 30));
      if (!rcdOk) {
        checks.push({
          id: `shore-rcd-${src.id}`,
          severity: 'error',
          message: `${src.ref} ${src.params.name}: not every circuit fed from shore power passes through a 30 mA RCD.`,
          componentIds: [src.id],
          cableIds: [],
          standard: 'ISO13297',
        });
      }
      const twoPole = trace(net, portKey(src.id, 'L'), (_k, comp) => comp.type === 'rcd' || comp.type === 'ac-breaker-2p');
      if (fed.length && !twoPole) {
        checks.push({
          id: `shore-2p-${src.id}`,
          severity: 'error',
          message: `${src.ref} ${src.params.name}: no double-pole main disconnect or RCD downstream of the inlet.`,
          componentIds: [src.id],
          cableIds: [],
          standard: 'ISO13297',
        });
      } else if (twoPole) {
        const len = cablesOn(twoPole.hops).reduce((s, id) => s + (net.cables.get(id)?.params.lengthM ?? 0), 0);
        if (len > 0.5) {
          checks.push({
            id: `shore-main-distance-${src.id}`,
            severity: 'warning',
            message: `${src.ref}: ${len.toFixed(1)} m of cable between the inlet and the main breaker. The main disconnect should be as close as practicable to the inlet.`,
            componentIds: [src.id],
            cableIds: cablesOn(twoPole.hops),
            standard: 'ISO13297',
          });
        }
      }
      if (rb.requireGalvanicIsolation) {
        const viaIsolator = trace(net, portKey(src.id, 'PE'), (_k, comp) => comp.type === 'galvanic-isolator');
        const viaTransformer = trace(net, portKey(src.id, 'L'), (_k, comp) => comp.type === 'isolation-transformer');
        if (!viaIsolator && !viaTransformer) {
          checks.push({
            id: `shore-galvanic-${src.id}`,
            severity: 'warning',
            message: `${src.ref} ${src.params.name}: no galvanic isolator on the shore earth and no isolation transformer. Shore earth will be tied to the vessel bonding system.`,
            componentIds: [src.id],
            cableIds: [],
            standard: 'BMEA',
          });
        }
      }
    }
  }

  // ---- Bonding --------------------------------------------------------------
  const bondNodes = comps.filter((c) => c.type === 'underwater-metal' || c.type === 'anode');
  for (const m of bondNodes) {
    const bonded = trace(net, portKey(m.id, 'bond'), (_k, comp) => comp.id !== m.id && (comp.type === 'bonding-bus' || comp.type === 'earth-plate' || comp.type === 'anode' || comp.type === 'underwater-metal'));
    if (!bonded) {
      checks.push({
        id: `bond-${m.id}`,
        severity: 'warning',
        message: `${m.ref} ${m.params.name} is not connected to the bonding system.`,
        componentIds: [m.id],
        cableIds: [],
        standard: 'BMEA',
      });
    }
  }
  if (comps.some((c) => c.type === 'underwater-metal') && !comps.some((c) => c.type === 'anode')) {
    checks.push({
      id: 'bond-no-anode',
      severity: 'warning',
      message: 'Underwater metals are bonded but no sacrificial anode is in the design.',
      componentIds: comps.filter((c) => c.type === 'underwater-metal').map((c) => c.id),
      cableIds: [],
      standard: 'BMEA',
    });
  }

  // ---- NMEA 2000 --------------------------------------------------------------
  for (const bb of comps.filter((c) => c.type === 'n2k-backbone')) {
    const power = trace(net, portKey(bb.id, 'term1'), (_k, comp) => comp.type === 'n2k-power');
    const devices = comps.filter((c) => c.type === 'n2k-device' && trace(net, portKey(c.id, 'n2k'), (_k, comp) => comp.id === bb.id));
    const drawA = devices.reduce((s, d) => s + (d.params.amps ?? 0), 0);
    if (!power) {
      checks.push({
        id: `n2k-power-${bb.id}`,
        severity: 'warning',
        message: `${bb.ref} ${bb.params.name} has no power insertion point.`,
        componentIds: [bb.id],
        cableIds: [],
        standard: 'general',
      });
    } else if (drawA > 3) {
      checks.push({
        id: `n2k-load-${bb.id}`,
        severity: 'warning',
        message: `${bb.ref}: network load ${drawA.toFixed(2)} A exceeds the 3 A limit of a standard backbone power tap.`,
        componentIds: [bb.id],
        cableIds: [],
        standard: 'general',
      });
    }
    const termConnected = ['term1', 'term2'].filter((p) => project.cables.some((c) => (c.from.component === bb.id && c.from.port === p) || (c.to.component === bb.id && c.to.port === p)));
    if (termConnected.length) {
      checks.push({
        id: `n2k-term-${bb.id}`,
        severity: 'info',
        message: `${bb.ref}: backbone end ports are cabled. Each end must still carry a 120 ohm terminator.`,
        componentIds: [bb.id],
        cableIds: [],
        standard: 'general',
      });
    }
  }

  // ---- MCA coded vessel reminders ---------------------------------------------
  if (rb.standards.includes('MCA')) {
    if (!loads.some((l) => l.category === 'bilge')) {
      checks.push({
        id: 'mca-bilge',
        severity: 'warning',
        message: 'MCA coded vessel: no bilge pump circuit in the design. The code requires bilge pumping and alarm arrangements.',
        componentIds: [],
        cableIds: [],
        standard: 'MCA',
      });
    }
    if (!loads.some((l) => l.category === 'navigation' && l.critical)) {
      checks.push({
        id: 'mca-nav',
        severity: 'warning',
        message: 'MCA coded vessel: no navigation light circuit flagged as critical.',
        componentIds: [],
        cableIds: [],
        standard: 'MCA',
      });
    }
    if (batteries.length < 2) {
      checks.push({
        id: 'mca-two-banks',
        severity: 'info',
        message: 'MCA coded vessel: a separate engine start battery or an alternative means of starting is normally required.',
        componentIds: batteries.map((b) => b.id),
        cableIds: [],
        standard: 'MCA',
      });
    }
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  checks.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    network: net,
    loads,
    cables: [...cableResults.values()],
    banks: [...bankMap.values()],
    acSources,
    checks,
  };
}
