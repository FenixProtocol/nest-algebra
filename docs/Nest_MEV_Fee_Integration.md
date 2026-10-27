# Nest MEV fee integration guide

This guide explains how to configure, operate, and monitor `NestMEVFeePlugin`. It is intended for developers integrating pool deployment, governance, keepers, dashboards, and swap or quote infrastructure.

The generated ABI reference is available in [NestMEVFeePlugin](Contracts/Plugin/NestMEVFeePlugin.md). This guide focuses on behavior that spans multiple functions and is not apparent from the ABI alone.

## Overview

`NestMEVFeePlugin` calculates a dynamic swap fee before every swap. It combines:

- a base fee charged to every swap;
- a short self-TWAP term intended to make short-lived pool-price manipulation more expensive;
- an LVR term based on the difference between the Algebra pool tick and a HyperCore spot-oracle tick;
- a long self-TWAP fallback used when the external oracle is unavailable; and
- a total fee cap.

When the external oracle is live, the total fee is:

```text
fee = min(baseFee + max(sandwichTerm, lvrTerm), feeCap)
```

When the oracle is unavailable, the plugin does not use the LVR or short-TWAP terms:

```text
fee = min(baseFee + fallbackLongTwapTerm, feeCap)
```

Setting `klvr` to zero disables oracle mode. In that state the plugin behaves like `NestTWAPFeePlugin` and does not call the HyperCore precompile.

## Units

Correct unit conversion is essential when building configuration tooling.

| Value                                            | Unit                                                  | Example                                          |
| ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------ |
| `baseFee`, `feeCap`, calculated fee              | `1e-6` of input                                       | `1_000` = 0.1%, `50_000` = 5%                    |
| Pool and oracle price difference                 | Algebra ticks                                         | One tick is a price ratio of exactly `1.0001`    |
| `scalingFactor`, `fallbackScalingFactor`, `klvr` | Fee units per tick, multiplied by `SCALING_PRECISION` | `50_000_000 / 1_000_000 = 50` fee units per tick |
| TWAP windows                                     | Seconds                                               | `60` = one minute                                |
| Oracle price                                     | `priceRaw / 10^priceExp`                              | `priceRaw = 1e18`, `priceExp = 18` gives price 1 |

`SCALING_PRECISION` is `1_000_000`. For the LVR term, 100 fee units per tick is the linear one-tick benchmark. Therefore:

```text
normalized LVR slope = klvr / (100 * SCALING_PRECISION)
```

Examples:

|       `klvr` | Fee increase per priced tick |  Normalized slope |
| -----------: | ---------------------------: | ----------------: |
|  `1_000_000` |                   1 fee unit |              0.01 |
| `50_000_000` |                 50 fee units |              0.50 |
| `94_000_000` |                 94 fee units | 0.94, the maximum |

Do not pass a human percentage directly to a setter. Convert it into the contract's integer units first.

## Runtime fee calculation

### Oracle gap and same-block anchor

For a live oracle observation, the plugin starts with:

```text
currentGap = abs(poolTick - oracleTick)
```

On the first swap in a block, it stores the pre-swap pool tick as `blockStartTick`. On every subsequent swap in that block, it computes:

```text
blockStartGap = abs(blockStartTick - oracleTick)
actualGap = max(currentGap, blockStartGap)
effectiveGap = min(actualGap, MAX_PRICED_GAP)
```

The anchor prevents a first swap from reducing the fee applied to later swaps in the same block. It also means integrators must not assume that moving the pool back to the oracle price immediately reduces the fee during that block. The anchor resets when the next block processes its first swap.

The plugin calculates and installs the fee in `beforeSwap`, using the pool state before that swap. A swap that moves the price substantially therefore pays the fee calculated from the old price; the resulting gap affects later swaps.

### Deadband

`deadband` is a number of ticks excluded from LVR fee calculation:

```text
pricedGap = max(0, effectiveGap - deadband)
```

For example, with a 20-tick deadband:

```text
effectiveGap = 15 -> pricedGap = 0
effectiveGap = 20 -> pricedGap = 0
effectiveGap = 50 -> pricedGap = 30
```

The deadband serves two purposes:

