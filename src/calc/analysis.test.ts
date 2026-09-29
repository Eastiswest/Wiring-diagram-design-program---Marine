import { describe, expect, it } from 'vitest';
import { demoProject } from '../model/demo';
import { makeCable, makeComponent, newProject } from '../model/project';
import { analyse, sizeForCurrent } from './analysis';
import { ambientFactor, bundlingFactor } from '../data/cableTables';

describe('cable tables', () => {
  it('derates for bundling and ambient temperature', () => {
    expect(bundlingFactor(1)).toBe(1);
    expect(bundlingFactor(3)).toBe(0.7);
    expect(bundlingFactor(30)).toBe(0.38);
    expect(ambientFactor(30, 105)).toBe(1);
    expect(ambientFactor(60, 105)).toBeCloseTo(Math.sqrt(45 / 75), 5);
  });

  it('picks the smallest size that carries the current', () => {
    const p = newProject('t', {}, 'leisure');
    const cable = makeCable(p, { component: 'a', port: 'x' }, { component: 'b', port: 'y' }, { insulationTemp: 105 });
    expect(sizeForCurrent(10, cable, p.rulebook)).toBe(1);
    expect(sizeForCurrent(30, cable, p.rulebook)).toBe(2.5);
    expect(sizeForCurrent(200, cable, p.rulebook)).toBe(50);
    const engine = makeCable(p, { component: 'a', port: 'x' }, { component: 'b', port: 'y' }, { insulationTemp: 105, inEngineSpace: true });
    expect(sizeForCurrent(30, engine, p.rulebook)).toBe(2.5);
    expect(sizeForCurrent(35, engine, p.rulebook)).toBe(4);
  });
});

describe('simple DC circuit', () => {
  function circuit(lengthM: number, critical: boolean) {
    const p = newProject('t', {}, 'leisure');
    const bat = makeComponent(p, 'battery', 0, 0, { voltage: 12, capacityAh: 100, chemistry: 'agm' });
    const fuse = makeComponent(p, 'fuse', 0, 0, { rating: 15 });
    const load = makeComponent(p, 'dc-load', 0, 0, { watts: 120, voltage: 12, hoursPerDay: 2, critical });
    p.components.push(bat, fuse, load);
    p.cables.push(
      makeCable(p, { component: bat.id, port: 'pos' }, { component: fuse.id, port: 'in' }, { lengthM: 0.1 }),
      makeCable(p, { component: fuse.id, port: 'out' }, { component: load.id, port: 'pos' }, { lengthM }),
      makeCable(p, { component: load.id, port: 'neg' }, { component: bat.id, port: 'neg' }, { lengthM }),
    );
    return { p, bat, fuse, load };
  }

  it('traces the load to the battery and sizes the cables', () => {
    const { p, load } = circuit(5, false);
    const a = analyse(p);
    const l = a.loads.find((x) => x.loadId === load.id)!;
    expect(l.currentA).toBeCloseTo(10);
    expect(l.bankId).toBeDefined();
    expect(l.protection).toHaveLength(1);
    expect(l.protection[0].rating).toBe(15);
    expect(l.vdPct).toBeLessThanOrEqual(10);
    // Fuse is 15 A so cables must carry at least 15 A: 1 mm² at 105 °C carries 21 A.
    for (const c of a.cables) expect(c.csa).toBeGreaterThanOrEqual(1);
    expect(a.checks.filter((c) => c.severity === 'error')).toHaveLength(0);
    expect(a.banks[0].dailyAh).toBeCloseTo(20);
  });

  it('upsizes for voltage drop on a long critical circuit', () => {
    const { p } = circuit(15, true);
    const a = analyse(p);
    const long = a.cables.filter((c) => c.lengthM === 15);
    expect(long.every((c) => c.csa! >= 6)).toBe(true);
    expect(a.loads[0].vdPct).toBeLessThanOrEqual(3);
  });

  it('reports a fixed cable that is too small', () => {
    const { p } = circuit(15, true);
    p.cables[1].params.csa = 1;
    p.cables[2].params.csa = 1;
    const a = analyse(p);
    expect(a.checks.some((c) => c.id.startsWith('vd-'))).toBe(true);
  });

  it('flags a missing fuse', () => {
    const { p, fuse } = circuit(5, false);
    p.components = p.components.filter((c) => c.id !== fuse.id);
    p.cables = p.cables.filter((c) => c.from.component !== fuse.id && c.to.component !== fuse.id);
    const bat = p.components.find((c) => c.type === 'battery')!;
    const load = p.components.find((c) => c.type === 'dc-load')!;
    p.cables.push(makeCable(p, { component: bat.id, port: 'pos' }, { component: load.id, port: 'pos' }, { lengthM: 5 }));
    const a = analyse(p);
    expect(a.checks.some((c) => c.id.startsWith('unprotected-'))).toBe(true);
    expect(a.checks.some((c) => c.id.startsWith('battery-no-fuse-'))).toBe(true);
  });
});

