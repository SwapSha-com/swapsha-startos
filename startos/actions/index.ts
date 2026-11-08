import { sdk } from '../sdk'
import {
  connectLightningFork,
  disconnectLightningFork,
} from './connectLightningFork'
import { pauseSwaps, resumeSwaps, setLimits, setRate } from './operator'
import { swapsOverview } from './overview'

export const actions = sdk.Actions.of()
  .addAction(swapsOverview)
  .addAction(setRate)
  .addAction(setLimits)
  .addAction(pauseSwaps)
  .addAction(resumeSwaps)
  .addAction(connectLightningFork)
  .addAction(disconnectLightningFork)
