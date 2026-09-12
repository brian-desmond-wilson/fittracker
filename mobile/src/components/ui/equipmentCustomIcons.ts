// mobile/src/components/ui/equipmentCustomIcons.ts
// Hand-drawn equipment glyphs for gym gear the icon libraries don't cover well.
// Each is a complete SVG in Lucide's idiom (24-unit box, 2-unit stroke, round
// caps/joins, currentColor) so it sits beside the Lucide and Material icons
// without looking like a guest. Rendered through react-native-svg's SvgXml,
// whose `color` prop resolves `currentColor`.
const svg = (inner: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const CUSTOM_EQUIPMENT_SVG: Record<string, string> = {
  // straight bar with fixed plates at both ends
  fixedbar: svg('<line x1="2" y1="12" x2="22" y2="12"/><line x1="6" y1="7" x2="6" y2="17"/><line x1="18" y1="7" x2="18" y2="17"/><line x1="3.5" y1="9" x2="3.5" y2="15"/><line x1="20.5" y1="9" x2="20.5" y2="15"/>'),
  // wavy curl bar with plates
  ezbar: svg('<path d="M4 12 q2 -3.5 4 0 t4 0 t4 0 t4 0"/><line x1="3" y1="9" x2="3" y2="15"/><line x1="21" y1="9" x2="21" y2="15"/>'),
  // barbell running through two vertical guide rails
  smith: svg('<line x1="6" y1="3" x2="6" y2="21"/><line x1="18" y1="3" x2="18" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="4" y1="10" x2="4" y2="14"/><line x1="20" y1="10" x2="20" y2="14"/>'),
  // weight plate: ring with a center hub
  plate: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>'),
  // bar angled up from a floor pivot, plate at the top
  landmine: svg('<line x1="3.5" y1="20" x2="18" y2="6"/><circle cx="3.5" cy="20" r="1.4" fill="currentColor" stroke="none"/><line x1="15" y1="4" x2="18.5" y2="7.5"/><line x1="2" y1="21" x2="9" y2="21"/>'),
  // glute-ham developer: angled pad and foot rollers
  ghd: svg('<path d="M3 16 L 13 9"/><line x1="6" y1="15" x2="6" y2="21"/><line x1="11" y1="11" x2="11" y2="21"/><circle cx="17" cy="12" r="1.8"/><circle cx="17" cy="16.5" r="1.8"/>'),
  // two parallel dip bars with legs
  dipbars: svg('<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="6" y1="9" x2="6" y2="21"/><line x1="18" y1="15" x2="18" y2="21"/>'),
  // two gymnastic rings on straps
  rings: svg('<line x1="8" y1="3" x2="8" y2="10"/><line x1="16" y1="3" x2="16" y2="10"/><circle cx="8" cy="15" r="4.3"/><circle cx="16" cy="15" r="4.3"/>'),
  // resistance band loop
  bands_loop: svg('<path d="M4 12 C 4 7, 20 7, 20 12 C 20 17, 4 17, 4 12 Z"/><path d="M9 12 C 9 10, 15 10, 15 12 C 15 14, 9 14, 9 12 Z"/>'),
  // push sled with uprights
  sled: svg('<line x1="3" y1="19" x2="21" y2="19"/><path d="M7 19 L 10 9 H 14 L 17 19"/><line x1="6" y1="9" x2="18" y2="9"/>'),
};
