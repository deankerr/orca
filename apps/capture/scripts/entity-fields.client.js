// * The page half of `bun run fields` — it renders the analysis embedded in the report by
// * entity-fields.ts. Runs in the browser, from a file:// URL, with no imports: `DATA` and the
// * `esc` / `num` / `pct` / `bar` / `el` helpers come from the prelude in report.ts.
// *
// * Field details are built on first expand. There are ~900 fields carrying a frequency table
// * each, and rendering all of them up front is a second of layout for tables nobody opened.

// * what each category means, in the words the report argues in. Shown under the filter chips.
const MEANING = {
  array: 'lists — how often empty, how long, and what the elements are',
  boolean: 'true / false / null — watch for the ones that are never false',
  enum: 'a closed value set, small enough to enumerate in full',
  invariant: 'one value everywhere the key appears — nothing to model',
  number: 'an open numeric range',
  object: 'containers, described by which key sets co-occur',
  opaque: 'ids and free text — shape is all that is reportable',
}

const SORTS = [
  ['path', 'path'],
  ['distinct', 'most distinct values'],
  ['absent', 'most absent'],
  ['nulls', 'most null'],
  ['present', 'most present'],
]

const state = { categories: new Set(), entity: DATA.entities[0].name, query: '', sort: 'path' }

const root = document.querySelector('#report')

const entityOf = (name) => DATA.entities.find((entity) => entity.name === name)

// * a frequency table with a share bar per row: the shape of the distribution, not just its head
const frequencyTable = (heading, table, total) => `
  <table>
    <thead><tr><th>${esc(heading)}</th><th class="n">records</th><th class="share">share</th></tr></thead>
    <tbody>
      ${table.top
        .map(
          (row) => `<tr>
            <td class="mono value">${esc(row.value === '' ? '""' : row.value)}</td>
            <td class="n">${num(row.count)}</td>
            <td class="share">${bar([['set', row.count, total]])}<span class="faint">${pct(row.count, total)}</span></td>
          </tr>`,
        )
        .join('')}
      ${table.more > 0 ? `<tr><td colspan="3" class="faint">+ ${num(table.more)} more distinct values, not listed</td></tr>` : ''}
    </tbody>
  </table>`

const stat = (name, value) =>
  `<div class="stat"><span>${esc(name)}</span><b>${esc(value)}</b></div>`

// * one block per kind of thing a field can be. Each returns '' when it has nothing to say, so the
// * detail is a flat join and a field's shape decides what appears in it.
const coverageBlock = (field) => `<div class="stats">
  ${stat('kind', field.kinds.length === 0 ? 'null only' : field.kinds.join(' + '))}
  ${stat('out of', `${num(field.total)} ${field.path.includes('[]') ? 'elements' : 'records'}`)}
  ${stat('present', `${num(field.present)} (${pct(field.present, field.present + field.absent)})`)}
  ${stat('non-null', num(field.set))}
  ${stat('null', num(field.nulls))}
  ${stat('absent', num(field.absent))}
  ${stat('distinct', num(field.distinct))}
  ${field.uuids ? stat('note', 'contains uuids') : ''}
</div>`

// * the range as five numbers, then how the values are distributed inside it. The histogram is
// * empty when there are few enough distinct numbers that the value table below is the exact
// * distribution — approximating a table you can read in full is worse than not drawing it.
const numbersBlock = (numbers) => {
  const peak = Math.max(...numbers.histogram.map((row) => row.count))
  return `<div class="stats">
      ${stat('numbers', num(numbers.count))}
      ${stat('min', numbers.min)}
      ${stat('p25', numbers.p25)}
      ${stat('median', numbers.median)}
      ${stat('p75', numbers.p75)}
      ${stat('max', numbers.max)}
    </div>
    ${
      numbers.histogram.length === 0
        ? ''
        : `<div class="hist">
      ${numbers.histogram
        .map(
          (row) => `<div class="hist-row">
            <span class="mono faint">${esc(row.label)}</span>
            ${bar([['set', row.count, peak]])}
            <span class="n">${num(row.count)}</span>
          </div>`,
        )
        .join('')}
    </div>`
    }`
}

