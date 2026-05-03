import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChevronDown } from 'lucide-react';

interface NodeProps {
  cx: number;
  y: number;
  label: string;
  sub?: string;
  fill: string;
  stroke: string;
  textColor?: string;
}

const NODE_W = 140;
const NODE_H = 56;

function FlowNode({ cx, y, label, sub, fill, stroke, textColor = 'hsl(var(--foreground))' }: NodeProps) {
  const x = cx - NODE_W / 2;
  return (
    <g className="cursor-pointer transition-opacity hover:opacity-85">
      <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={12} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={cx} y={y + (sub ? 23 : 32)} textAnchor="middle" fontSize="13" fontWeight="600" fill={textColor}>
        {label}
      </text>
      {sub && (
        <text x={cx} y={y + 40} textAnchor="middle" fontSize="10" fill={textColor} opacity={0.7}>
          {sub}
        </text>
      )}
    </g>
  );
}

export function FundFlowDiagram() {
  const [open, setOpen] = useState(false);

  // Y rows
  const Y1 = 30;
  const Y2 = 140;
  const Y3 = 250;
  const Y4 = 380;

  return (
    <Card className="rounded-2xl">
      <CardHeader
        className="cursor-pointer select-none flex flex-row items-center justify-between py-4"
        onClick={() => setOpen(o => !o)}
      >
        <h3 className="text-sm font-semibold text-foreground">Flujo de fondos</h3>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          <svg width="100%" viewBox="0 0 760 480" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
              </marker>
            </defs>

            {/* Level 1: Deel */}
            <FlowNode cx={340} y={Y1} label="Deel" sub="USD" fill="hsl(173 58% 92%)" stroke="hsl(173 58% 50%)" />

            {/* Level 2: Wise */}
            <FlowNode cx={340} y={Y2} label="Wise" sub="USD" fill="hsl(243 75% 92%)" stroke="hsl(243 75% 60%)" />

            {/* Level 3 */}
            <FlowNode cx={130} y={Y3} label="Gastos directos" fill="hsl(var(--muted))" stroke="hsl(var(--border))" textColor="hsl(var(--muted-foreground))" />
            <FlowNode cx={340} y={Y3} label="ARQ" sub="USD" fill="hsl(217 91% 92%)" stroke="hsl(217 91% 60%)" />
            <FlowNode cx={550} y={Y3} label="Cash" sub="USD" fill="hsl(38 92% 90%)" stroke="hsl(38 92% 50%)" />

            {/* Level 4 */}
            <FlowNode cx={220} y={Y4} label="Mercado Pago" sub="ARS" fill="hsl(173 58% 92%)" stroke="hsl(173 58% 50%)" />
            <FlowNode cx={400} y={Y4} label="Galicia" sub="ARS" fill="hsl(173 58% 92%)" stroke="hsl(173 58% 50%)" />
            <FlowNode cx={550} y={Y4} label="Tarjeta viejo" sub="ARS" fill="hsl(14 90% 90%)" stroke="hsl(14 90% 55%)" />

            {/* Arrows */}
            {/* Deel → Wise */}
            <line x1={340} y1={Y1 + NODE_H} x2={340} y2={Y2} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />

            {/* Wise → fan-out (3 exit points on bottom edge: 305, 340, 375) */}
            {/* Wise → Gastos directos */}
            <path d={`M 305 ${Y2 + NODE_H} Q 220 220 130 ${Y3}`} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* Wise → ARQ */}
            <line x1={340} y1={Y2 + NODE_H} x2={340} y2={Y3} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* Wise → Cash USD */}
            <path d={`M 375 ${Y2 + NODE_H} Q 460 220 550 ${Y3}`} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
            <text x={460} y={215} textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))">vía conocido · efectivo</text>

            {/* ARQ → Mercado Pago (left exit) */}
            <path d={`M 320 ${Y3 + NODE_H} Q 270 330 220 ${Y4}`} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* ARQ → Galicia (right exit) */}
            <path d={`M 360 ${Y3 + NODE_H} Q 380 330 400 ${Y4}`} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />

            {/* Cash USD → Tarjeta viejo */}
            <line x1={550} y1={Y3 + NODE_H} x2={550} y2={Y4} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
          </svg>
        </CardContent>
      )}
    </Card>
  );
}
