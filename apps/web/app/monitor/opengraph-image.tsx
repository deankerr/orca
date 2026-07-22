import { ImageResponse } from 'next/og'

import { Bar, LogoSq, OG_SIZE, og, ogFonts, Pill, Shot } from '@/lib/og'

export { OG_SIZE as size } from '@/lib/og'

export const alt = 'ORCA Monitor - change tracking for OpenRouter'
export const contentType = 'image/png'

type Row =
  | { kind: 'added' | 'removed'; name: number; slug: number; time: string }
  | { kind: 'changed'; name: number; slug: number; time: string; before: number; after: number }

const ROWS: Row[] = [
  { kind: 'added', name: 112, slug: 148, time: '03:10' },
  { kind: 'changed', name: 88, slug: 120, time: '03:10', before: 56, after: 72 },
  { kind: 'changed', name: 128, slug: 156, time: '02:40', before: 64, after: 48 },
  { kind: 'removed', name: 96, slug: 124, time: '02:40' },
  { kind: 'added', name: 76, slug: 104, time: '02:10' },
  { kind: 'changed', name: 104, slug: 136, time: '01:40', before: 48, after: 80 },
  { kind: 'added', name: 120, slug: 144, time: '01:10' },
  { kind: 'changed', name: 84, slug: 112, time: '00:40', before: 72, after: 56 },
]

const KIND = {
  added: { label: '+ added', c: og.green },
  changed: { label: '~ changed', c: og.amber },
  removed: { label: '- removed', c: og.red },
}

export default async function Image() {
  return new ImageResponse(
    <Shot
      title="Monitor"
      tagline="Every change to every model, endpoint & provider - as it happens."
      active="Monitor"
    >
      <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 24px 0' }}>
        {ROWS.map((row, i) => {
          const kind = KIND[row.kind]
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 56,
                borderBottom: '1px solid #161616',
              }}
            >
              <div style={{ display: 'flex', width: 118 }}>
                <Pill c={kind.c}>{kind.label}</Pill>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 230 }}>
                <LogoSq />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Bar w={row.name} h={9} c={og.barBright} />
                  <Bar w={row.slug} h={7} c="#2c2c2c" />
                </div>
              </div>
              {/* field diff: old value struck out, new value in green */}
              {row.kind === 'changed' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Bar w={row.before} h={9} c={`${og.red}66`} />
                  <div style={{ fontSize: 13, color: og.faint }}>-&gt;</div>
                  <Bar w={row.after} h={9} c={`${og.green}99`} />
                </div>
              ) : (
                <Bar w={row.kind === 'added' ? 132 : 96} h={9} c="#2c2c2c" />
              )}
              <div
                style={{
                  display: 'flex',
                  marginLeft: 'auto',
                  marginRight: 40,
                  fontSize: 12,
                  color: og.faint,
                }}
              >
                {row.time}
              </div>
            </div>
          )
        })}
      </div>
    </Shot>,
    { ...OG_SIZE, fonts: await ogFonts() },
  )
}
