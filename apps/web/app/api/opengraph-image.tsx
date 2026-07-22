import { ImageResponse } from 'next/og'

import { Bar, OG_SIZE, og, ogFonts, Shot } from '@/lib/og'

export { OG_SIZE as size } from '@/lib/og'

export const alt = 'ORCA API - the curated OpenRouter dataset, as JSON'
export const contentType = 'image/png'

// Stylized JSON response: real keys, abstract values.
const LINES: Array<{
  indent: number
  key?: string
  open?: string
  val?: { w: number; c: string }
}> = [
  { indent: 0, open: '{' },
  { indent: 1, key: '"crawl_id"', val: { w: 128, c: og.green } },
  { indent: 1, key: '"models"', open: '[' },
  { indent: 2, open: '{' },
  { indent: 3, key: '"slug"', val: { w: 152, c: og.green } },
  { indent: 3, key: '"context_length"', val: { w: 64, c: og.amber } },
  { indent: 3, key: '"pricing"', val: { w: 112, c: og.cyan } },
  { indent: 3, key: '"features"', val: { w: 136, c: og.purple } },
  { indent: 3, key: '"endpoints"', open: '[' },
  { indent: 4, key: '"provider"', val: { w: 96, c: og.green } },
  { indent: 4, key: '"quantization"', val: { w: 48, c: og.orange } },
  { indent: 4, key: '"uptime"', val: { w: 56, c: og.amber } },
]

export default async function Image() {
  return new ImageResponse(
    <Shot title="ORCA API" tagline="The curated OpenRouter dataset, as JSON." active="API">
      <div style={{ display: 'flex', flexDirection: 'column', padding: '20px 24px 0' }}>
        {/* request line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: og.green,
              backgroundColor: `${og.green}1a`,
              border: `1px solid ${og.green}44`,
              borderRadius: 5,
              padding: '4px 8px',
            }}
          >
            GET
          </div>
          <div style={{ fontSize: 14, color: '#bdbdbd' }}>/api/preview/v2/models</div>
        </div>
        {/* response body */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 18,
            padding: '18px 20px',
            backgroundColor: '#0c0c0c',
            border: `1px solid ${og.line}`,
            borderRadius: 10,
          }}
        >
          {LINES.map((line, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 31 }}>
              <div style={{ display: 'flex', width: 22, fontSize: 11, color: '#3a3a3a' }}>
                {String(i + 1)}
              </div>
              <div style={{ display: 'flex', width: line.indent * 22 }} />
              {line.key !== undefined && (
                <div style={{ display: 'flex', fontSize: 13.5, color: '#7dd3fc' }}>{line.key}</div>
              )}
              {line.key !== undefined && (
                <div style={{ display: 'flex', fontSize: 13.5, color: og.faint }}>:</div>
              )}
              {line.open !== undefined && (
                <div style={{ display: 'flex', fontSize: 13.5, color: '#9a9a9a' }}>{line.open}</div>
              )}
              {line.val !== undefined && <Bar w={line.val.w} h={9} c={`${line.val.c}88`} />}
            </div>
          ))}
        </div>
      </div>
    </Shot>,
    { ...OG_SIZE, fonts: await ogFonts() },
  )
}