const stringsBlock = (strings) => `<div class="stats">
  ${stat('strings', num(strings.count))}
  ${stat('empty ""', num(strings.empty))}
  ${stat('length min', num(strings.min))}
  ${stat('length median', num(strings.median))}
  ${stat('length max', num(strings.max))}
</div>`

// * a list of objects is a set of records: it is described by which key sets its elements have, and
// * the elements' own fields are the rows indented under `<path>[]`. A list of scalars is described
// * by which values occur in it.
const arrayBlock = (field, array) => `<div class="stats">
    ${stat('lists', num(array.count))}
    ${stat('empty', num(array.empty))}
    ${stat('elements', num(array.elements))}
    ${stat('length median', num(array.median))}
    ${stat('length max', num(array.max))}
  </div>
  ${
    array.objects
      ? `<p class="muted">Elements are objects — <b>${num(array.elements)}</b> of them across ${num(array.count)} lists. Their fields are analysed per element under <code>${esc(field.path)}[]</code>.</p>`
      : ''
  }
  ${frequencyTable(array.objects ? 'element key set' : 'element', array, array.objects ? array.elements : array.count)}`

const objectBlock = (object, children) => `<div class="stats">
    ${stat('objects', num(object.count))}
    ${stat('shape', object.dictionary ? 'dictionary — keys are data' : 'fixed shape')}
    ${stat(object.dictionary ? 'distinct keys' : 'distinct key sets', num(object.top.length + object.more))}
    ${object.dictionary ? '' : stat('child fields', num(children))}
  </div>
  ${frequencyTable(object.dictionary ? 'key' : 'key set', object, object.count)}
  ${object.dictionary ? '<p class="faint">An open key set, so its children are not analysed as fields of their own.</p>' : ''}`

// * everything the analysis knows about one field. Built once, on first expand. A container is
// * described by its shape rather than by its values — the values of its children are the fields
// * directly below it.
const detailFor = (field) =>
  [
    coverageBlock(field),
    field.numbers ? numbersBlock(field.numbers) : '',
    field.strings ? stringsBlock(field.strings) : '',
    field.array ? arrayBlock(field, field.array) : '',
    field.object ? objectBlock(field.object, field.children) : '',
    field.array || field.object ? '' : frequencyTable('value', field, field.present),
  ].join('')

// * the path is shown whole — it is what you search and what you link to — but the part of it that
// * is context is dimmed and the row is indented by its depth, so a container and the fields inside
// * it read as one thing instead of as neighbours in a flat list of 120.
const fieldRow = (field) => `
  <article class="field" data-path="${esc(field.path)}" data-cat="${esc(field.category)}" data-depth="${field.depth}" style="--depth:${field.depth}">
    <button class="head" type="button" aria-expanded="false">
      <span class="tick">▸</span>
      <span class="path mono"><span class="prefix">${esc(field.prefix)}</span>${esc(field.leaf)}</span>
      <span class="cat cat-${esc(field.category)}">${esc(field.category)}</span>
      <span class="cover">
        ${bar([
          ['set', field.set, field.present + field.absent],
          ['null', field.nulls, field.present + field.absent],
          ['absent', field.absent, field.present + field.absent],
        ])}
        <span class="legend faint">${num(field.set)} set · ${num(field.nulls)} null · ${num(field.absent)} absent</span>
      </span>
      <span class="distinct"><b>${num(field.distinct)}</b> distinct</span>
    </button>
    <div class="detail" hidden></div>
  </article>`