describe('demo project', () => {
  it('analyses without errors', () => {
    const a = analyse(demoProject());
    const errors = a.checks.filter((c) => c.severity === 'error');
    expect(errors.map((e) => e.message)).toEqual([]);
    expect(a.banks.length).toBe(2);
    expect(a.acSources.some((s) => s.type === 'shore-inlet')).toBe(true);
    // Every cable on a power network gets a size.
    for (const c of a.cables) if (!['n2k', 'any'].includes(c.kind)) expect(c.csa).toBeDefined();
    // The AC loads run through the inverter's charger from shore, and the sockets are supplied by the inverter output.
    const socket = a.loads.find((l) => l.name === 'Saloon sockets')!;
    expect(socket.viaInverter).toBeDefined();
    expect(socket.protection.some((p) => p.circuitId === 'c1')).toBe(true);
  });
});

describe('DC-DC converter', () => {
  it('prefers the battery over a converter output that is paralleled with it', () => {
    const p = newProject('t', {}, 'leisure');
    const bat = makeComponent(p, 'battery', 0, 0, { voltage: 12, capacityAh: 100, chemistry: 'agm', bankId: 'house' });
    const start = makeComponent(p, 'battery', 0, 0, { voltage: 12, capacityAh: 100, chemistry: 'agm', bankId: 'start' });
    const fuse = makeComponent(p, 'fuse', 0, 0, { rating: 15 });
    const dcdc = makeComponent(p, 'dcdc', 0, 0, { inputVoltage: 12, voltage: 12, ratedA: 30 });
    const dcdcFuse = makeComponent(p, 'fuse', 0, 0, { rating: 40 });
    const bus = makeComponent(p, 'busbar', 0, 0, { netKind: 'dc+', portCount: 4 });
    const load = makeComponent(p, 'dc-load', 0, 0, { watts: 120, voltage: 12, hoursPerDay: 2 });
    p.components.push(bat, start, fuse, dcdc, dcdcFuse, bus, load);
    const w = (a: typeof bat, ap: string, b: typeof bat, bp: string, len = 1) => p.cables.push(makeCable(p, { component: a.id, port: ap }, { component: b.id, port: bp }, { lengthM: len }));
    w(bat, 'pos', fuse, 'in', 0.1);
    w(fuse, 'out', bus, 'p1');
    w(fuse, 'out', bus, 'p1');
    w(dcdc, 'pos', dcdcFuse, 'in', 0.2);
    w(dcdcFuse, 'out', bus, 'p2', 0.5);
    w(bus, 'p3', load, 'pos', 3);
    w(load, 'neg', bat, 'neg', 3);
    w(dcdc, 'neg', bat, 'neg', 1);
    w(start, 'pos', dcdc, 'inpos', 1);
    w(start, 'neg', dcdc, 'inneg', 1);
    const a = analyse(p);
    const l = a.loads.find((x) => x.loadId === load.id)!;
    expect(l.bankId).toBe('house');
    expect(l.viaConverter).toBeUndefined();
    const house = a.banks.find((b) => b.bankId === 'house')!;
    expect(house.dailyAh).toBeCloseTo(20);
    expect(house.chargeCurrentA).toBe(30);
    // The converter input is a load on the start bank.
    const startBank = a.banks.find((b) => b.bankId === 'start')!;
    expect(startBank.loads.some((x) => x.loadId === dcdc.id)).toBe(true);
  });

  it('uses the converter output as the supply for a separate voltage system', () => {
    const p = newProject('t', {}, 'leisure');
    const bat = makeComponent(p, 'battery', 0, 0, { voltage: 48, capacityAh: 100, chemistry: 'lifepo4', bankId: 'house' });
    const dcdc = makeComponent(p, 'dcdc', 0, 0, { inputVoltage: 48, voltage: 12, ratedA: 30 });
    const fuse = makeComponent(p, 'fuse', 0, 0, { rating: 10 });
    const load = makeComponent(p, 'dc-load', 0, 0, { watts: 60, voltage: 12, hoursPerDay: 4 });
    p.components.push(bat, dcdc, fuse, load);
    const w = (a: typeof bat, ap: string, b: typeof bat, bp: string, len = 1) => p.cables.push(makeCable(p, { component: a.id, port: ap }, { component: b.id, port: bp }, { lengthM: len }));
    w(bat, 'pos', dcdc, 'inpos');
    w(bat, 'neg', dcdc, 'inneg');
    w(dcdc, 'pos', fuse, 'in', 0.2);
    w(fuse, 'out', load, 'pos', 4);
    w(load, 'neg', dcdc, 'neg', 4);
    const a = analyse(p);
    const l = a.loads.find((x) => x.loadId === load.id)!;
    expect(l.viaConverter).toBe(dcdc.id);
    expect(l.currentA).toBeCloseTo(5);
    expect(a.checks.filter((c) => c.id.startsWith('voltage-mismatch'))).toHaveLength(0);
    // 240 Wh/day at 12 V through the converter lands on the 48 V bank as ~5.4 Ah.
    expect(a.banks[0].dailyAh).toBeCloseTo(240 / 0.92 / 48, 1);
  });
});

