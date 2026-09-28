# Marine Electrical Designer

A browser-based tool for designing small-craft electrical systems (DC and 230 V AC) to UK practice: draw the system as a schematic, and the tool sizes the cables, runs the load and battery analysis, checks the design against the selected rulebook and generates the point-to-point wiring list from the same data.

Everything runs in the browser. Projects are saved as JSON files and autosaved to browser storage. No backend, no account.

## What it does

- **Schematic editor.** Drag components from the palette (batteries, alternators, solar, DC-DC, chargers, inverter/chargers, switches, fuses, breakers, busbars, distribution panels, loads, shore inlet, galvanic isolator, isolation transformer, generator, RCDs, transfer switch, AC panel, sockets, hull earth, bonding bus, anodes, underwater metals, NMEA 2000 backbone and devices). Drag between terminals to run a cable. Terminals are typed (DC+, DC-, AC L/N/PE, bonding, NMEA 2000) and the editor only allows compatible connections.
- **Automatic cable sizing.** Every cable is traced to its source. The design current is the sum of the loads it carries (or the charge current it delivers). The cable is sized so its derated capacity covers both that current and the rating of the device protecting it, then upsized where needed to meet the voltage drop limit at every load. Derating covers insulation grade, bundling, ambient temperature and engine spaces. Any cable can be fixed to a manual size, in which case the checks report if it is too small.
- **Load analysis.** Daily Ah budget per battery bank, usable capacity from chemistry and depth of discharge, autonomy, peak current, charge current as a fraction of capacity. Energy drawn through inverters and DC-DC converters is charged back to the bank that feeds them. Connected load per AC source.
- **Design checks.** Missing protection, protection versus cable capacity and load current, voltage drop, battery main fuse placement and interrupt rating for lithium, shore power RCD and double-pole disconnect, galvanic isolation, neutral-earth link at onboard AC sources, protective earth on every AC load, bonding of underwater metals, NMEA 2000 power, conductor colours, mixed networks, mixed voltages, bank autonomy and charge rate, plus reminders for MCA coded vessels.
- **Point-to-point wiring list.** For every component, which cable lands on each terminal and where the other end goes, with size, colour and length. Printable.
- **Cable schedule** with inline editing of length, size and colour.
- **Export** of the schematic as a true vector SVG with a title block, or as PNG.
- **Rulebook per project.** Choose the vessel use (leisure, MCA coded commercial, classed) and the standards to check against (ISO 10133, ISO 13297, BMEA Code of Practice, MCA codes, BS 7671 for the AC side, class rules). Voltage drop limits, protection margins, depth of discharge and other limits are editable in Settings.

## Running it

```bash
npm install
npm run dev        # development server
npm test           # calculation engine tests
npm run build      # production build in dist/
```

The included GitHub Actions workflow builds and deploys to GitHub Pages on every push to `main`. Enable Pages with the "GitHub Actions" source in the repository settings.

## How the calculations work

- `src/calc/network.ts` builds a port-level graph of the design: every terminal is a vertex; cables and the internal links inside components (busbar studs, breaker in/out, panel feeds) are edges. Loads and charge sources are traced to their battery or AC source through this graph.
- `src/calc/analysis.ts` allocates currents to cables, sizes them, iterates on voltage drop, builds the bank and AC source analysis and produces the check list.
- `src/data/cableTables.ts` holds the current-carrying capacity table by insulation grade, the bundling and ambient temperature factors, and the conductor colour conventions. **These are seeded from published UK tables and must be verified against the licensed text of the standard chosen for the project before a design is issued.** They live in one file so they can be reviewed and corrected in one place.

## Project structure

```
src/model       data model, component catalogue, rulebooks, demo project
src/data        cable rating tables
src/calc        network graph and analysis engine (with tests)
src/store       project state, undo/redo, autosave
src/ui          schematic editor, inspector and the analysis views
src/export      SVG and PNG export
```

## Roadmap

- PDF drawing sheets (A3/A4 with title block, revision table and cable schedule)
- Cable schedule and bill of materials export to Excel/CSV
- DXF export for the yard's CAD
- Multiple sheets per project and hierarchical panels
- Component library with manufacturer part numbers
