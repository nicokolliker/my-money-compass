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
  dashed?: boolean;
}

const NODE_W = 140;
const NODE_H = 56;

function FlowNode({ cx, y, label, sub, fill, stroke, textColor = 'hsl(var(--foreground))', dashed }: NodeProps) {
  const x = cx - NODE_W / 2;
  return (
    <g className="cursor-pointer transition-opacity hover:opacity-85">
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={12}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray={dashed ? '6 3' : undefined}
      />
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

  const Y1 = 30;
  const Y2 = 140;
  const Y3 = 250;
  const Y4 = 380;

  const muted = 'hsl(var(--muted-foreground))';

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
          <svg width="100%" viewBox="0 0 820 500" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={muted} />
              </marker>
              <marker id="arrow-dashed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={muted} opacity={0.6} />
              </marker>
            </defs>

            {/* Level 1: Deel */}
            <FlowNode cx={380} y={Y1} label="Deel" sub="USD" fill="hsl(173 58% 92%)" stroke="hsl(173 58% 50%)" />

            {/* Level 2: Wise */}
            <FlowNode cx={380} y={Y2} label="Wise" sub="USD" fill="hsl(243 75% 92%)" stroke="hsl(243 75% 60%)" />

            {/* Level 3 */}
            <FlowNode cx={100} y={Y3} label="Gastos directos" fill="hsl(var(--muted))" stroke="hsl(var(--border))" textColor="hsl(var(--muted-foreground))" />
            <FlowNode cx={280} y={Y3} label="ARQ" sub="USD" fill="hsl(217 91% 92%)" stroke="hsl(217 91% 60%)" />
            <FlowNode cx={460} y={Y3} label="Cash" sub="USD" fill="hsl(38 92% 90%)" stroke="hsl(38 92% 50%)" />
            <FlowNode
              cx={640}
              y={Y3}
              label="Deudas / terceros"
              sub="viejo · Splitwise"
              fill="hsl(var(--muted))"
              stroke="hsl(var(--muted-foreground))"
              textColor="hsl(var(--muted-foreground))"
              dashed
            />

            {/* Level 4 */}
            <FlowNode cx={180} y={Y4} label="Mercado Pago" sub="ARS" fill="hsl(173 58% 92%)" stroke="hsl(173 58% 50%)" />
            <FlowNode cx={360} y={Y4} label="Galicia" sub="ARS" fill="hsl(173 58% 92%)" stroke="hsl(173 58% 50%)" />

            {/* Deel → Wise */}
            <line x1={380} y1={Y1 + NODE_H} x2={380} y2={Y2} stroke={muted} strokeWidth={1.5} markerEnd="url(#arrow)" />

            {/* Wise → Gastos directos */}
            <path d={`M 345 ${Y2 + NODE_H} Q 220 220 100 ${Y3}`} fill="none" stroke={muted} strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* Wise → ARQ */}
            <path d={`M 365 ${Y2 + NODE_H} Q 320 220 280 ${Y3}`} fill="none" stroke={muted} strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* Wise → Cash USD */}
            <path d={`M 395 ${Y2 + NODE_H} Q 430 220 460 ${Y3}`} fill="none" stroke={muted} strokeWidth={1.5} markerEnd="url(#arrow)" />
            <text x={430} y={215} textAnchor="middle" fontSize="11" fill={muted}>vía conocido · efectivo</text>

            {/* ARQ → Mercado Pago */}
            <path d={`M 260 ${Y3 + NODE_H} Q 220 330 180 ${Y4}`} fill="none" stroke={muted} strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* ARQ → Galicia */}
            <path d={`M 300 ${Y3 + NODE_H} Q 330 330 360 ${Y4}`} fill="none" stroke={muted} strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* ARQ → Gastos directos (dashed) */}
            <path
              d={`M 215 ${Y3 + NODE_H / 2} Q 160 ${Y3 + NODE_H / 2 + 10} 130 ${Y3 + NODE_H}`}
              fill="none"
              stroke={muted}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              opacity={0.6}
              markerEnd="url(#arrow-dashed)"
            />
            <text x={150} y={Y3 + NODE_H + 18} textAnchor="middle" fontSize="10" fill={muted} opacity={0.7}>gastos directos</text>

            {/* Cash USD → Deudas/Terceros (repago USD) */}
            <line
              x1={530}
              y1={Y3 + NODE_H / 2}
              x2={570}
              y2={Y3 + NODE_H / 2}
              stroke={muted}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              opacity={0.6}
              markerEnd="url(#arrow-dashed)"
            />
            <text x={550} y={Y3 + NODE_H / 2 - 6} textAnchor="middle" fontSize="10" fill={muted} opacity={0.7}>repago</text>

            {/* Mercado Pago → Deudas/Terceros (repago ARS, dashed long arc) */}
            <path
              d={`M 250 ${Y4 + NODE_H / 2} Q 460 ${Y4 + 20} 640 ${Y3 + NODE_H}`}
              fill="none"
              stroke={muted}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              opacity={0.6}
              markerEnd="url(#arrow-dashed)"
            />
            <text x={460} y={Y4 + 10} textAnchor="middle" fontSize="10" fill={muted} opacity={0.7}>repago ARS</text>
          </svg>
        </CardContent>
      )}
    </Card>
  );
}
