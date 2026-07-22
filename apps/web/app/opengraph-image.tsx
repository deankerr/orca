import { ImageResponse } from 'next/og'

import { Bar, Chip, LogoSq, OG_SIZE, og, ogFonts, Pill, Shot } from '@/lib/og'

export { OG_SIZE as size } from '@/lib/og'

export const alt = 'ORCA - compare every model and endpoint on OpenRouter'
export const contentType = 'image/png'

// Curated fake rows - stable, always-pretty stand-ins for the live grid.
const ROWS = [
  {
    hex: 'd6dbb0',
    name: 128,
    slug: 145,
    prov: 96,
    price: '$1.50',
    chips: [og.cyan, og.purple, og.blue, og.green, og.orange],
    ctx: '1,048,576',
  },
  {
    hex: 'a5353e',
    name: 104,
    slug: 132,
    prov: 76,
    price: '$30.00',
    chips: [og.cyan, og.purple, og.blue],
    ctx: '1,000,000',
  },
  {
    hex: '92521b',
    name: 88,
    slug: 140,
    prov: 84,
    price: '$0.15',
    chips: [og.purple, og.green],
    ctx: '32,768',
  },
  {
    hex: '72cfdf',
    name: 76,
    slug: 120,
    prov: 60,
    price: '$0.08',
    chips: [og.blue, og.green, og.amber],
    ctx: '262,144',
  },
  {
    hex: '0d6ee1',
    name: 116,
    slug: 145,
    prov: 96,
    price: '$0.25',
    chips: [og.cyan, og.purple, og.blue, og.pink],
    ctx: '1,048,576',
  },
  {
    hex: '144906',
    name: 96,
    slug: 128,
    prov: 68,
    price: '$5.00',
    chips: [og.cyan, og.green],
    ctx: '400,000',
  },
  {
    hex: '45623c',
    name: 64,
    slug: 100,
    prov: 52,
    price: '$1.25',
    chips: [og.purple, og.blue, og.orange],
    ctx: '1,000,000',
  },
  {
    hex: 'bb55cf',
    name: 108,
    slug: 138,
    prov: 108,
    price: '$0.05',
    chips: [og.green],
    ctx: '131,072',
  },
  {
    hex: '38ef23',
    name: 92,
    slug: 118,
    prov: 64,
    price: '$1.50',
    chips: [og.cyan, og.purple, og.blue],
    ctx: '262,144',
  },
  {
    hex: '703f11',
    name: 72,
    slug: 108,
    prov: 88,
    price: '$0.40',
    chips: [og.blue, og.orange],
    ctx: '1,048,756',
  },
]

const HEADERS = [
  { label: 'UUID', w: 84 },
  { label: 'MODEL', w: 196 },
  { label: 'PROVIDER', w: 128 },
  { label: '$/MTOK', w: 84 },
  { label: 'FEATURES', w: 128 },
  { label: 'CONTEXT', w: 0 },
]

export default async function Image() {
  return new ImageResponse(
    <Shot
      title="Compare every endpoint"
      tagline="Models, providers, pricing & capabilities across all of OpenRouter."
      active="Endpoints"
    >
      <div style={{ display: 'flex', flexDirection: 'column', padding: '0 24px' }}>
        {/* column headers */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 40,
            borderBottom: `1px solid ${og.line}`,
          }}
        >
          {HEADERS.map((h) => (
            <div
              key={h.label}
              style={{
                ...(h.w > 0 && { width: h.w }),
                fontSize: 11,
                color: og.faint,
                letterSpacing: 1,
              }}
            >
              {h.label}
            </div>
          ))}
        </div>
        {/* data rows */}
        {ROWS.map((row) => (
          <div
            key={row.hex}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 47,
              borderBottom: `1px solid #161616`,
            }}
          >
            <div style={{ display: 'flex', width: 84 }}>
              <Pill>{row.hex}</Pill>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 196 }}>
              <LogoSq />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Bar w={row.name} h={9} c={og.barBright} />
                <Bar w={row.slug} h={7} c="#2c2c2c" />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 128 }}>
              <LogoSq size={18} />
              <Bar w={row.prov} h={8} />
            </div>
            <div style={{ display: 'flex', width: 84, fontSize: 12.5, color: '#bdbdbd' }}>
              {row.price}
            </div>
            <div style={{ display: 'flex', gap: 5, width: 128 }}>
              {row.chips.map((c, i) => (
                <Chip key={i} c={c} />
              ))}
            </div>
            <div style={{ display: 'flex', fontSize: 12.5, color: '#bdbdbd' }}>{row.ctx}</div>
          </div>
        ))}
      </div>
    </Shot>,
    { ...OG_SIZE, fonts: await ogFonts() },
  )
}
