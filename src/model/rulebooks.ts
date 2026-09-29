import type { RulebookSettings, StandardId, VesselUse } from './types';

export interface StandardInfo {
  id: StandardId;
  title: string;
  summary: string;
}

export const STANDARDS: StandardInfo[] = [
  {
    id: 'ISO10133',
    title: 'ISO 10133 - Small craft, extra-low-voltage DC installations',
    summary: 'DC systems up to 50 V on recreational craft. Cable ratings, protection, battery installation.',
  },
  {
    id: 'ISO13297',
    title: 'ISO 13297 - Small craft, AC installations',
    summary: 'AC systems on recreational craft: shore power, RCDs, neutral-earth bonding, cable ratings.',
  },
  {
    id: 'BMEA',
    title: 'BMEA Code of Practice',
    summary: 'British Marine Electrical Association guidance for UK leisure and small commercial craft.',
  },
  {
    id: 'MCA',
    title: 'MCA small commercial vessel codes',
    summary: 'Workboat Code / MGN 280 requirements: emergency lighting, bilge alarms, segregation, documentation.',
  },
  {
    id: 'BS7671',
    title: 'BS 7671 - AC side',
    summary: 'UK wiring regulations approach to RCD selection, earthing and voltage drop for the 230 V system.',
  },
  {
    id: 'CLASS',
    title: 'Class rules (Lloyd’s Register, DNV, BV)',
    summary: 'Classed vessels. The tool applies its conservative defaults; class approval is a separate process.',
  },
];

export function defaultRulebook(vesselUse: VesselUse = 'leisure'): RulebookSettings {
  const standards: StandardId[] =
    vesselUse === 'leisure'
      ? ['ISO10133', 'ISO13297', 'BMEA']
      : vesselUse === 'commercial'
        ? ['ISO10133', 'ISO13297', 'BMEA', 'MCA']
        : ['ISO10133', 'ISO13297', 'CLASS'];
  return {
    standards,
    vesselUse,
    dcCriticalVdPct: 3,
    dcGeneralVdPct: 10,
    acVdPct: 5,
    maxUnprotectedBatteryM: 0.2,
    protectionMarginFactor: 1.25,
    engineSpaceDerate: 0.85,
    dodByChemistry: { flooded: 0.5, agm: 0.5, gel: 0.5, lifepo4: 0.8 },
    copperResistivity: 0.0175,
    requireGalvanicIsolation: true,
    autonomyDays: vesselUse === 'commercial' ? 1 : 2,
    starterVdPct: 5,
  };
}

export const VESSEL_USES: { id: VesselUse; label: string; description: string }[] = [
  { id: 'leisure', label: 'Leisure craft', description: 'Recreational Craft Regulations: ISO 10133 / ISO 13297 with the BMEA Code of Practice.' },
  { id: 'commercial', label: 'MCA coded commercial', description: 'Small commercial vessel codes on top of the leisure standards.' },
  { id: 'classed', label: 'Classed vessel', description: 'Class society rules. Conservative defaults; class approval handled separately.' },
];
