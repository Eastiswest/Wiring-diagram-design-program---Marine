/**
 * A small but complete demo design: 12 V lithium house bank charged by a
 * DC-DC charger and an inverter/charger, AGM start battery on the alternator,
 * shore power with galvanic isolation, a bonding system and an NMEA 2000 backbone.
 */
import { makeCable, makeComponent, newProject } from './project';
import type { Component, ComponentParams, ComponentType, Project } from './types';

export function demoProject(): Project {
  const p = newProject('Demo 11 m motor cruiser', { name: 'Sea Otter', type: 'Motor cruiser', loaM: 11, drawingNumber: 'SO-EL-001', revision: 'A' }, 'leisure');
  const add = (type: ComponentType, x: number, y: number, params: Partial<ComponentParams> = {}): Component => {
    const c = makeComponent(p, type, x, y, params);
    p.components.push(c);
    return c;
  };
  const wire = (from: [Component, string], to: [Component, string], lengthM: number, extra: Parameters<typeof makeCable>[3] = {}) => {
    p.cables.push(makeCable(p, { component: from[0].id, port: from[1] }, { component: to[0].id, port: to[1] }, { lengthM, ...extra }));
  };

  // ---- DC sources and main distribution -------------------------------------
  const house = add('battery', 60, 200, { name: 'House bank', voltage: 12, capacityAh: 400, chemistry: 'lifepo4', bankId: 'house', maxDischargeA: 200, shortCircuitA: 6000, location: 'Under saloon sole' });
  const houseFuse = add('fuse', 260, 180, { name: 'House main fuse', protectionType: 'Class T', rating: 250, interruptA: 20000 });
  const houseSwitch = add('battery-switch', 400, 180, { name: 'House isolator', ratedA: 300 });
  const shunt = add('shunt', 260, 300, { name: 'Battery monitor shunt', ratedA: 500 });
  const posBus = add('busbar', 580, 100, { name: 'DC+ bus', netKind: 'dc+', portCount: 6, ratedA: 250 });
  const negBus = add('busbar', 580, 340, { name: 'DC- bus', netKind: 'dc-', portCount: 12, ratedA: 250 });

  const alt = add('alternator', 60, 440, { name: 'Engine alternator', voltage: 12, ratedA: 110, location: 'Engine room' });
  const altFuse = add('fuse', 260, 450, { name: 'Alternator fuse', protectionType: 'MEGA', rating: 150, interruptA: 2000, location: 'Engine room' });
  const start = add('battery', 60, 620, { name: 'Start battery', voltage: 12, capacityAh: 90, chemistry: 'agm', bankId: 'start', location: 'Engine room' });
  const startFuse = add('fuse', 260, 600, { name: 'Start main fuse', protectionType: 'MIDI', rating: 60, interruptA: 2000 });
  const startSwitch = add('battery-switch', 400, 600, { name: 'Start isolator', ratedA: 300 });
  const dcdc = add('dcdc', 540, 590, { name: 'Start to house DC-DC', inputVoltage: 12, voltage: 12, ratedA: 30 });
  const dcdcFuse = add('fuse', 720, 600, { name: 'DC-DC output fuse', protectionType: 'MIDI', rating: 40, interruptA: 2000 });

  // ---- DC panel and loads ------------------------------------------------------
  const panelFuse = add('fuse', 720, 100, { name: 'Panel feed fuse', protectionType: 'MIDI', rating: 60, interruptA: 2000 });
  const panel = add('dc-panel', 880, 60, {
    name: 'Main DC panel',
    location: 'Helm',
    circuits: [
      { id: 'c1', name: 'Nav lights', rating: 5 },
      { id: 'c2', name: 'Cabin lights', rating: 10 },
      { id: 'c3', name: 'Instruments', rating: 5 },
      { id: 'c4', name: 'Bilge pump', rating: 10 },
      { id: 'c5', name: 'Fridge', rating: 10 },
      { id: 'c6', name: 'NMEA 2000', rating: 5 },
    ],
  });
  const loads = [
    add('dc-load', 1140, 40, { name: 'Navigation lights', watts: 25, hoursPerDay: 6, critical: true, category: 'navigation', location: 'Mast / pulpit' }),
    add('dc-load', 1140, 120, { name: 'Cabin lighting', watts: 40, hoursPerDay: 5, category: 'lighting' }),
    add('dc-load', 1140, 200, { name: 'Chartplotter / instruments', watts: 30, hoursPerDay: 8, critical: true, category: 'electronics', location: 'Helm' }),
    add('dc-load', 1140, 280, { name: 'Bilge pump', amps: 6, hoursPerDay: 0.2, critical: true, category: 'bilge', location: 'Engine room bilge' }),
    add('dc-load', 1140, 360, { name: 'Fridge', watts: 45, hoursPerDay: 24, dutyCycle: 0.4, category: 'refrigeration', location: 'Galley' }),
  ];
  const n2kPower = add('n2k-power', 1140, 460, { name: 'N2K power tap', location: 'Helm', amps: 0.5 });

  // ---- Inverter/charger and AC ---------------------------------------------------
  const invFuse = add('fuse', 720, 480, { name: 'Inverter fuse', protectionType: 'Class T', rating: 250, interruptA: 20000 });
  const inv = add('inverter-charger', 880, 700, { name: 'Inverter/charger 2 kW', voltage: 12, ratedW: 2000, chargerA: 100, location: 'Engine room bulkhead' });
  const shore = add('shore-inlet', 60, 860, { name: 'Shore inlet 16 A', ratedA: 16, location: 'Cockpit' });
  const gi = add('galvanic-isolator', 300, 960, { name: 'Galvanic isolator' });
  const rcd = add('rcd', 300, 850, { name: 'Shore main RCBO', rating: 16, sensitivityMa: 30, location: 'Cockpit locker' });
  const acPanel = add('ac-panel', 1140, 660, {
    name: 'AC consumer unit',
    location: 'Saloon',
    circuits: [
      { id: 'c1', name: 'Sockets', rating: 16 },
      { id: 'c2', name: 'Water heater', rating: 16 },
    ],
  });
  const socket = add('ac-socket', 1400, 620, { name: 'Saloon sockets', watts: 500, hoursPerDay: 1 });
  const heater = add('ac-load', 1400, 720, { name: 'Calorifier immersion', watts: 1000, hoursPerDay: 0.5 });
  const earth = add('earth-plate', 1400, 860, { name: 'Hull earth', location: 'Engine bed' });

  // ---- Bonding --------------------------------------------------------------------
  const bondBus = add('bonding-bus', 1680, 300, { name: 'Bonding bus', portCount: 4 });
  const shaft = add('underwater-metal', 1800, 220, { name: 'Prop shaft' });
  const rudder = add('underwater-metal', 1800, 300, { name: 'Rudder stock' });
  const anode = add('anode', 1800, 380, { name: 'Hull anode' });

  // ---- NMEA 2000 -------------------------------------------------------------------
  const backbone = add('n2k-backbone', 1400, 40, { name: 'N2K backbone', portCount: 4 });
  const mfd = add('n2k-device', 1360, 140, { name: 'MFD', amps: 0.25 });
  const gps = add('n2k-device', 1520, 140, { name: 'GPS antenna', amps: 0.1 });

  // ---- DC wiring -------------------------------------------------------------------
  wire([house, 'pos'], [houseFuse, 'in'], 0.15, { colour: 'red' });
  wire([houseFuse, 'out'], [houseSwitch, 'in'], 0.4, { colour: 'red' });
  wire([houseSwitch, 'out'], [posBus, 'p1'], 1.5, { colour: 'red' });
  wire([house, 'neg'], [shunt, 'in'], 0.3, { colour: 'black' });
  wire([shunt, 'out'], [negBus, 'p1'], 1.5, { colour: 'black' });

  wire([alt, 'pos'], [altFuse, 'in'], 2.5, { colour: 'red', inEngineSpace: true });
  wire([altFuse, 'out'], [start, 'pos'], 0.15, { colour: 'red', inEngineSpace: true });
  wire([alt, 'neg'], [negBus, 'p3'], 3.0, { colour: 'black', inEngineSpace: true });
  wire([start, 'pos'], [startFuse, 'in'], 0.15, { colour: 'red', inEngineSpace: true });
  wire([startFuse, 'out'], [startSwitch, 'in'], 0.4, { colour: 'red', inEngineSpace: true });
  wire([startSwitch, 'out'], [dcdc, 'inpos'], 1.0, { colour: 'red', inEngineSpace: true });
  wire([start, 'neg'], [negBus, 'p5'], 2.0, { colour: 'black', inEngineSpace: true });
  wire([dcdc, 'inneg'], [negBus, 'p7'], 1.0, { colour: 'black' });
  wire([dcdc, 'pos'], [dcdcFuse, 'in'], 0.3, { colour: 'red' });
  wire([dcdcFuse, 'out'], [posBus, 'p3'], 1.0, { colour: 'red' });
  wire([dcdc, 'neg'], [negBus, 'p9'], 1.0, { colour: 'black' });

  wire([posBus, 'p2'], [panelFuse, 'in'], 0.5, { colour: 'red' });
  wire([panelFuse, 'out'], [panel, 'feed'], 4.0, { colour: 'red' });
  const circuits = ['c1', 'c2', 'c3', 'c4', 'c5'];
  const runLengths = [12, 8, 6, 5, 7];
  const negStuds = ['p2', 'p4', 'p6', 'p8', 'p10'];
  loads.forEach((l, i) => {
    wire([panel, `out_${circuits[i]}`], [l, 'pos'], runLengths[i], { colour: 'red' });
    wire([l, 'neg'], [negBus, negStuds[i]], runLengths[i] + 2, { colour: 'black' });
  });
  wire([panel, 'out_c6'], [n2kPower, 'pos'], 3, { colour: 'red' });
  wire([n2kPower, 'neg'], [negBus, 'p12'], 3, { colour: 'black' });

  wire([posBus, 'p4'], [invFuse, 'in'], 0.3, { colour: 'red' });
  wire([invFuse, 'out'], [inv, 'pos'], 1.2, { colour: 'red' });
  wire([inv, 'neg'], [negBus, 'p11'], 1.5, { colour: 'black' });

  // ---- AC wiring ---------------------------------------------------------------------
  wire([shore, 'L'], [rcd, 'inL'], 0.4, { colour: 'brown', insulationTemp: 70 });
  wire([shore, 'N'], [rcd, 'inN'], 0.4, { colour: 'blue', insulationTemp: 70 });
  wire([shore, 'PE'], [gi, 'in'], 0.4, { colour: 'green/yellow', insulationTemp: 70 });
  wire([rcd, 'outL'], [inv, 'inL'], 6, { colour: 'brown', insulationTemp: 70 });
  wire([rcd, 'outN'], [inv, 'inN'], 6, { colour: 'blue', insulationTemp: 70 });
  wire([gi, 'out'], [inv, 'inPE'], 6, { colour: 'green/yellow', insulationTemp: 70 });
  wire([inv, 'outL'], [acPanel, 'feedL'], 2, { colour: 'brown', insulationTemp: 70 });
  wire([inv, 'outN'], [acPanel, 'feedN'], 2, { colour: 'blue', insulationTemp: 70 });
  wire([inv, 'outPE'], [acPanel, 'feedPE'], 2, { colour: 'green/yellow', insulationTemp: 70 });
  wire([acPanel, 'out_c1'], [socket, 'L'], 9, { colour: 'brown', insulationTemp: 70 });
  wire([acPanel, 'busN'], [socket, 'N'], 9, { colour: 'blue', insulationTemp: 70 });
  wire([acPanel, 'busPE'], [socket, 'PE'], 9, { colour: 'green/yellow', insulationTemp: 70 });
  wire([acPanel, 'out_c2'], [heater, 'L'], 5, { colour: 'brown', insulationTemp: 70 });
  wire([acPanel, 'busN'], [heater, 'N'], 5, { colour: 'blue', insulationTemp: 70 });
  wire([acPanel, 'busPE'], [heater, 'PE'], 5, { colour: 'green/yellow', insulationTemp: 70 });
  wire([acPanel, 'busPE'], [earth, 'pe'], 3, { colour: 'green/yellow', insulationTemp: 70 });
  wire([negBus, 'p12'], [earth, 'neg'], 2, { colour: 'black' });

  // ---- Bonding -------------------------------------------------------------------------
  wire([bondBus, 'p1'], [shaft, 'bond'], 2, { colour: 'green' });
  wire([bondBus, 'p2'], [rudder, 'bond'], 3, { colour: 'green' });
  wire([bondBus, 'p3'], [anode, 'bond'], 1.5, { colour: 'green' });
  wire([bondBus, 'p4'], [earth, 'bond'], 4, { colour: 'green' });

  // ---- NMEA 2000 ------------------------------------------------------------------------
  wire([backbone, 'drop1'], [mfd, 'n2k'], 1);
  wire([backbone, 'drop2'], [gps, 'n2k'], 3);
  wire([backbone, 'drop3'], [n2kPower, 'n2k'], 2);

  return p;
}
