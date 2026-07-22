import { api } from '@orca/backend/convex/_generated/api'
import { fetchQuery } from 'convex/nextjs'
import { ImageResponse } from 'next/og'

import { Bar, Chip, LogoSq, OG_SIZE, og, ogFonts, Shot } from '@/lib/og'

// A route handler rather than the opengraph-image file convention: Turbopack
// panics on special metadata files inside catch-all segments. The page's
// generateMetadata points og:image here.
const STATS = [
  { label: 'CONTEXT', w: 84 },
  { label: 'INPUT $/MTOK', w: 56 },
  { label: 'OUTPUT $/MTOK', w: 64 },
  { label: 'MAX OUT', w: 72 },
]

const PROVIDERS = [
  { name: 96, price: 72, chips: [og.cyan, og.purple, og.blue, og.green] },
  { name: 120, price: 56, chips: [og.cyan, og.purple, og.orange] },
  { name: 80, price: 64, chips: [og.blue, og.green] },
  { name: 108, price: 80, chips: [og.cyan, og.purple, og.blue, og.pink] },
]

export async function GET(_request: Request, ctx: { params: Promise<{ modelId: string[] }> }) {
  const params = await ctx.params
  const modelId = params.modelId.map((part) => decodeURIComponent(part)).join('/')
  const model = await fetchQuery(api.models.getBySlug, { slug: modelId })
  const name = model?.name ?? modelId

  return new ImageResponse(
    <Shot
      title={name}
      tagline="Providers, pricing & capabilities on OpenRouter."
      active="Endpoints"
    >
      <div style={{ display: 'flex', flexDirection: 'column', padding: '22px 24px 0' }}>
        {/* model header: real name and slug, everything else abstract */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <LogoSq size={38} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                fontSize: 19,
                fontWeight: 600,
                maxWidth: 560,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {name}
            </div>
            <div style={{ fontSize: 13, color: og.dim }}>{modelId}</div>
          </div>
        </div>
        {/* stat tiles */}
        <div
          style={{
            display: 'flex',
            marginTop: 22,
            border: `1px solid ${og.line}`,
            borderRadius: 10,
          }}
        >
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                width: 173,
                padding: '16px 18px',
                ...(i > 0 && { borderLeft: `1px solid ${og.line}` }),
              }}
            >
              <div style={{ fontSize: 10.5, color: og.faint, letterSpacing: 1 }}>{stat.label}</div>
              <Bar w={stat.w} h={12} c={og.barBright} />
            </div>
          ))}
        </div>
        {/* provider rows */}
        <div
          style={{
            display: 'flex',
            marginTop: 24,
            fontSize: 11,
            color: og.faint,
            letterSpacing: 1,
          }}
        >
          PROVIDERS
        </div>
        {PROVIDERS.map((row, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 52,
              borderBottom: '1px solid #161616',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 240 }}>
              <LogoSq size={20} />
              <Bar w={row.name} h={9} c={og.barBright} />
            </div>
            <div style={{ display: 'flex', gap: 5, width: 180 }}>
              {row.chips.map((c, j) => (
                <Chip key={j} c={c} />
              ))}
            </div>
            <Bar w={row.price} h={9} />
          </div>
        ))}
      </div>
    </Shot>,
    { ...OG_SIZE, fonts: await ogFonts() },
  )
}
