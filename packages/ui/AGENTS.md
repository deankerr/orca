# ui

Shared shadcn/ui components. Add components on demand with the `shadcn` skill.

- Never use destructured parameter defaults (`({ size = 'default', ...props })`): they make the React Compiler bail out silently, leaving the component uncompiled. Destructure the prop bare and apply the default in the body: `??`, or an `=== undefined` check where `null` must stay distinct from unset (CVA variant props accept `null`, which skips the variant's default). Check each prop's type. This is a deliberate local divergence from upstream shadcn. A lint rule enforces this.
