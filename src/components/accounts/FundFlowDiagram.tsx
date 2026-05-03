import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChevronDown } from 'lucide-react';

interface NodeProps {
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
  sub?: string;
  fill: string;
  stroke: string;
  textColor?: string;
}

function FlowNode({ x, y, w = 130, h = 54, label, sub, fill, stroke, textColor = 'hsl(var(--foreground))' }: NodeProps) {
  return (
    <g className="cursor-pointer transition-opacity hover:opacity-85">
      <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + (sub ? 22 : 30)} textAnchor="middle" fontSize="13" fontWeight="600" fill={textColor}>
        {label}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + 38} textAnchor="middle" fontSize="10" fill={textColor} opacity={0.7}>
          {sub}
        </text>
      )}
    </g>
  );
}

export function FundFlowDiagram() {
  const [open, setOpen] = useState(false);

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
          <svg width="100%" viewBox="0 0 680 438" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
              </marker>
            </defs>

            {/* Top row: source */}
            <FlowNode x={275} y={20} label="Deel" sub="USD" fill="hsl(173 58% 92%)" stroke="hsl(173 58% 50%)" />

            {/* Second row: Wise + direct expenses */}
            <FlowNode x={275} y={120} label="Wise" sub="USD" fill="hsl(243 75% 92%)" stroke="hsl(243 75% 60%)" />
            <FlowNode x={490} y={120} label="Gastos directos" fill="hsl(var(--muted))" stroke="hsl(var(--border))" textColor="hsl(var(--muted-foreground))" />

            {/* Third row: ARQ + Cash USD */}
            <FlowNode x={60} y={220} label="ARQ" sub="USD" fill="hsl(217 91% 92%)" stroke="hsl(217 91% 60%)" />
            <FlowNode x={490} y={220} label="Cash" sub="USD" fill="hsl(38 92% 90%)" stroke="hsl(38 92% 50%)" />

            {/* Fourth row: ARS accounts */}
            <FlowNode x={60} y={320} label="Mercado Pago" sub="ARS" fill="hsl(173 58% 92%)" stroke="hsl(173 58% 50%)" />
            <FlowNode x={275} y={320} label="Galicia" sub="ARS" fill="hsl(173 58% 92%)" stroke="hsl(173 58% 50%)" />
            <FlowNode x={490} y={320} label="Tarjeta viejo" sub="ARS" fill="hsl(14 90% 90%)" stroke="hsl(14 90% 55%)" />

            {/* Arrows */}
            {/* Deel -> Wise */}
            <line x1={340} y1={74} x2={340} y2={118} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* Deel -> Gastos directos */}
            <path d="M 405 47 Q 470 47 555 118" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* Wise -> ARQ */}
            <path d="M 275 147 Q 180 147 125 218" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* Wise -> Cash USD */}
            <path d="M 405 147 Q 500 147 555 218" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* ARQ -> Mercado Pago */}
            <line x1={125} y1={274} x2={125} y2={318} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* ARQ -> Galicia */}
            <path d="M 190 247 Q 280 247 340 318" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* Cash -> Tarjeta viejo */}
            <line x1={555} y1={274} x2={555} y2={318} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
            {/* Galicia -> Tarjeta viejo */}
            <path d="M 405 347 Q 470 347 490 347" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} markerEnd="url(#arrow)" />
          </svg>
        </CardContent>
      )}
    </Card>
  );
}
