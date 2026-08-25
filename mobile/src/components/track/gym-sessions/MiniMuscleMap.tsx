// A body at a glance: front and back silhouettes with trained zones lit.
// Region names come from muscle_regions rows via regionsHit(); anything the
// zone table doesn't know is silently unlit rather than wrong.
import React from "react";
import Svg, { Circle, Ellipse, Rect } from "react-native-svg";
import { colors } from "@/src/lib/colors";

/** Which silhouette a zone draws on. */
type Side = "front" | "back";
interface Zone { side: Side; shapes: React.ReactElement[] }

const lit = colors.primary;

/** Shared silhouette scaffold, 24×44 viewBox per figure. */
function Figure({ children, x }: { children: React.ReactNode; x: number }) {
  return (
    <>
      <Circle cx={x + 12} cy={5} r={3.4} fill="#1F2937" />
      <Rect x={x + 6.5} y={9.5} width={11} height={15} rx={4} fill="#1F2937" />
      <Rect x={x + 2.5} y={10.5} width={3.4} height={12} rx={1.7} fill="#1F2937" />
      <Rect x={x + 18.1} y={10.5} width={3.4} height={12} rx={1.7} fill="#1F2937" />
      <Rect x={x + 6.8} y={25} width={4.6} height={14} rx={2.2} fill="#1F2937" />
      <Rect x={x + 12.6} y={25} width={4.6} height={14} rx={2.2} fill="#1F2937" />
      {children}
    </>
  );
}

/** Region name → highlight shapes. Coordinates are inside the 24-wide figure;
 *  the caller offsets front (x=0) and back (x=26). */
function zoneShapes(region: string, x: number): { side: Side; el: React.ReactElement } | null {
  const k = region.toLowerCase();
  const el = (side: Side, node: React.ReactElement) => ({ side, el: node });
  if (k.includes("chest")) return el("front", <Ellipse cx={x + 12} cy={13} rx={5} ry={2.6} fill={lit} />);
  if (k.includes("shoulder")) return el("front", <><Circle cx={x + 5.5} cy={11} r={2} fill={lit} /><Circle cx={x + 18.5} cy={11} r={2} fill={lit} /></>);
  if (k.includes("bicep")) return el("front", <><Rect x={x + 2.7} y={12} width={3} height={5} rx={1.5} fill={lit} /><Rect x={x + 18.3} y={12} width={3} height={5} rx={1.5} fill={lit} /></>);
  if (k.includes("tricep")) return el("back", <><Rect x={x + 2.7} y={12} width={3} height={5} rx={1.5} fill={lit} /><Rect x={x + 18.3} y={12} width={3} height={5} rx={1.5} fill={lit} /></>);
  if (k.includes("forearm") || k.includes("grip")) return el("front", <><Rect x={x + 2.7} y={17.5} width={3} height={4.5} rx={1.5} fill={lit} /><Rect x={x + 18.3} y={17.5} width={3} height={4.5} rx={1.5} fill={lit} /></>);
  if (k.includes("core") || k.includes("abs")) return el("front", <Rect x={x + 9} y={16.5} width={6} height={7} rx={2} fill={lit} />);
  if (k.includes("oblique")) return el("front", <><Rect x={x + 7} y={17} width={2.2} height={6} rx={1.1} fill={lit} /><Rect x={x + 14.8} y={17} width={2.2} height={6} rx={1.1} fill={lit} /></>);
  if (k.includes("lat")) return el("back", <><Rect x={x + 6.8} y={13.5} width={3.4} height={7} rx={1.7} fill={lit} /><Rect x={x + 13.8} y={13.5} width={3.4} height={7} rx={1.7} fill={lit} /></>);
  if (k.includes("trap") || k.includes("neck")) return el("back", <Ellipse cx={x + 12} cy={10.5} rx={4.4} ry={1.8} fill={lit} />);
  if (k.includes("upper back") || k.includes("rhomboid")) return el("back", <Rect x={x + 8} y={12} width={8} height={4} rx={2} fill={lit} />);
  if (k.includes("lower back") || k.includes("posterior")) return el("back", <Rect x={x + 8.5} y={19.5} width={7} height={4} rx={2} fill={lit} />);
  if (k.includes("glute")) return el("back", <Ellipse cx={x + 12} cy={25.5} rx={5} ry={2.6} fill={lit} />);
  if (k.includes("quad") || k.includes("hip flexor")) return el("front", <><Rect x={x + 7} y={26} width={4.2} height={7.5} rx={2} fill={lit} /><Rect x={x + 12.8} y={26} width={4.2} height={7.5} rx={2} fill={lit} /></>);
  if (k.includes("hamstring")) return el("back", <><Rect x={x + 7} y={27} width={4.2} height={7} rx={2} fill={lit} /><Rect x={x + 12.8} y={27} width={4.2} height={7} rx={2} fill={lit} /></>);
  if (k.includes("abductor") || k.includes("adductor")) return el("front", <><Rect x={x + 5.9} y={26} width={2} height={5} rx={1} fill={lit} /><Rect x={x + 16.1} y={26} width={2} height={5} rx={1} fill={lit} /></>);
  if (k.includes("calv") || k.includes("calf") || k.includes("tibialis")) return el("back", <><Rect x={x + 7.2} y={34.5} width={3.8} height={4.5} rx={1.9} fill={lit} /><Rect x={x + 13} y={34.5} width={3.8} height={4.5} rx={1.9} fill={lit} /></>);
  if (k.includes("full body")) return el("front", <Rect x={x + 6.5} y={9.5} width={11} height={15} rx={4} fill={lit} opacity={0.55} />);
  return null;
}

/** width defaults to card size; pass a larger width on the detail screen. */
export function MiniMuscleMap({ regions, width = 40 }: { regions: string[]; width?: number }) {
  const front: React.ReactElement[] = [];
  const back: React.ReactElement[] = [];
  regions.forEach((region, i) => {
    const zf = zoneShapes(region, 0);
    if (zf?.side === "front") front.push(<React.Fragment key={`f${i}`}>{zf.el}</React.Fragment>);
    const zb = zoneShapes(region, 26);
    if (zb?.side === "back") back.push(<React.Fragment key={`b${i}`}>{zb.el}</React.Fragment>);
  });
  return (
    <Svg width={width} height={(width * 44) / 50} viewBox="0 0 50 44">
      <Figure x={0}>{front}</Figure>
      <Figure x={26}>{back}</Figure>
    </Svg>
  );
}
