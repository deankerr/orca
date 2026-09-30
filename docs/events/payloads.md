# Payloads

- Keeping the native entity-root change preserves the distinction between entity lifecycle and child-field operations.
- An entity UPDATE can contain child ADDs and REMOVEs while the entity remains present.
- JSON encoding accommodates arbitrary upstream keys; identity stays directly selectable outside the payload.
- Native `json-diff-ts` behavior is the starting point; custom comparison rules follow demonstrated data needs.

## Comparison choices

- Homogeneous string arrays use membership identity, including newly encountered fields; order changes disappear.
- Scalar/null transitions remain UPDATEs carrying both values, preserving null as an observed value.

## Accepted limitations

- `$value` collapses repeated strings, so duplicate-count changes disappear.
- `$value` matching drops the literal string `__proto__`; this is accepted for the string sets used by these entities.
- Object-to-scalar transitions can omit the new scalar or the entire change; this rare library behavior is accepted.
- Arrays nested directly inside arrays retain positional behavior; supported entity shapes avoid this case.
- In `json-diff-ts` 4.10.4, `applyChangeset` skips UPDATEs to null; rendering reads the retained diff nodes directly.