describe('common negative bus', () => {
  it('returns load current to the bank that supplies it', () => {
    const p = newProject('t', {}, 'leisure');
    const house = makeComponent(p, 'battery', 0, 0, { voltage: 12, capacityAh: 200, chemistry: 'agm', bankId: 'house' });
    const start = makeComponent(p, 'battery', 0, 0, { voltage: 12, capacityAh: 90, chemistry: 'agm', bankId: 'start' });
    const fuse = makeComponent(p, 'fuse', 0, 0, { rating: 100 });
    const negBus = makeComponent(p, 'busbar', 0, 0, { netKind: 'dc-', portCount: 4 });
    const load = makeComponent(p, 'dc-load', 0, 0, { amps: 80, voltage: 12, hoursPerDay: 1 });
    p.components.push(house, start, fuse, negBus, load);
    const w = (a: typeof house, ap: string, b: typeof house, bp: string, len = 1) => {
      const c = makeCable(p, { component: a.id, port: ap }, { component: b.id, port: bp }, { lengthM: len });
      p.cables.push(c);
      return c;
    };
    w(house, 'pos', fuse, 'in', 0.1);
    w(fuse, 'out', load, 'pos', 2);
    w(load, 'neg', negBus, 'p1', 2);
    const houseNeg = w(house, 'neg', negBus, 'p2', 3); // longer path in hops? no: same hops, but order matters
    const startNeg = w(start, 'neg', negBus, 'p3', 0.5);
    const a = analyse(p);
    const hn = a.cables.find((c) => c.cableId === houseNeg.id)!;
    const sn = a.cables.find((c) => c.cableId === startNeg.id)!;
    expect(hn.loadCurrentA).toBeCloseTo(80);
    expect(sn.loadCurrentA).toBe(0);
    expect(a.loads[0].bankId).toBe('house');
  });
});

describe('parallel batteries', () => {
  it('sizes interconnects for the bank current and sums the bank capacity', () => {
    const p = newProject('t', {}, 'leisure');
    const b1 = makeComponent(p, 'battery', 0, 0, { voltage: 12, capacityAh: 100, chemistry: 'agm', bankId: 'house' });
    const b2 = makeComponent(p, 'battery', 0, 0, { voltage: 12, capacityAh: 100, chemistry: 'agm', bankId: 'house' });
    const fuse = makeComponent(p, 'fuse', 0, 0, { rating: 100 });
    const load = makeComponent(p, 'dc-load', 0, 0, { amps: 80, voltage: 12, hoursPerDay: 1 });
    p.components.push(b1, b2, fuse, load);
    const w = (a: typeof b1, ap: string, b: typeof b1, bp: string, len = 1) => {
      const c = makeCable(p, { component: a.id, port: ap }, { component: b.id, port: bp }, { lengthM: len });
      p.cables.push(c);
      return c;
    };
    const posLink = w(b1, 'pos', b2, 'pos', 0.3);
    const negLink = w(b1, 'neg', b2, 'neg', 0.3);
    w(b1, 'pos', fuse, 'in', 0.1);
    w(fuse, 'out', load, 'pos', 2);
    w(load, 'neg', b1, 'neg', 2);
    const a = analyse(p);
    expect(a.banks[0].capacityAh).toBe(200);
    expect(a.cables.find((c) => c.cableId === posLink.id)!.loadCurrentA).toBeCloseTo(80);
    expect(a.cables.find((c) => c.cableId === negLink.id)!.loadCurrentA).toBeCloseTo(80);
    expect(a.checks.filter((c) => c.severity === 'error')).toHaveLength(0);
  });
});

