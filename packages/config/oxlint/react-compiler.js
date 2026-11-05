/**
 * Lint rules that keep code compilable by the React Compiler, which skips a component or hook
 * silently instead of reporting it.
 */

/** @typedef {{ type: string, parent?: Node }} Node */
/** @typedef {{ report: (descriptor: { message: string, node: Node }) => void }} Context */

export default {
  meta: { name: 'orca-react-compiler' },
  rules: {
    'no-destructured-default': {
      // Deliberately not limited to components and hooks: the compiler bails on a default anywhere in
      // one, including its body and nested callbacks, and telling those apart statically is fragile.
      // Outside React such defaults are rare in the linted folders, so the cost of the breadth is low.
      /** @param {Context} context Reports a destructured default. */
      create(context) {
        return {
          /** @param {Node} node A destructuring default. */
          AssignmentPattern(node) {
            if (node.parent?.type === 'Property' && node.parent.parent?.type === 'ObjectPattern') {
              context.report({
                message:
                  'A default in object destructuring makes the React Compiler bail out silently. Destructure the property bare and apply the default in the body: `??`, or `=== undefined` where `null` must stay distinct (CVA variant props).',
                node,
              })
            }
          },
        }
      },
      meta: {
        docs: {
          description:
            'Disallow defaults inside object destructuring: the React Compiler cannot lower them and skips the whole component or hook.',
        },
        schema: [],
        type: 'problem',
      },
    },
  },
}
