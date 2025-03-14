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
      'no-labels': 0,
    },
  })