1. Small differences between the pool and oracle do not produce an LVR charge.
2. It reserves price discrepancy that can pay the base fee and still leave an arbitrage incentive.

It is not merely a tolerance parameter. The contract rejects a deadband that does not preserve the required arbitrage edge for the configured fees.

### LVR term

The LVR term is linear in the priced tick gap:

```text
lvrTerm = floor(pricedGap * klvr / SCALING_PRECISION)
```

Example:

```text
effectiveGap = 50 ticks
deadband     = 12 ticks
klvr         = 94_000_000

pricedGap = 50 - 12 = 38 ticks
lvrTerm   = floor(38 * 94_000_000 / 1_000_000)
          = 3_572 fee units
          = 0.3572%
```

If `baseFee` is `1_000` and the short-TWAP term is smaller, the total fee is `4_572`, or 0.4572%.

### Short-TWAP term

The live-oracle path also calculates:

```text
sandwichTerm = floor(
  abs(poolTick - shortTwapTick) * scalingFactor / SCALING_PRECISION
)
```

The contract charges the larger of `sandwichTerm` and `lvrTerm`; it does not add them together. A quote or monitoring integration must evaluate both terms.

### Cap

Finally:

```text
fee = min(baseFee + max(sandwichTerm, lvrTerm), feeCap)
```

The maximum supported `feeCap` is `50_000`, or 5%.

## Why the arbitrage-edge checks use a price ratio

A linear rule such as “one tick offsets 100 fee units” is only an approximation. A fee is charged to gross input, while ticks compound geometrically.

For a gap of `g` ticks, the exact price ratio is:

```text
priceRatio = 1.0001^g
```

For a fee in protocol units, the fraction of gross input remaining after the fee is:

```text
remainingInput = 1 - fee / 1_000_000
```

Ignoring gas, price impact, and external-market costs, a marginal arbitrage has a positive edge when:

```text
1.0001^g * (1 - fee / 1_000_000) > 1
```

At large fees, this exact condition is stricter than the linear approximation. For example, overcoming a 5% input fee requires approximately 513 ticks, not 500 ticks.

## `_hasMinimumArbitrageEdge`

`_hasMinimumArbitrageEdge(gap, fee)` evaluates the exact condition above and reserves one additional tick of margin.

### Reserve the margin

The current constants express a 100-fee-unit margin and a 100-fee-unit-per-tick benchmark:

```text
marginTicks = MIN_LVR_EDGE_MARGIN / FEE_UNITS_PER_TICK
            = 100 / 100
            = 1 tick
```

The function evaluates `gap - 1` rather than `gap`:

```text
edgeGap = gap - marginTicks
```

If arbitrage remains profitable after removing one tick from the observed gap, the original gap contains more than one tick of edge.

### Convert the tick into a ratio

`TickMath.getSqrtRatioAtTick(edgeGap)` returns:

```text
sqrt(1.0001^edgeGap) * 2^96
```

Squaring produces the price ratio in Q192 fixed-point representation:

```text
priceRatioX192 = 1.0001^edgeGap * 2^192
```

The Solidity comparison is:

```text
priceRatioX192 * (1_000_000 - fee) > 2^192 * 1_000_000
```

After cancelling the fixed-point scale, this is exactly:

```text
1.0001^edgeGap * (1 - fee / 1_000_000) > 1
```

The function returns `false` rather than attempting the calculation when the supplied gap is not larger than the required margin.

## `_validateLvrEdge`

`_validateLvrEdge(klvr, deadband, baseFee, feeCap)` validates two boundaries of the LVR curve.

### Boundary 1: LVR activation

At `gap == deadband`, the LVR term is zero. The only persistent fee in the LVR calculation is the base fee. The function requires:

```text
_hasMinimumArbitrageEdge(deadband, baseFee) == true
```

An insufficient deadband reverts with:

```text
Insufficient LVR edge
```

### Boundary 2: Fee cap

The available dynamic fee headroom is:

```text
dynamicHeadroom = feeCap - baseFee
```

The number of priced ticks required for the LVR term to fill this headroom is:

```text
ticksToCap = ceil(dynamicHeadroom * SCALING_PRECISION / klvr)
```

The first total gap at which the LVR fee reaches the cap is therefore:

```text
capGap = deadband + ticksToCap
```

The function requires:

