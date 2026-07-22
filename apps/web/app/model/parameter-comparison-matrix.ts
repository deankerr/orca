type MatrixEndpoint = {
  provider: { name: string }
  supported_parameters: readonly string[]
  unavailable_at?: unknown
}

export type ParameterColumn = {
  parameter: string
  supportCount: number
}

export type ParameterRow<Endpoint extends MatrixEndpoint> = {
  endpoint: Endpoint
  supportedParameters: ReadonlySet<string>
}

export type ParameterMatrixData<Endpoint extends MatrixEndpoint> = {
  columns: readonly ParameterColumn[]
  rows: readonly ParameterRow<Endpoint>[]
}

export function buildParameterMatrix<Endpoint extends MatrixEndpoint>(
  endpoints: readonly Endpoint[],
): ParameterMatrixData<Endpoint> {
  const rows = endpoints
    .map((endpoint) => ({
      endpoint,
      supportedParameters: new Set(endpoint.supported_parameters),
    }))
    .toSorted(
      (left, right) =>
        Number(left.endpoint.unavailable_at !== undefined) -
          Number(right.endpoint.unavailable_at !== undefined) ||
        left.endpoint.provider.name.localeCompare(right.endpoint.provider.name),
    )

  const supportCounts = new Map<string, number>()
  for (const row of rows) {
    for (const parameter of row.supportedParameters) {
      supportCounts.set(parameter, (supportCounts.get(parameter) ?? 0) + 1)
    }
  }

  const columns = [...supportCounts]
    .map(([parameter, supportCount]) => ({ parameter, supportCount }))
    .toSorted(
      (left, right) =>
        right.supportCount - left.supportCount || left.parameter.localeCompare(right.parameter),
    )

  return { columns, rows }
}

// :has() lets the table react to a hovered descendant, but selectors cannot
// reuse that descendant's sibling index elsewhere. These scoped rules connect
// each body column to the matching header without introducing pointer state.
export function buildColumnHoverStyles(parameterCount: number) {
  return Array.from({ length: parameterCount }, (_, index) => {
    const tableChildIndex = index + 2 // The provider column is first.

    return `
      [data-parameter-matrix]:has(> tbody > tr > td:nth-child(${tableChildIndex}):hover)
        > thead > tr > th:nth-child(${tableChildIndex}) [data-parameter-label] {
          color: var(--foreground);
          text-decoration-color: color-mix(in oklab, var(--foreground) 60%, transparent);
        }

      [data-parameter-matrix]:has(> tbody > tr > td:nth-child(${tableChildIndex}):hover)
        > tbody > tr > td:nth-child(${tableChildIndex}) {
          background-color: color-mix(in oklab, var(--foreground) 4%, transparent);
        }
    `
  }).join('')
}
