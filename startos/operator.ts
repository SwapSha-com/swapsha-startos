import { operatorDefaults } from './utils'

export type OperatorTerms = typeof operatorDefaults

// What the Swaps actions stored, over the defaults
export const operatorTerms = (
  stored?: Partial<OperatorTerms> | null,
): OperatorTerms => ({
  rate: stored?.rate ?? operatorDefaults.rate,
  feePercent: stored?.feePercent ?? operatorDefaults.feePercent,
  spreadPercent: stored?.spreadPercent ?? operatorDefaults.spreadPercent,
  minSwapAmount: stored?.minSwapAmount ?? operatorDefaults.minSwapAmount,
  maxSwapAmount: stored?.maxSwapAmount ?? operatorDefaults.maxSwapAmount,
  paused: stored?.paused ?? operatorDefaults.paused,
})

// D43: each direction pays the fee plus half the spread, in percent,
// rounded to four decimals
export const directionFee = ({ feePercent, spreadPercent }: OperatorTerms) =>
  Math.round((feePercent + spreadPercent / 2) * 10_000) / 10_000

// 10000000 -> "10,000,000"
export const sats = (amount: number) => amount.toLocaleString('en-US')
