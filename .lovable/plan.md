## Objetivo

Llevar el look de la app al lenguaje **Flowit "Limpio Sereno"**: superficies blancas con border, fondo `#FAFBFF`, gradiente de marca indigo→violet (`#5E6CF6 → #8B5CF6`), tipografía Outfit/Figtree, sombras violet-tinted y headers de módulo con banner pastel `rounded-3xl`.

El alcance es **puramente visual** (tokens + componentes de chrome). No toco lógica, datos, hooks ni queries.

---

## 1. Tokens y utilidades globales (`src/index.css` + `tailwind.config.ts`)

- Reescribir `:root` y `.dark` con la paleta Flowit:
  - `--primary: 232 92% 67%` (≈ `#5E6CF6`), `--primary-glow: 258 90% 70%` (≈ `#8B5CF6`)
  - `--accent: 258 90% 76%` (violet-400)
  - `--background: 228 100% 99%` (≈ `#FAFBFF`)
  - `--border: 0 0% 92%` (≈ `#EBEBEB`)
  - `--ring` = `--primary`
- `--radius: 0.75rem` (en lugar de 0.875rem). La escala de cards pasa a `rounded-2xl` y banners a `rounded-3xl`.
- Quitar el `--gradient-app` actual (azul/celeste) y dejar el body con `bg-background` plano. Los orbes animados del AppLayout pasan a tonos indigo/violet con menor opacidad (15%).
- Sombras: reemplazar las sombras grises del `.card-elevated`/`.card-solid` por **violet-tinted**:
  - resting: solo `border-border` (sin sombra)
  - hover: `0 8px 24px -12px rgba(94,108,246,0.22)`
- Añadir utilidades reutilizables (`@layer components`):
  - `.flowit-gradient` — `background-image: linear-gradient(135deg,#5E6CF6 0%,#7C6CF6 50%,#8B5CF6 100%)`
  - `.flowit-gradient-text` — el mismo gradiente clipeado a texto
  - `.flowit-tab-active` — gradiente + `color:#fff` + sombra `0 4px 12px -6px rgba(94,108,246,0.55)`
  - `.flowit-header-bg` — fondo pastel radial (white → `#F5F3FF` → `#EDE9FE`)
  - `.flowit-card-hover` — `transition` + `-translate-y-0.5` + sombra violet en hover
- Tipografía: cargar **Outfit** (400–800) y **Figtree** (400–700) desde Google Fonts en `index.html`. En `tailwind.config.ts`:
  - `fontFamily.sans = ['Figtree', ...]`
  - `fontFamily.display = ['Outfit', ...]`
- Mantener `.tabular-nums`, `safe-area-bottom`, los keyframes `drift`, `count-in` y la lógica de `privacy-mode`.

## 2. AppLayout (`src/components/layout/AppLayout.tsx`)

- Sidebar desktop: cambiar el shell `glass-panel` por `bg-white border border-border rounded-2xl` (más limpio, sin blur). Sombra resting suave violet.
- Header del sidebar: logo + título en `font-display`, sin gradiente clip — usar `text-foreground`.
- Items activos del nav: reemplazar el `bg-gradient-to-r from-primary to-primary-glow` por `.flowit-tab-active` (gradiente Flowit canónico). Items inactivos: `text-muted-foreground hover:text-foreground hover:bg-muted`.
- Botón **Quick Add**: usar `.flowit-gradient` + `text-white` + sombra violet hover (`hover:-translate-y-0.5`).
- Orbes animados del fondo: bajar opacidad a 15–20%, colores `--primary` y `--primary-glow` solamente (sin el celeste extra).
- Bottom nav móvil: `bg-white border-t border-border` (sin glass blur). FAB `+` con `.flowit-gradient`.
- Sheet "Más opciones": items activos también con `.flowit-tab-active`.

## 3. Componentes de chrome compartidos

- **`src/components/ui/card.tsx`**: el variant `elevated` por defecto deja de usar `card-elevated` (con backdrop-blur) y pasa a un patrón plano Flowit: `bg-white border border-border rounded-2xl flowit-card-hover`. Los variants `solid` y `glass` quedan igual para no romper usos puntuales.
- **`src/components/ui/button.tsx`**: variant `default` repinta con `.flowit-gradient` + `text-white` + sombra violet, manteniendo `active:scale-[0.98]`. Variants `outline`, `ghost`, `secondary` quedan iguales (ya usan tokens).
- **`src/components/ui/tabs.tsx`**: el `TabsTrigger` activo aplica `.flowit-tab-active` en lugar de `bg-background shadow`. El contenedor `TabsList` queda con `border border-border bg-white p-1 rounded-lg`.
- **`src/components/ui/badge.tsx`**: variant `default` con `bg-violet-50 text-violet-700 border-violet-100` (tinte violeta canónico). `secondary`, `destructive`, `outline` quedan igual.

## 4. Page headers (`Dashboard`, `Accounts`, `Transactions`, `Analytics`, `Budget`, `Calendar`, `Planning`, `Debts`, `Monotributo`, `RecurringExpenses`, `Settings`, `Rules`, `Integrations`)

Crear un componente nuevo **`src/components/layout/PageHeader.tsx`** que replica el patrón `OrgPageHeader` del skill:

```tsx
<header className="mb-6">
  <div className="flowit-header-bg relative overflow-hidden rounded-3xl border border-border/80
                   shadow-[0_8px_28px_-18px_rgba(94,108,246,0.35)]">
    <div className="relative px-6 lg:px-8 py-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.14em] text-primary/80 font-semibold flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" /> {eyebrow}
        </div>
        <h1 className="font-display text-3xl lg:text-[34px] font-semibold tracking-tight mt-1.5">{title}</h1>
        {description && <p className="text-[15px] text-muted-foreground mt-1.5 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  </div>
  {children && <div className="mt-4">{children}</div>}
</header>
```

Reemplazar el `<h1>...<p>` actual al tope de cada página por `<PageHeader eyebrow=… title=… description=… actions=… />`, conservando los toolbars/tabs que cada página ya monta (pasándolos como `actions` o `children`).

## 5. Limpieza menor

- Quitar el gradient-clip azul del título "My Money Compass" (queda en `text-foreground font-display`).
- En `RecurringTracking.tsx` y `Calendar.tsx`: los botones "Registrar pago" actuales (link icon + texto primary) ya quedan bien con los tokens nuevos, sin cambios.
- `index.html`: agregar `<link rel="preconnect">` + `<link>` a Google Fonts (Outfit + Figtree). Mantener el viewport y meta SEO actual.

## Out of scope

- No cambio iconografía (logo `compass.svg` se conserva — se ve bien sobre el banner pastel).
- No toco mocks ni rutas TanStack (el skill las menciona, pero acá usamos `react-router-dom` y queda igual).
- No agrego AppTopbar / Spotlight / FeedbackButton del skill (son patrones de Flowit ERP, fuera del scope de esta app personal).
- No toco lógica de negocio, hooks, ni Supabase.

---

## Riesgos / notas

- Cambiar `--radius` global de 14px → 12px afecta a todos los `rounded-md/lg/sm` derivados. Visualmente queda más Flowit, pero conviene revisar 1-2 modales después.
- Si el cambio de fuente carga lento al inicio, el `font-display: swap` de Google Fonts evita FOIT.
- El variant `default` del Button ahora siempre lleva gradiente: si en alguna página había un botón primario que esperaba color sólido, conviene confirmarlo al previsualizar.
