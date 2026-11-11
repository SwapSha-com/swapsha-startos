import { sdk } from '../sdk'
import {
  connectLightningFork,
  disconnectLightningFork,
} from './connectLightningFork'
import { pauseSwaps, resumeSwaps, setLimits, setRate } from './operator'
import { swapsOverview } from './overview'
import {
  exportRescueData,
  recoverNodeWallets,
  rescueSwapAction,
} from './rescue'
import { enterTestMode, leaveTestMode } from './testMode'

export const actions = sdk.Actions.of()
  .addAction(swapsOverview)
  .addAction(setRate)
  .addAction(setLimits)
  .addAction(pauseSwaps)
  .addAction(resumeSwaps)
  .addAction(connectLightningFork)
  .addAction(disconnectLightningFork)
  .addAction(exportRescueData)
  .addAction(rescueSwapAction)
  .addAction(recoverNodeWallets)
  .addAction(enterTestMode)
  .addAction(leaveTestMode)