// * the whole entity: what its records are, how its fields split by category, then the fields
const entitySection = (entity) => {
  const legend = DATA.categories
    .filter((category) => entity.counts[category] > 0)
    .map(
      (
        category,
      ) => `<button type="button" class="pill cat-${esc(category)}" data-cat="${esc(category)}">
        <i></i>${esc(category)} <b>${num(entity.counts[category])}</b>
      </button>`,
    )
    .join('')

  return `
    <section class="entity panel">
      <div class="overview">
        <h2>${esc(entity.name)}</h2>
        <p class="muted">${num(entity.records)} records, deduped by <code>${esc(entity.identity)}</code> · ${num(entity.fields.length)} paths analysed. ${esc(entity.note)}</p>
        <div class="split">
          ${DATA.categories
            .filter((category) => entity.counts[category] > 0)
            .map(
              (category) =>
                `<i class="cat-${esc(category)}" style="flex:${entity.counts[category]}" title="${esc(category)}: ${entity.counts[category]}"></i>`,
            )
            .join('')}
        </div>
        <div class="pills">${legend}</div>
      </div>

      <div class="toolbar">
        <input type="search" class="search" placeholder="filter fields — path or value (press /)" value="${esc(state.query)}">
        <label>sort <select class="sort">${SORTS.map(
          ([value, text]) =>
            `<option value="${esc(value)}"${state.sort === value ? ' selected' : ''}>${esc(text)}</option>`,
        ).join('')}</select></label>
        <span class="count faint"></span>
        <button type="button" class="ghost expand">expand all</button>
      </div>

      <div class="fields">${entity.fields.map(fieldRow).join('')}</div>

      <div class="footers">
        ${
          entity.ignored.length === 0
            ? ''
            : `<details>
                <summary>${num(entity.ignored.length)} roots excluded on purpose (${num(entity.ignored.reduce((n, row) => n + row.paths, 0))} paths)</summary>
                <table><thead><tr><th>root</th><th class="n">paths</th><th>why</th></tr></thead><tbody>
                  ${entity.ignored.map((row) => `<tr><td class="mono">${esc(row.root)}</td><td class="n">${num(row.paths)}</td><td class="muted">${esc(row.why)}</td></tr>`).join('')}
                </tbody></table>
              </details>`
        }
        ${
          entity.collapsed.length === 0
            ? ''
            : `<details>
                <summary>${num(entity.collapsed.length)} dictionaries — their keys are data, so their children are not analysed as fields</summary>
                <table><thead><tr><th>container</th><th class="n">child paths collapsed</th></tr></thead><tbody>
                  ${entity.collapsed.map((row) => `<tr><td class="mono">${esc(row.root)}</td><td class="n">${num(row.paths)}</td></tr>`).join('')}
                </tbody></table>
              </details>`
        }
      </div>
    </section>`
}

// * a field matches the query on its path or on any value the analysis kept for it — searching for
// * "SGLang" and landing on the three fields that mention it is the point
const haystack = (entity, path) => {
  const field = entity.fields.find((candidate) => candidate.path === path)
  const values = [...field.top, ...(field.array?.top ?? []), ...(field.object?.top ?? [])]
  return `${path} ${values.map((row) => row.value).join(' ')}`.toLowerCase()
}

const apply = () => {
  const entity = entityOf(state.entity)
  const query = state.query.trim().toLowerCase()
  const section = root.querySelector('.entity')
  let shown = 0

  for (const node of section.querySelectorAll('.field')) {
    const { path } = node.dataset
    const matches =
      (state.categories.size === 0 || state.categories.has(node.dataset.cat)) &&
      (query === '' || haystack(entity, path).includes(query))
    node.hidden = !matches
    if (matches) {
      shown += 1
    }
  }

  section.querySelector('.count').textContent =
    `${num(shown)} of ${num(entity.fields.length)} fields`

  for (const pill of section.querySelectorAll('.pill')) {
    pill.classList.toggle('on', state.categories.has(pill.dataset.cat))
  }

  // * sorting reorders the nodes that are already there, so an open field stays open
  const fields = section.querySelector('.fields')
  // * indentation only means something in path order — under any other sort a child can sit above
  // * an unrelated parent, and a tree drawn over that order would be a lie
  fields.classList.toggle('tree', state.sort === 'path')
  const order = new Map(
    entity.fields
      .toSorted((a, b) =>
        state.sort === 'path' ? a.path.localeCompare(b.path) : b[state.sort] - a[state.sort],
      )
      .map((field, index) => [field.path, index]),
  )
  for (const node of [...fields.children].toSorted(
    (a, b) => order.get(a.dataset.path) - order.get(b.dataset.path),
  )) {
    fields.append(node)
  }
}

