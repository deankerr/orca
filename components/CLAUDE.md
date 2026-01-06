# Frontend Development Guide

## Example

```tsx
import { cn } from '@/lib/utils'

export function LabeledBox({
  label,
  className,
  children,
  ...props
}: { label?: string } & React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('space-y-2 rounded-sm border bg-card p-2 text-card-foreground', className)}
      {...props}
    >
      {label && <div className="font-mono text-sm text-muted-foreground uppercase">{label}</div>}
      {children}
    </div>
  )
}
```

## Target Audience

ORCA serves highly technical users who work with OpenRouter and LLMs professionally:

- Deep understanding of AI model concepts (variables, parameters, context lengths, quantization)
- Interested in comprehensive pricing details (cache reads, reasoning tokens, structured outputs)
- Value technical precision over "friendly" explanations
- Will copy/paste values (model slugs, API parameters) directly into their code

## Design Philosophy

- Stylish technical aesthetic.
- Directly inspired by Vercel, shadcn.com, and Radix Themes.
- Dark, monochromatic, functional, and practical UI.
- Dense, rich and data heavy, tabular elements. Minimal 'marketing' style elements.
- Brand logos and badges add splashes of color.
- Avoid excessive padding, border radius (most elements use `rounded-sm`), and shadows.
- Heavy use of monospace font used for data display and aesthetic flourish.
- Primarily intended for desktop usage. Mobile optimization is a low priority.

## Component Guidelines

### Default Styling

```css
/* globals.css */
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
```

- Intelligently apply classes like `font-mono` at a component root level, rather than specifying on all sub-elements.

### Structure

- Use a shadcn/ui-inspired structure for components, a single file which exports composable component parts, allowing for dynamic customization.
- Use named exports only. NEVER use default exports.
- The app is wrapped with a TooltipProvider.

### Presentation Component Design

When creating reusable presentation components (like DataList, Card, etc.), follow shadcn's philosophy:

- **Use semantic HTML** - `<dl>/<dt>/<dd>`, `<article>`, `<section>`, etc.
- **Composable primitives** - Break into small, focused components instead of prop-heavy monoliths
- **No conditional logic** - Pure presentation, no business logic or prop-based rendering
- **Full flexibility** - Accept `className` and `...props` on every component for overrides

Example: DataList exports `DataList`, `DataListItem`, `DataListLabel`, `DataListValue` as separate primitives, not one component with label/value props.

### Component File Structure/Locations

- Route components (layouts, pages): `app/[relevant directory]`
- Major single file/unique components: `components/`
- Major multi-file components: `components/<component-name>`
- Shared/custom UI components: `components/shared`
- shadcn/ui components only: `components/ui`
- Mixed/unclear: `components/`
- No barrel files.

## React 19 / Next.js 15

- ONLY when a page is reading search params with nuqs, e.g. `useQueryState`, the client component page must be wrapped in `<Suspense>` in the server-side `page.tsx`. No fallback is required, as there is no actual wait for any external data.

# Web Development Framework Updates for 2025

## React 19 - Major Changes

### forwardRef No Longer Required

Function components can now accept `ref` as a regular prop, eliminating `forwardRef` boilerplate in most cases.

**Note: `forwardRef` is still supported for backwards compatibility. Leave in place for existing components.**

```tsx
// NEW (React 19)
function MyInput({
  placeholder,
  ref,
}: {
  placeholder?: string
  ref?: React.Ref<HTMLInputElement>
}) {
  return <input placeholder={placeholder} ref={ref} />
}
```

### New `use` Hook

The `use` hook reads resources like Promises or context values directly in render, supporting conditional usage.

```tsx
import { use } from 'react'

// Reading Promises with Suspense
function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise) // Suspends until resolved
  return comments.map((comment) => <p key={comment.id}>{comment.text}</p>)
}

// Conditional context usage (impossible with useContext)
function Heading({ children }: { children: React.ReactNode }) {
  if (children == null) return null

  const theme = use(ThemeContext) // Can be called after early return
  return <h1 style={{ color: theme.color }}>{children}</h1>
}
```

### Simplified Context Provider Syntax

Context objects can now be rendered directly as providers, eliminating the `.Provider` wrapper.

```tsx
import { createContext, use } from 'react'

const ThemeContext = createContext('light')

// NEW (React 19) - Context rendered directly
function App({ children }: { children: React.ReactNode }) {
  return <ThemeContext value="dark">{children}</ThemeContext>
}

// Consuming context directly with use hook
function ThemedButton() {
  const theme = use(ThemeContext)
  return <button className={`btn-${theme}`}>Click me</button>
}
```

## Next.js 16 - Breaking Changes

### Async Request APIs (Breaking Change)

All request-specific APIs now return Promises and must be awaited.