```text
_hasMinimumArbitrageEdge(capGap, feeCap) == true
```

Failure reverts with:

```text
Insufficient LVR edge at cap
```

With `MAX_KLVR = 94_000_000`, the LVR fee increases by no more than 94 fee units per tick. Up to the 5% cap, one additional price tick contributes enough price movement that the net edge cannot decrease. Checking the beginning and cap boundaries therefore covers the linear LVR interval; after the cap, the fee remains constant while the price gap grows.

These checks prove an edge for the LVR fee curve only. They do not guarantee that a real transaction is profitable after accounting for:

- pool price impact and available liquidity;
- gas costs;
- external-market trading or withdrawal fees;
- latency and competing arbitrageurs;
- token transfer behavior; or
- a temporarily larger short-TWAP term.

## Configuration constraints

### Deviation-fee configuration

`setDeviationFeeConfig(baseFee, feeCap, scalingFactor, twapWindow)` enforces:

| Parameter       | Constraint                                      |
| --------------- | ----------------------------------------------- |
| `baseFee`       | At most `30_000` (3%)                           |
| `feeCap`        | At least `baseFee` and at most `50_000` (5%)    |
| `scalingFactor` | Zero, or from `1_000_000` through `100_000_000` |
| `twapWindow`    | From 60 seconds through 12 hours                |

If `scalingFactor` is nonzero, the long TWAP must already cover `twapWindow` and `feeCap` must be greater than `baseFee`.

While oracle mode is armed, `scalingFactor` cannot be zero. Changes to `baseFee` or `feeCap` are also revalidated against the current `klvr` and deadband.

### Oracle configuration

`setOracleConfig(klvr, deadband, shortTwapWindow, spotIndex, priceExp, inverted, maxConfigGap)` enforces:

| Parameter         | Constraint                                                             |
| ----------------- | ---------------------------------------------------------------------- |
| `klvr`            | Zero, or from `1_000_000` through `94_000_000`                         |
| `deadband`        | At most 100 ticks and must pass both edge checks                       |
| `shortTwapWindow` | From 60 seconds through 12 hours and already covered by stored history |
| `priceExp`        | At most 60                                                             |
| `maxConfigGap`    | At most 2,000 ticks                                                    |

Arming also requires:

- `feeCap > baseFee`;
- a nonzero live short-TWAP slope;
- a previously configured nonzero fallback slope;
- a structurally valid HyperCore oracle response;
- an initialized pool; and
- `abs(poolTick - oracleTick) <= maxConfigGap` at activation.

While already armed, the oracle identity fields `spotIndex`, `priceExp`, and `inverted` cannot change. Set `klvr` to zero first if the feed identity must be changed.

### Fallback configuration

`setFallbackScalingFactor(slope)` accepts zero, or a value from `1_000_000` through `50_000_000`. It cannot be set to zero while oracle mode is armed.

The fallback term uses the inherited long TWAP window from `setDeviationFeeConfig`; it does not use `shortTwapWindow`.

## Recommended configuration sequence

For a newly attached plugin:

1. Initialize and attach the plugin to its pool.
2. Allow the timepoint history to cover both intended TWAP windows.
3. Confirm `isTwapReady(longTwapWindow)` and `isTwapReady(shortTwapWindow)`.
4. While `klvr == 0`, call `setFallbackScalingFactor` with a nonzero fallback slope.
5. Call `setDeviationFeeConfig` with the intended base fee, cap, live short-TWAP slope, and long fallback window.
6. Read the pool tick and the converted HyperCore tick off-chain. Confirm the feed identity, orientation, decimals, and activation gap.
7. Call `setOracleConfig` with a `klvr` no greater than `94_000_000` and a deadband that passes the exact edge checks.
8. Read back `deviationFeeConfig()` and `mevFeeConfig()` and verify every stored value.
9. Confirm the emitted `DeviationFeeConfigChanged`, `FallbackScalingFactorChanged`, and `OracleConfigChanged` events.

Both configuration setters are restricted to the plugin factory or an account recognized by the Algebra factory as owner or holder of `DEVIATION_FEE_MANAGER`.

## Off-chain prevalidation

Governance tooling should reproduce contract validation before proposing a transaction.

Pseudocode:

