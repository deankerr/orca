import { api } from '@orca/backend/convex/_generated/api'
import { fetchQuery } from 'convex/nextjs'
import { ImageResponse } from 'next/og'

import { Bar, OG_SIZE, og, ogFonts, Shot } from '@/lib/og'

// A route handler rather than the opengraph-image file convention: Turbopack
// panics on special metadata files inside catch-all segments. The page's
// generateMetadata points og:image here.
//
// Curated series - real charts are often chaotic (or a single flat line), so
// the shot draws idealized ones instead.
const CHART = { w: 692, h: 268 }
const SERIES = [
  { c: og.cyan, y: [150, 146, 152, 140, 138, 144, 130, 134, 126, 128, 120, 124] },
  { c: og.pink, y: [190, 196, 180, 188, 204, 198, 210, 200, 214, 208, 220, 216] },
  { c: og.amber, y: [90, 84, 110, 70, 96, 60, 104, 78, 66, 88, 72, 80] },
]

function points(ys: number[]) {
  const step = CHART.w / (ys.length - 1)
  return ys.map((y, i) => [Math.round(i * step), y] as const)
}

export async function GET(_request: Request, ctx: { params: Promise<{ modelId: string[] }> }) {
  const params = await ctx.params
  const modelId = params.modelId.map((part) => decodeURIComponent(part)).join('/')
  const model = await fetchQuery(api.models.getBySlug, { slug: modelId })
  const name = model?.name ?? modelId

  return new ImageResponse(
    <Shot title={name} tagline="Provider pricing history on OpenRouter." active="Endpoints">
      <div style={{ display: 'flex', flexDirection: 'column', padding: '18px 24px 0' }}>
        {/* card header with range switcher */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: og.dim }}>Model Pricing History</div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', marginRight: 76 }}>
            {['All', '1y', '90d', '30d'].map((range) => (
              <div
                key={range}
                style={{
                  fontSize: 11.5,
                  color: range === '30d' ? og.text : og.faint,
                  border: `1px solid ${range === '30d' ? '#3a3a3a' : og.line}`,
                  backgroundColor: range === '30d' ? '#1c1c1c' : 'transparent',
                  borderRadius: 6,
                  padding: '4px 9px',
                }}
              >
                {range}
              </div>
            ))}
          </div>
        </div>
        {/* the chart itself */}
        <svg
          width={CHART.w}
          height={CHART.h}
          viewBox={`0 0 ${CHART.w} ${CHART.h}`}
          style={{ marginTop: 18 }}
        >
          {[36, 104, 172, 240].map((y) => (
            <line key={y} x1={0} y1={y} x2={CHART.w} y2={y} stroke="#1b1b1b" strokeWidth={1} />
          ))}
          {SERIES.map((series) => {
            const pts = points(series.y)
            return (
              <g key={series.c}>
                <polyline
                  points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="none"
                  stroke={series.c}
                  strokeWidth={2}
                />
                {pts.map(([x, y]) => (
                  <circle key={x} cx={x} cy={y} r={3.5} fill={series.c} />
                ))}
              </g>
            )
          })}
        </svg>
        {/* provider legend */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 16,
            paddingTop: 14,
            borderTop: `1px solid ${og.line}`,
          }}
        >
          {SERIES.map((series) => (
            <div
              key={series.c}
              style={{ display: 'flex', alignItems: 'center', gap: 12, height: 36 }}
            >
              <div style={{ width: 9, height: 9, backgroundColor: series.c, borderRadius: 99 }} />
              <Bar w={104} h={9} c={og.barBright} />
              <div style={{ display: 'flex', marginLeft: 'auto', marginRight: 8 }}>
                <Bar w={48} h={9} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shot>,
    { ...OG_SIZE, fonts: await ogFonts() },
  )
}
