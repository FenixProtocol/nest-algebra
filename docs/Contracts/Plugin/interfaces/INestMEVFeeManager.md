

# INestMEVFeeManager

Manager interface for the Nest oracle-referenced LVR/peg fee term

Nest MEV mode combines the parent base/sandwich self-TWAP term with a second term measured against
the external HyperCore spot price. This interface covers the MEV-specific oracle configuration; the
base/cap/scaling/TWAP-window configuration remains in INestTWAPFeeManager.

*Developer note: klvr &#x3D;&#x3D; 0 disables the oracle term entirely, making the plugin equivalent to NestTWAPFeePlugin.*

## Events
### OracleConfigChanged

```solidity
event OracleConfigChanged(uint64 klvr, uint32 deadband, uint32 shortTwapWindow, uint32 spotIndex, uint8 priceExp, bool inverted, uint32 maxConfigGap)
```

Emitted when the Nest MEV oracle configuration changes

| Name | Type | Description |
| ---- | ---- | ----------- |
| klvr | uint64 | LVR-term slope in fee-units/tick * SCALING_PRECISION; 0 selects Nest TWAP behavior |
| deadband | uint32 | D, ticks — gaps within D pay no LVR fee (the structural no-arb band) |
| shortTwapWindow | uint32 | short self-TWAP window for the sandwich term, seconds |
| spotIndex | uint32 | configured HyperCore spot-pair index |
| priceExp | uint8 | power-of-ten divisor mapping the configured raw feed to the Algebra ratio |
| inverted | bool | precompile quote orientation |
| maxConfigGap | uint32 | activation-time bound (ticks) on |poolTick - oracleTick| |

### OracleFallback

```solidity
event OracleFallback(bool engaged)
```

Emitted by the swap path when oracle availability changes relative to the contract&#x27;s current
transition tracker. engaged&#x3D;true means the swap used internal-TWAP fallback; false means it used live spot.
Status consumers must also process OracleConfigChanged: klvr&#x3D;0 resets status to DISABLED and klvr&gt;0
resets status to LIVE after a successful stipended configuration-time read.

| Name | Type | Description |
| ---- | ---- | ----------- |
| engaged | bool |  |

### FallbackScalingFactorChanged

```solidity
event FallbackScalingFactorChanged(uint64 slope)
```

Emitted when the oracle-failure fallback slope changes

| Name | Type | Description |
| ---- | ---- | ----------- |
| slope | uint64 |  |

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