```text
assert 0 < klvr <= 94_000_000
assert deadband <= 100
assert baseFee < feeCap <= 50_000

marginTicks = 1

function hasEdge(gap, fee):
    if gap <= marginTicks:
        return false
    ratio = 1.0001 ** (gap - marginTicks)
    return ratio * (1 - fee / 1_000_000) > 1

assert hasEdge(deadband, baseFee)

headroom = feeCap - baseFee
ticksToCap = ceil(headroom * 1_000_000 / klvr)
capGap = deadband + ticksToCap
assert hasEdge(capGap, feeCap)
```

Off-chain implementations must use sufficient precision and conservative rounding. For an exact match, use the same `TickMath` Q96 calculation and integer comparison as the contract rather than floating-point exponentiation.

## Oracle availability and monitoring

The HyperCore reader treats the oracle as unavailable when the precompile call fails, returns a non-32-byte value, returns zero, exceeds configured numeric bounds, or converts outside valid Algebra price bounds.

When availability changes during a swap, the plugin emits:

```solidity
event OracleFallback(bool engaged);
```

- `engaged == true`: the swap selected long-TWAP fallback mode.
- `engaged == false`: the swap returned to live-oracle mode.

Monitoring systems must also process `OracleConfigChanged`:

- `klvr == 0` means oracle mode is disabled.
- `klvr > 0` means the configuration call completed a valid oracle read and reset status to live.

Do not infer oracle status solely from the most recent `OracleFallback` event.

Recommended alerts include:

- fallback engagement lasting longer than the expected precompile interruption;
- fees remaining near `feeCap` across multiple blocks;
- a persistent pool/oracle tick gap;
- failed governance configuration transactions;
- unexpected changes to oracle identity or inversion; and
- a plugin implementation upgrade without a configuration audit.

## Quote and swap integration considerations

- The fee is recalculated in `beforeSwap`; a cached fee may be stale by execution time.
- `getCurrentFee()` is useful for observation but cannot guarantee the fee of a later transaction or later swap in a multicall.
- The block-start gap can keep a fee elevated for subsequent swaps in the same block even after the current pool price returns toward the oracle.
- Routers should enforce user-provided amount or price limits. The plugin fee mechanism is not a substitute for slippage protection.
- Indexers should store fee values in integer protocol units, not floating-point percentages.
- A structurally valid oracle value is trusted once oracle mode is armed. Integrators remain responsible for validating feed identity, quote orientation, decimal exponent, and market suitability.

## Upgrade and migration considerations

`NestMEVFeePlugin` is used behind beacon proxies. Changing `MAX_KLVR` changes validation code but does not rewrite an existing proxy's stored `_klvr`.

Before upgrading an installation that may already contain slopes above `94_000_000`:

1. Enumerate every MEV plugin proxy managed by the beacon.
2. Read `mevFeeConfig()` and `deviationFeeConfig()` for each pool.
3. Preferably disarm affected pools by setting `klvr` to zero before the beacon upgrade.
4. Upgrade the beacon implementation.
5. Reconfigure the base fee, cap, fallback slope, and deadband as needed.
6. Rearm with `klvr <= 94_000_000`; this executes both exact edge checks.
7. Verify stored configuration and events for every pool.

If a pool remains armed across the upgrade with a previously stored slope above the new maximum, runtime fee calculation still reads that stored value. It must be explicitly retuned or disarmed; the constant alone does not migrate storage.

The fix adds no storage variables and does not change the beacon-proxy storage layout.

## Integration test checklist

An integration should cover at least:

- correct conversion between percentages, fee units, and scaled slopes;
- arming at `MAX_KLVR` and rejection above it;
- acceptance of a deadband with exact edge at both boundaries;
- rejection of an insufficient deadband;
- revalidation after changes to `baseFee` or `feeCap` while armed;
- exact cap-boundary rounding with ceiling division;
- both pool/oracle price directions;
- short-TWAP dominance and LVR dominance;
- same-block repeated swaps and block-anchor reset;
- oracle failure, fallback engagement, and recovery;
- disarm, oracle identity change, and rearm;
- activation rejection when the live oracle gap exceeds `maxConfigGap`; and
- post-upgrade discovery and retuning of legacy slopes.
