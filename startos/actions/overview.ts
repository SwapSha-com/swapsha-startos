import { i18n } from '../i18n'
import { gatherOverview, overviewMarkdown } from '../overview'
import { sdk } from '../sdk'

// A3d: the operator dashboard (blueprint 6.4), inside StartOS
export const swapsOverview = sdk.Action.withoutInput(
  'swaps-overview',

  async () => ({
    name: i18n('Swaps Overview'),
    description: i18n(
      'Liquidity, open swaps, nodes and alerts, read now from the backend, the nodes and the database.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Swaps'),
    visibility: 'enabled',
  }),

  async ({ effects }) => ({
    version: '1',
    title: i18n('Swaps Overview'),
    message: overviewMarkdown(
      await gatherOverview(effects, { withBalances: true }),
    ),
    result: null,
  }),
)