const expand = (node, open) => {
  const field = entityOf(state.entity).fields.find(
    (candidate) => candidate.path === node.dataset.path,
  )
  const detail = node.querySelector('.detail')
  if (open && detail.innerHTML === '') {
    detail.innerHTML = detailFor(field)
  }
  detail.hidden = !open
  node.classList.toggle('open', open)
  node.querySelector('.head').setAttribute('aria-expanded', String(open))
}

const render = () => {
  const tabs = DATA.entities
    .map(
      (
        entity,
      ) => `<button type="button" class="tab${entity.name === state.entity ? ' on' : ''}" data-entity="${esc(entity.name)}">
        ${esc(entity.name)} <b>${num(entity.records)}</b>
      </button>`,
    )
    .join('')

  root.innerHTML = `
    <nav class="tabs">${tabs}</nav>
    <p class="meanings faint">${DATA.categories.map((category) => `<span class="cat-${esc(category)}"><i></i>${esc(category)} — ${esc(MEANING[category])}</span>`).join('')}</p>
    ${entitySection(entityOf(state.entity))}`

  for (const tab of root.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      state.entity = tab.dataset.entity
      state.categories.clear()
      render()
    })
  }

  const section = root.querySelector('.entity')

  for (const pill of section.querySelectorAll('.pill')) {
    pill.addEventListener('click', () => {
      const category = pill.dataset.cat
      if (state.categories.has(category)) {
        state.categories.delete(category)
      } else {
        state.categories.add(category)
      }
      apply()
    })
  }

  const search = section.querySelector('.search')
  search.addEventListener('input', () => {
    state.query = search.value
    apply()
  })

  section.querySelector('.sort').addEventListener('change', (event) => {
    state.sort = event.target.value
    apply()
  })

  section.querySelector('.expand').addEventListener('click', (event) => {
    const opening = event.target.textContent.trim() === 'expand all'
    for (const node of section.querySelectorAll('.field')) {
      if (!node.hidden) {
        expand(node, opening)
      }
    }
    event.target.textContent = opening ? 'collapse all' : 'expand all'
  })

  for (const node of section.querySelectorAll('.field')) {
    node.querySelector('.head').addEventListener('click', () => {
      expand(node, node.querySelector('.detail').hidden)
      globalThis.history.replaceState(null, '', `#${state.entity}/${node.dataset.path}`)
    })
  }

  apply()
}

// * #<entity>/<path> opens that entity with that field expanded — reports get linked at, and a
// * link into a page that renders itself has to say where it landed
const fromHash = () => {
  const [name, path] = decodeURIComponent(globalThis.location.hash.slice(1)).split('/')
  if (entityOf(name)) {
    state.entity = name
  }
  render()
  if (!path) {
    return
  }
  const node = root.querySelector(`.field[data-path="${CSS.escape(path)}"]`)
  if (node) {
    expand(node, true)
    node.scrollIntoView({ block: 'center' })
  }
}

fromHash()

// * "/" is the search box everywhere else; it should be here too
globalThis.addEventListener('keydown', (event) => {
  const search = root.querySelector('.search')
  if (event.key === '/' && document.activeElement !== search) {
    event.preventDefault()
    search.focus()
    search.select()
  }
  if (event.key === 'Escape' && document.activeElement === search) {
    search.value = ''
    state.query = ''
    apply()
  }
})
