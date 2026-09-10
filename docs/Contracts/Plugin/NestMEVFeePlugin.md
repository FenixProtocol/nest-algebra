

# NestMEVFeePlugin

NestMEVFeePlugin

The Nest TWAP fee product plus a spot-oracle-referenced LVR/peg term:
fee &#x3D; clamp(base + max(scalingFactor * |tick - TWAP_short| / SCALING_PRECISION,
                       klvr * max(0, effectiveGap - deadband) / SCALING_PRECISION), base, cap),
where effectiveGap &#x3D; min(max(|tick-spot|, |blockStartTick-spot|), MAX_PRICED_GAP).

*Developer note: Safety model:
- klvr &#x3D;&#x3D; 0 is behaviorally equivalent to NestTWAPFeePlugin and makes no precompile call.
- Only a structurally invalid spot read selects internal-TWAP fallback.
- Every structurally valid spot observation uses the Nest MEV formula; gap size only saturates the priced input.
- Spot-market manipulation resistance is an external economic assumption measured before arming.*

**Inherits:** [NestTWAPFeePlugin](NestTWAPFeePlugin.md) [INestMEVFeeManager](interfaces/INestMEVFeeManager.md)

## Public variables
### MAX_KLVR
```solidity
uint64 constant MAX_KLVR
```
**Selector**: `0x100d745f`

### MAX_DEADBAND
```solidity
uint32 constant MAX_DEADBAND = 100
```
**Selector**: `0x22623d6b`

### MAX_ORACLE_PRICE_EXP
```solidity
uint8 constant MAX_ORACLE_PRICE_EXP = 60
```
**Selector**: `0x72b9d23b`

### MAX_CONFIG_GAP
```solidity
uint32 constant MAX_CONFIG_GAP = 2000
```
**Selector**: `0x88705e06`

### MIN_ORACLE_LIVE_SCALING
```solidity
uint64 constant MIN_ORACLE_LIVE_SCALING
```
**Selector**: `0xfbbd23a7`

### MAX_FALLBACK_SCALING_FACTOR
```solidity
uint64 constant MAX_FALLBACK_SCALING_FACTOR
```
**Selector**: `0x50002dea`

### MIN_LVR_EDGE_MARGIN
```solidity
uint256 constant MIN_LVR_EDGE_MARGIN = 100
```
**Selector**: `0xa009e50f`

## Functions
### mevFeeConfig

```solidity
function mevFeeConfig() external view returns (uint64 klvr, uint32 deadband, uint32 shortTwapWindow, uint32 spotIndex, uint8 priceExp, bool inverted, uint32 maxConfigGap)
```
**Selector**: `0x67bcc64c`

Current Nest MEV oracle configuration

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| klvr | uint64 |  |
| deadband | uint32 |  |
| shortTwapWindow | uint32 |  |
| spotIndex | uint32 |  |
| priceExp | uint8 |  |
| inverted | bool |  |
| maxConfigGap | uint32 |  |

### setOracleConfig

```solidity
function setOracleConfig(uint64 klvr, uint32 deadband, uint32 shortTwapWindow, uint32 spotIndex, uint8 priceExp, bool inverted, uint32 maxConfigGap) external
```
**Selector**: `0x30b0d68b`

Enable, retune, or disable (klvr&#x3D;0) the Nest MEV oracle term.

*Developer note: Callable by the plugin factory or holders of the DEVIATION_FEE_MANAGER role. When enabling
(klvr &gt; 0) it performs an activation-time gap check: the live |poolTick - oracleTick| must be
&lt;&#x3D; maxConfigGap. This rejects structurally valid observations that are outside the configured arming
bound; it does not independently establish that an in-bound feed is economically correct. Enforces
klvr &lt;&#x3D; MAX_KLVR (slope &lt;&#x3D; 1.0).*

| Name | Type | Description |
| ---- | ---- | ----------- |
| klvr | uint64 |  |
| deadband | uint32 |  |
| shortTwapWindow | uint32 |  |
| spotIndex | uint32 |  |
| priceExp | uint8 |  |
| inverted | bool |  |
| maxConfigGap | uint32 |  |

### setDeviationFeeConfig

```solidity
function setDeviationFeeConfig(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow) external virtual
```
**Selector**: `0xfa0c811f`

While armed, the sandwich slope is pinned at normalized slope 1.0. The intended 60-second
shortTwapWindow limits the duration of lag after a genuine move but does not eliminate it.

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseFee | uint16 |  |
| feeCap | uint16 |  |
| scalingFactor | uint64 |  |
| twapWindow | uint32 |  |

### fallbackScalingFactor

```solidity
function fallbackScalingFactor() external view returns (uint64)
```
**Selector**: `0x4d5c9cce`

Slope used only in the oracle-failure fallback on the inherited long TWAP. It must be nonzero
while armed; zero is permitted only while disarmed.

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint64 |  |

### setFallbackScalingFactor

```solidity
function setFallbackScalingFactor(uint64 slope) external
```
**Selector**: `0x76f522c6`

Set the oracle-failure fallback slope (fee-units/tick * SCALING_PRECISION).

*Developer note: Callable by the plugin factory or holders of the DEVIATION_FEE_MANAGER role. Does not affect klvr&#x3D;&#x3D;0.*

| Name | Type | Description |
| ---- | ---- | ----------- |
| slope | uint64 |  |

