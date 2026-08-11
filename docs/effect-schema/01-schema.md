# Schema

`Schema` is a TypeScript-first library for defining data shapes, validating unknown input, and transforming values between formats.

Two key concepts appear throughout this guide:

- **Decoding** — turning unknown external data (API responses, form submissions, config files) into typed, validated values.
- **Encoding** — turning typed values back into a serializable format (JSON, FormData, etc.).

Use Schema to:

- **Define types** — declare the shape of your data once and get both the TypeScript type and a runtime validator.
- **Validate input** — decode unknown data into type-safe values, with clear error messages when it doesn't match.
- **Transform values** — convert between your domain types and serialization formats like JSON, FormData, and URLSearchParams.
- **Generate tooling** — derive JSON Schemas, test data generators, equivalence checks, and more from a single schema definition.

## Design Philosophy

- **Lightweight by default** — only import the features you need, keeping your bundle small.
- **Familiar API** — naming conventions and patterns are consistent with popular validation libraries, so getting started is easy.
- **Explicit** — you choose which features to use. Nothing is included implicitly.

### What's in This Guide

1. **Elementary schemas** — built-in schemas for primitives, literals, strings, numbers, dates, and template literals.
2. **Composite schemas** — combine elementary schemas into structs (objects), tuples, arrays, records, and unions.
3. **Validation** — add runtime checks (filters) to constrain values, report multiple errors, and define custom rules.
4. **Constructors** — create validated values at runtime, with support for defaults, brands, and refinements.
5. **Transformations** — convert values between types during decoding and encoding. Transformations are reusable objects you compose with schemas.
6. **Flipping** — swap a schema's decoding and encoding directions.
7. **Classes and opaque types** — create distinct TypeScript types backed by structs, with optional methods and equality.
8. **Serialization** — convert values to and from JSON, FormData, URLSearchParams, and XML using canonical codecs.
9. **Tooling** — generate JSON Schemas, test data generators (Arbitraries), equivalence checks, optics, and JSON Patch differs from a single schema.
10. **Error handling** — format validation errors for display, with hooks for internationalization.
11. **Middlewares** — intercept decoding/encoding to provide fallbacks or inject services.
12. **Advanced topics** — internal type model and type hierarchy (for library authors).
13. **Integrations** — working examples for TanStack Form and Elysia.
14. **Migration from v3** — API mapping from Schema v3 to v4.

## Runtime Performance

Effect Schema is benchmarked against the public
[`schema-benchmarks`](https://github.com/open-circle/schema-benchmarks) suite.
It exercises a realistic product schema across validation, parsing, error
reporting, schema creation, and codecs.

The table below compares Effect Schema with the Valibot and Zod cases available
in the same suite.

Values are microseconds per operation and lower is better. Results vary between
machines, so they are most useful for understanding relative costs. A dash
means that the library does not provide that benchmark.

| Scenario                              | Effect Schema |    Valibot |      Zod 4 |
| ------------------------------------- | ------------: | ---------: | ---------: |
| Create a schema                       |        118.23 |  **40.24** |     318.56 |
| Create a schema and parser            |    **130.50** |          — |          — |
| Validate valid data                   |     **5.415** |       5.63 |          — |
| Validate invalid data                 |         1.348 | **0.2431** |          — |
| Parse valid data and collect errors   |         5.366 |   **5.22** |       7.16 |
| Parse invalid data and collect errors |     **9.100** |      15.70 |      41.58 |
| Parse valid data and stop early       |     **5.294** |       5.37 |          — |
| Parse invalid data and stop early     |         1.352 | **0.2572** |          — |
| Standard Schema, valid data           |         5.935 |       5.35 |   **3.83** |
| Standard Schema, invalid data         |    **15.203** |      16.51 |      32.85 |
| Standard Schema, valid, stop early    |     **5.843** |          — |          — |
| Standard Schema, invalid, stop early  |     **2.244** |          — |          — |
| Encode with a typed codec             |        0.3420 |          — | **0.0405** |
| Decode with a typed codec             |        0.3762 |          — | **0.0463** |
| Encode unknown input                  |    **0.3472** |          — |          — |
| Decode unknown input                  |    **0.3637** |          — |          — |
