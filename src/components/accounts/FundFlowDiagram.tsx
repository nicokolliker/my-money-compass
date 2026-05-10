import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChevronDown } from 'lucide-react';

const W = 140;
const H = 56;

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

function Node({ cx, y, label, sub, fill, stroke, textColor = 'hsl(var(--foreground))', dashed }: NodeProps) {
  const x = cx - W / 2;
  return (
    <g className="cursor-pointer transition-opacity hover:opacity-85">
      <rect
        x={x}
        y={y}
        width={W}
        height={H}
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

function Arrow({ x1, y1, x2, y2, label, dashed }: {
  x1: number; y1: number; x2: number; y2: number;
  label?: string; dashed?: boolean;
}) {
  const muted = 'hsl(var(--muted-foreground))';
  const mid = (y1 + y2) / 2;
  const d = x1 === x2
    ? `M ${x1} ${y1} L ${x2} ${y2}`
    : `M ${x1} ${y1} L ${x1} ${mid} L ${x2} ${mid} L ${x2} ${y2}`;
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={muted}
        strokeWidth={1.5}
        strokeDasharray={dashed ? '5 4' : undefined}
        opacity={dashed ? 0.6 : 1}
        markerEnd="url(#arrow)"
      />
      {label && (
        <text x={(x1 + x2) / 2} y={mid - 6} textAnchor="middle" fontSize="10" fill={muted} opacity={0.7}>
          {label}
        </text>
      )}
    </g>
  );
}

export function FundFlowDiagram() {
  const [open, setOpen] = useState(false);
  const muted = 'hsl(var(--muted-foreground))';

  const Y1 = 20;
  const Y2 = 120;
  const Y3 = 230;
  const Y4 = 350;

  // cx positions
  const CX_DEEL     = 340;
  const CX_WISE     = 340;
  const CX_ARQ      = 190;
  const CX_PATRICIA = 490;
  const CX_MP       = 110;
  const CX_GALICIA  = 280;
  const CX_CASH     = 490;

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
        <CardContent className="pt-0 space-y-6">
          {/* ── Diagrama 1: Movimiento de fondos ── */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Movimiento de fondos
            </h4>
            <svg width="100%" viewBox="0 0 700 430" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={muted} />
                </marker>
              </defs>

              {/* Nodos */}
              <Node cx={CX_DEEL}     y={Y1} label="Deel"       sub="USD" fill="hsl(173 58% 92%)" stroke="hsl(173 58% 50%)" />
              <Node cx={CX_WISE}     y={Y2} label="Wise"       sub="USD" fill="hsl(243 75% 92%)" stroke="hsl(243 75% 60%)" />
              <Node cx={CX_ARQ}      y={Y3} label="ARQ"        sub="USD" fill="hsl(217 91% 92%)" stroke="hsl(217 91% 60%)" />
              <Node cx={CX_PATRICIA} y={Y3} label="Patricia"   sub="USD" fill="hsl(38 92% 90%)"  stroke="hsl(38 92% 50%)" />
              <Node cx={CX_MP}       y={Y4} label="Mercado Pago" sub="ARS" fill="hsl(173 58% 92%)" stroke="hsl(173 58% 50%)" />
              <Node cx={CX_GALICIA}  y={Y4} label="Galicia"    sub="ARS" fill="hsl(173 58% 92%)" stroke="hsl(173 58% 50%)" />
              <Node cx={CX_CASH}     y={Y4} label="Cash"       sub="USD" fill="hsl(38 92% 90%)"  stroke="hsl(38 92% 50%)" />

              {/* Flechas ortogonales */}
              {/* Deel → Wise */}
              <Arrow x1={CX_DEEL} y1={Y1 + H} x2={CX_WISE} y2={Y2} />

              {/* Wise → ARQ */}
              <Arrow x1={CX_WISE - W / 2 + 10} y1={Y2 + H} x2={CX_ARQ} y2={Y3} />

              {/* Wise → Patricia */}
              <Arrow x1={CX_WISE + W / 2 - 10} y1={Y2 + H} x2={CX_PATRICIA} y2={Y3} />

              {/* ARQ → Mercado Pago */}
              <Arrow x1={CX_ARQ - W / 2 + 10} y1={Y3 + H} x2={CX_MP} y2={Y4} />

              {/* ARQ → Galicia */}
              <Arrow x1={CX_ARQ + W / 2 - 10} y1={Y3 + H} x2={CX_GALICIA} y2={Y4} />

              {/* Patricia → Cash USD */}
              <Arrow x1={CX_PATRICIA} y1={Y3 + H} x2={CX_CASH} y2={Y4} />

              {/* Cash → label liquidación */}
              <text x={CX_CASH} y={Y4 + H + 18} textAnchor="middle" fontSize="10" fill={muted} opacity={0.7}>
                ↓ liquidación con el viejo
              </text>
            </svg>
          </div>

          {/* ── Diagrama 2: Gastos por cuenta ── */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Gastos por cuenta
            </h4>
            <svg width="100%" viewBox="0 0 700 340" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={muted} />
                </marker>
              </defs>

              {(() => {
                const rows = [
                  {
                    fill: 'hsl(243 75% 92%)', stroke: 'hsl(243 75% 60%)',
                    label: 'Wise USD', sub: 'tarjeta Wise',
                    title: 'Digital · viajes · internacional',
                    detail: 'Netflix · Lovable · vuelos · hoteles',
                  },
                  {
                    fill: 'hsl(217 91% 92%)', stroke: 'hsl(217 91% 60%)',
                    label: 'ARQ', sub: 'tarjeta ARS',
                    title: 'Gastos ARS con tarjeta',
                    detail: 'Apple · PlayStation · Starlink · coaching',
                  },
                  {
                    fill: 'hsl(173 58% 92%)', stroke: 'hsl(173 58% 50%)',
                    label: 'Mercado Pago', sub: 'cuenta ARS',
                    title: 'Servicios · delivery · transferencias',
                    detail: 'Rappi · PedidosYa · Uber',
                  },
                  {
                    fill: 'hsl(173 58% 92%)', stroke: 'hsl(173 58% 50%)',
                    label: 'Galicia ARS', sub: 'débito',
                    title: 'Débito automático · beneficios Galicia',
                    detail: 'Monotributo · conciertos · descuentos',
                  },
                  {
                    fill: 'hsl(38 92% 90%)', stroke: 'hsl(38 92% 50%)',
                    label: 'Cash USD', sub: 'billetes',
                    title: 'Liquidación mensual con el viejo',
                    detail: 'Tarjetas + expensas + obra social + préstamo',
                  },
                ];
                const ROW_H = 60;
                const NODE_X = 10;
                const NODE_W2 = 150;
                const GAP = 16;
                const BOX_X = NODE_X + NODE_W2 + GAP;
                const BOX_W = 680 - BOX_X - 10;
                return rows.map((r, i) => {
                  const y = i * (ROW_H + 8);
                  return (
                    <g key={r.label}>
                      {/* Node */}
                      <rect
                        x={NODE_X}
                        y={y}
                        width={NODE_W2}
                        height={ROW_H}
                        rx={10}
                        fill={r.fill}
                        stroke={r.stroke}
                        strokeWidth={1.5}
                      />
                      <text x={NODE_X + NODE_W2 / 2} y={y + 26} textAnchor="middle" fontSize="13" fontWeight="600" fill="hsl(var(--foreground))">
                        {r.label}
                      </text>
                      {r.sub && (
                        <text x={NODE_X + NODE_W2 / 2} y={y + 42} textAnchor="middle" fontSize="10" fill="hsl(var(--foreground))" opacity={0.7}>
                          {r.sub}
                        </text>
                      )}
                      {/* Description box */}
                      <rect
                        x={BOX_X}
                        y={y}
                        width={BOX_W}
                        height={ROW_H}
                        rx={10}
                        fill="hsl(var(--muted))"
                        stroke="hsl(var(--border))"
                        strokeWidth={1}
                      />
                      <text x={BOX_X + 12} y={y + 24} textAnchor="start" fontSize="12" fontWeight="600" fill="hsl(var(--foreground))">
                        {r.title}
                      </text>
                      <text x={BOX_X + 12} y={y + 42} textAnchor="start" fontSize="11" fill="hsl(var(--muted-foreground))">
                        {r.detail}
                      </text>
                    </g>
                  );
                });
              })()}
            </svg>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
