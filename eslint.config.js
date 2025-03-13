// @ts-check
import antfu from '@antfu/eslint-config'

const portFiles = [
  'port/**',
]

export default antfu(
  {
    type: 'app',
    pnpm: true,
  },
)
  .override('antfu/stylistic/rules', {
    ignores: portFiles,
  })
  .override('antfu/regexp/rules', {
    ignores: portFiles,
  })
  .append({
    files: portFiles,
    rules: {
      'prefer-template': 0,
      'unicorn/no-instanceof-builtins': 0,
      'ts/no-use-before-define': 0,
      'import/no-mutable-exports': 0,
      'no-console': 0,
      'no-labels': 0,
      'one-var': 0,
      'eqeqeq': 0,
      'ts/prefer-literal-enum-member': 0,
      'antfu/no-top-level-await': 2,
      'antfu/top-level-function': 2,
    },
  })
