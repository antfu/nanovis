// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'app',
    pnpm: true,
  },
)
  .append({
    rules: {
      'prefer-template': 0,
      'unicorn/no-instanceof-builtins': 0,
      'ts/no-use-before-define': 0,
      'import/no-mutable-exports': 0,
      'no-labels': 0,
      'one-var': 0,
      'eqeqeq': 0,
      'ts/prefer-literal-enum-member': 0,
    },
  })
