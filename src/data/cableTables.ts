/**
 * Cable rating data.
 *
 * IMPORTANT: these values are seeded from widely published UK/BS 7671 style
 * tables for single-core copper conductors at 30 °C ambient, adjusted for
 * marine insulation grades. They are a starting point. Before a design is
 * issued, verify them against the licensed copy of the standard selected for
 * the project (ISO 10133 Table 1, ISO 13297, BMEA CoP). All tables live in
 * this one file so they can be reviewed and corrected in one place.
 */
import type { InsulationTemp } from '../model/types';

/** Standard metric conductor sizes, mm² */
export const CSA_SIZES = [0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240] as const;

/**
 * Maximum continuous current, amps, single conductor, 30 °C ambient, not in an
 * engine space, by insulation temperature rating. Index matches CSA_SIZES.
 */
export const AMPACITY: Record<InsulationTemp, number[]> = {
  70: [8, 11, 15, 20, 27, 37, 47, 65, 87, 114, 141, 182, 234, 284, 330, 381, 436, 515],
  85: [10, 13, 18, 23, 32, 43, 56, 77, 103, 132, 164, 201, 258, 315, 367, 423, 486, 575],
  90: [11, 14, 19, 24, 33, 45, 58, 80, 107, 138, 171, 209, 269, 328, 382, 441, 506, 599],
  105: [12, 15, 21, 27, 36, 50, 64, 88, 118, 152, 188, 230, 296, 360, 420, 485, 556, 660],
};

/**
 * Grouping (bundling) factor for the number of current-carrying conductors
 * bunched together, from the BS 7671 Table 4C1 approach.
 */
export function bundlingFactor(count: number): number {
  const table: [number, number][] = [
    [1, 1],
    [2, 0.8],
    [3, 0.7],
    [4, 0.65],
    [5, 0.6],
    [6, 0.57],
    [7, 0.54],
    [8, 0.52],
    [9, 0.5],
    [12, 0.45],
    [16, 0.41],
    [20, 0.38],
  ];
  let f = 1;
  for (const [n, factor] of table) {
    if (count >= n) f = factor;
  }
  return f;
}

/**
 * Ambient temperature correction. Uses the thermal relationship
 * sqrt((Tins - Tamb) / (Tins - 30)) that underlies the BS 7671 Table 4B1 values.
 */
export function ambientFactor(ambientC: number, insulationTemp: InsulationTemp): number {
  if (ambientC <= 30) return 1;
  if (ambientC >= insulationTemp) return 0;
  return Math.sqrt((insulationTemp - ambientC) / (insulationTemp - 30));
}

export function baseAmpacity(csa: number, insulationTemp: InsulationTemp): number {
  const idx = CSA_SIZES.indexOf(csa as (typeof CSA_SIZES)[number]);
  if (idx < 0) {
    // Non-standard size: interpolate on the nearest standard sizes.
    const larger = CSA_SIZES.findIndex((s) => s > csa);
    if (larger <= 0) return AMPACITY[insulationTemp][larger < 0 ? CSA_SIZES.length - 1 : 0];
    const a = AMPACITY[insulationTemp][larger - 1];
    const b = AMPACITY[insulationTemp][larger];
    const t = (csa - CSA_SIZES[larger - 1]) / (CSA_SIZES[larger] - CSA_SIZES[larger - 1]);
    return a + (b - a) * t;
  }
  return AMPACITY[insulationTemp][idx];
}

/** Conventional conductor colours by network, per ISO 10133 / ISO 13297 practice in the UK. */
export const CONDUCTOR_COLOURS: Record<string, { name: string; hex: string; accepted: string[] }> = {
  'dc+': { name: 'Red', hex: '#d62828', accepted: ['red'] },
  'dc-': { name: 'Black', hex: '#222222', accepted: ['black', 'yellow'] },
  'ac-L': { name: 'Brown', hex: '#8b4513', accepted: ['brown'] },
  'ac-N': { name: 'Blue', hex: '#1d4ed8', accepted: ['blue'] },
  'ac-PE': { name: 'Green/yellow', hex: '#2e8b57', accepted: ['green/yellow', 'green-yellow', 'green'] },
  bond: { name: 'Green', hex: '#3a7d44', accepted: ['green', 'green/yellow'] },
  n2k: { name: 'N2K (blue jacket)', hex: '#5b8def', accepted: [] },
  'pv+': { name: 'Red', hex: '#d62828', accepted: ['red'] },
  'pv-': { name: 'Black', hex: '#222222', accepted: ['black'] },
  any: { name: 'Unassigned', hex: '#888888', accepted: [] },
};
