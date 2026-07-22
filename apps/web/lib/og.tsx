import { readFile } from 'node:fs/promises'
import path from 'node:path'

// Shared scene kit for opengraph-image routes: a 1200x630 "product shot" of
// the app - left-side copy, right-side stylized window mock. Rendered by
// satori, so everything is inline styles and explicit flex.
//
// Never set a style property to undefined (satori crashes with a cryptic
// "reading 'trim'" error) - use a conditional spread instead.

export const OG_SIZE = { width: 1200, height: 630 }

export const og = {
  bg: '#0a0a0a',
  panel: '#101010',
  border: '#262626',
  line: '#1e1e1e',
  text: '#ededed',
  dim: '#8a8a8a',
  faint: '#5a5a5a',
  bar: '#333333',
  barBright: '#c8c8c8',
  cyan: '#22d3ee',
  purple: '#a78bfa',
  blue: '#60a5fa',
  green: '#4ade80',
  orange: '#fb923c',
  pink: '#f472b6',
  amber: '#fbbf24',
  red: '#f87171',
}

// Satori cannot read woff2, so the Geist Mono statics live in assets/fonts.
// The literal readFile(join(process.cwd(), ...)) pattern is what Next's file
// tracing detects, keeping the fonts available in the deployed bundle.
export async function ogFonts() {
  const dir = path.join(process.cwd(), 'assets', 'fonts')
  const [regular, medium, semibold] = await Promise.all([
    readFile(path.join(dir, 'GeistMono-Regular.ttf')),
    readFile(path.join(dir, 'GeistMono-Medium.ttf')),
    readFile(path.join(dir, 'GeistMono-SemiBold.ttf')),
  ])
  return [
    { name: 'Geist Mono', data: regular, weight: 400 as const },
    { name: 'Geist Mono', data: medium, weight: 500 as const },
    { name: 'Geist Mono', data: semibold, weight: 600 as const },
  ]
}

// Scale a headline down as it grows so long model names still fit the column.
export function titleSize(text: string) {
  if (text.length <= 12) {
    return 52
  }
  if (text.length <= 20) {
    return 40
  }
  if (text.length <= 30) {
    return 32
  }
  return 26
}

export function Shot(props: {
  title: string
  tagline: string
  active?: 'Endpoints' | 'Monitor' | 'API'
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: og.bg,
        backgroundImage: 'radial-gradient(circle at 0% 0%, #191919 0%, #0a0a0a 60%)',
        fontFamily: '"Geist Mono"',
        color: og.text,
      }}
    >
      {/* left column: wordmark up top, headline + tagline at the bottom */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 470,
          padding: '56px 0 56px 60px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: 10 }}>ORCA</div>
          <div style={{ fontSize: 13, color: og.dim, marginTop: 10, letterSpacing: 1 }}>
            OpenRouter Capability Analysis
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: titleSize(props.title), fontWeight: 600, lineHeight: 1.15 }}>
            {props.title}
          </div>
          <div style={{ fontSize: 18, color: og.dim, marginTop: 16, lineHeight: 1.5, width: 400 }}>
            {props.tagline}
          </div>
          <div style={{ fontSize: 14, color: og.faint, marginTop: 28 }}>orca.orb.town</div>
        </div>
      </div>
      {/* app window, bleeding off the right and bottom edges */}
      <div
        style={{
          position: 'absolute',
          left: 520,
          top: 64,
          width: 740,
          height: 610,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: og.panel,
          border: `1px solid ${og.border}`,
          borderRadius: 16,
          boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 26,
            height: 54,
            padding: '0 24px',
            borderBottom: `1px solid ${og.line}`,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: 2 }}>ORCA</div>
          {(['Endpoints', 'Monitor', 'API'] as const).map((item) => (
            <div
              key={item}
              style={{ fontSize: 13, color: item === props.active ? og.text : '#6b6b6b' }}
            >
              {item}
            </div>
          ))}
        </div>
        {props.children}
      </div>
    </div>
  )
}

// Abstract stand-in for a run of text.
export function Bar(props: { w: number; h?: number; c?: string; r?: number }) {
  return (
    <div
      style={{
        width: props.w,
        height: props.h ?? 10,
        backgroundColor: props.c ?? og.bar,
        borderRadius: props.r ?? 3,
      }}
    />
  )
}

// Colored capability chip, like the feature icons in the endpoints grid.
export function Chip(props: { c: string }) {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${props.c}22`,
        border: `1px solid ${props.c}55`,
        borderRadius: 4,
      }}
    >
      <div style={{ width: 6, height: 6, backgroundColor: props.c, borderRadius: 2 }} />
    </div>
  )
}

// Bordered mono pill, like the uuid column.
export function Pill(props: { children: string; c?: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: props.c ?? '#7a7a7a',
        backgroundColor: '#161616',
        border: '1px solid #2a2a2a',
        borderRadius: 5,
        padding: '3px 7px',
      }}
    >
      {props.children}
    </div>
  )
}

// Placeholder entity logo square.
export function LogoSq(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1d1d1d',
        border: '1px solid #2e2e2e',
        borderRadius: Math.round(size / 3.5),
      }}
    >
      <div
        style={{
          width: Math.round(size / 2.6),
          height: Math.round(size / 2.6),
          backgroundColor: '#3d3d3d',
          borderRadius: 2,
        }}
      />
    </div>
  )
}