```typescript
// NEW (Next.js 15)
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug } = await params
  const { query } = await searchParams
  return <h1>{slug}</h1>
}
```

### Caching Defaults Inverted (Breaking Change)

Requests are now uncached by default, opposite of Next.js 14.

```typescript
// Next.js 15 - Uncached by default
const data = await fetch('https://api.example.com/data')

// Next.js 15 - Opt into caching
const data = await fetch('https://api.example.com/data', {
  cache: 'force-cache',
})

// Route-level caching configuration
export const fetchCache = 'default-cache'
```

### Enhanced TypeScript Support

```typescript
// Auto-generated type helpers
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  return <h1>Blog post: {slug}</h1>
}
```

### Document Metadata Support

HTML metadata elements can now be rendered directly in components without external libraries.

```tsx
function BlogPost({ post }) {
  return (
    <article>
      <title>{post.title}</title>
      <meta name="author" content={post.author} />
      <meta name="keywords" content={post.keywords} />
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  )
}
```

## Tailwind CSS 4 - CSS-First Configuration

### CSS-Based Configuration System

Replaces JavaScript config files with CSS-first approach using `@theme` directive. `tailwind.config.js` is no longer required.

```css
/* NEW (v4) */
/* globals.css */
@import 'tailwindcss';

@theme {
  --color-custom-blue: #1e40af;
  --color-brand-primary: #3b82f6;
  --font-display: Inter, sans-serif;
  --spacing-18: 4.5rem;
}
```

### Utility Class Renames (Breaking Changes)

Several utility classes renamed for consistency:

| v3 Utility     | v4 Utility       |
| -------------- | ---------------- |
| `shadow-sm`    | `shadow-xs`      |
| `shadow`       | `shadow-sm`      |
| `blur-sm`      | `blur-xs`        |
| `blur`         | `blur-sm`        |
| `rounded-sm`   | `rounded-xs`     |
| `rounded`      | `rounded-sm`     |
| `outline-none` | `outline-hidden` |

### New Modern CSS Features

```html
<!-- Container Queries -->
<div class="@container">
  <div class="grid grid-cols-1 @sm:grid-cols-3 @lg:grid-cols-4">
    <!-- Responsive based on container, not viewport -->
  </div>
</div>

<!-- 3D Transforms -->
<div class="perspective-distant">
  <article class="rotate-x-51 rotate-z-43 transform-3d">
    <!-- 3D transformed content -->
  </article>
</div>

<!-- Enhanced Gradients -->
<div class="bg-linear-45 from-indigo-500 to-pink-500"></div>
<div class="bg-radial-[at_25%_25%] from-white to-zinc-900"></div>
```

## ECMAScript 2024 - Finalized Features

**Note: Safe and recommended for backend use, discouraged for frontend.**

- Object.groupBy() and Map.groupBy()
- Promise.withResolvers()

### RegExp /v Flag (unicodeSets)

Enhanced regex flag supporting Unicode string properties and set operations.

```javascript
// Multi-codepoint emoji support
const emojiRegex = /^\p{RGI_Emoji}$/v
emojiRegex.test('🧑‍💻') // true

// Set operations in character classes
const excludeDigits = /^[\p{Letter}--[a-f]]$/v
excludeDigits.test('g') // true
excludeDigits.test('a') // false
```

### String Well-Formed Unicode Methods

Checks and ensures strings contain only well-formed Unicode sequences.

```javascript
'hello'.isWellFormed() // true
'\uD800test'.isWellFormed() // false (lone surrogate)
'\uD800test'.toWellFormed() // "�test" (replaces with replacement char)
```

## CSS Baseline Newly Available (2023-2025)

### CSS :has() Selector

Parent selector enabling styling based on children.

```css
/* Style article containing h2 */
article:has(h2) {
  border-left: 4px solid blue;
}

/* Style form when checkbox is checked */
.form:has(input[type='checkbox']:checked) {
  background: lightgreen;
}

/* Complex conditions */
.card:has(.premium):has(.available) {
  border: 2px solid gold;
}
```

### CSS Subgrid

Nested grids inherit track sizing from parent grid.

```css
.main-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.card {
  display: grid;
  grid-template-columns: subgrid; /* Inherits parent columns */
  grid-column: 1 / -1;
}
```

### text-wrap: balance

Automatically balances line lengths in multi-line text.

```css
h1,
h2,
h3 {
  text-wrap: balance;
  max-inline-size: 50ch;
}
```

### transition-behavior: allow-discrete

Enables smooth transitions for discrete properties like display.

```css
.modal {
  display: none;
  opacity: 0;
  transition:
    opacity 0.3s ease,
    display 0.3s ease;
  transition-behavior: allow-discrete;
}

.modal.open {
  display: block;
  opacity: 1;
}
```