describe('battery selector switch', () => {
  function rig(position: 'off' | '1' | '2' | 'both') {
    const p = newProject('t', {}, 'leisure');
    const b1 = makeComponent(p, 'battery', 0, 0, { voltage: 12, capacityAh: 100, chemistry: 'agm', bankId: 'one' });
    const b2 = makeComponent(p, 'battery', 0, 0, { voltage: 12, capacityAh: 100, chemistry: 'agm', bankId: 'two' });
    const f1 = makeComponent(p, 'fuse', 0, 0, { rating: 100 });
    const f2 = makeComponent(p, 'fuse', 0, 0, { rating: 100 });
    const sw = makeComponent(p, 'battery-selector', 0, 0, { position });
    const load = makeComponent(p, 'dc-load', 0, 0, { amps: 10, voltage: 12, hoursPerDay: 1 });
    p.components.push(b1, b2, f1, f2, sw, load);
    const w = (a: typeof b1, ap: string, b: typeof b1, bp: string, len = 1) => p.cables.push(makeCable(p, { component: a.id, port: ap }, { component: b.id, port: bp }, { lengthM: len }));
    w(b1, 'pos', f1, 'in', 0.1);
    w(f1, 'out', sw, 'in1');
    w(b2, 'pos', f2, 'in', 0.1);
    w(f2, 'out', sw, 'in2');
    w(sw, 'out', load, 'pos', 2);
    w(load, 'neg', b1, 'neg', 2);
    w(load, 'neg', b2, 'neg', 2);
    return { p, load, b2 };
  }
  it('supplies from bank 1 in position 1', () => {
    const { p, load } = rig('1');
    const l = analyse(p).loads.find((x) => x.loadId === load.id)!;
    expect(l.bankId).toBe('one');
  });
  it('supplies from bank 2 in position 2', () => {
    const { p, load } = rig('2');
    const l = analyse(p).loads.find((x) => x.loadId === load.id)!;
    expect(l.bankId).toBe('two');
  });
  it('isolates the load when OFF', () => {
    const { p, load } = rig('off');
    const l = analyse(p).loads.find((x) => x.loadId === load.id)!;
    expect(l.bankId).toBeUndefined();
  });
  it('warns when BOTH parallels different voltages', () => {
    const { p, b2 } = rig('both');
    b2.params.voltage = 24;
    const a = analyse(p);
    expect(a.checks.some((c) => c.id.startsWith('selector-voltage'))).toBe(true);
  });
});

describe('engine starter', () => {
  it('sizes the cranking circuit on voltage drop without demanding a fuse', () => {
    const p = newProject('t', {}, 'leisure');
    const bat = makeComponent(p, 'battery', 0, 0, { voltage: 12, capacityAh: 90, chemistry: 'agm', bankId: 'start' });
    const sw = makeComponent(p, 'battery-switch', 0, 0, {});
    const starter = makeComponent(p, 'starter', 0, 0, { amps: 600, voltage: 12 });
    p.components.push(bat, sw, starter);
    const w = (a: typeof bat, ap: string, b: typeof bat, bp: string, len: number) => {
      const c = makeCable(p, { component: a.id, port: ap }, { component: b.id, port: bp }, { lengthM: len });
      p.cables.push(c);
      return c;
    };
    w(bat, 'pos', sw, 'in', 0.5);
    const feed = w(sw, 'out', starter, 'pos', 1.5);
    w(starter, 'neg', bat, 'neg', 2);
    const a = analyse(p);
    const l = a.loads.find((x) => x.loadId === starter.id)!;
    expect(l.intermittent).toBe(true);
    expect(l.vdPct).toBeLessThanOrEqual(5);
    const f = a.cables.find((c) => c.cableId === feed.id)!;
    expect(f.crankCurrentA).toBe(600);
    expect(f.csa).toBeGreaterThanOrEqual(25);
    expect(a.checks.filter((c) => c.severity === 'error')).toHaveLength(0);
    expect(a.checks.some((c) => c.id.startsWith('starter-unprotected'))).toBe(true);
    expect(a.banks[0].peakLoadA).toBe(0);
  });
});
