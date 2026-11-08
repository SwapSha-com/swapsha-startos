import { sdk } from '../sdk'
import {
  connectLightningFork,
  disconnectLightningFork,
} from './connectLightningFork'

export const actions = sdk.Actions.of()
  .addAction(connectLightningFork)
  .addAction(disconnectLightningFork)
