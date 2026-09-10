

# INestTWAPFeeManager

The interface for the Nest TWAP-deviation fee manager

Manages a dynamic fee that grows with the deviation of the current tick from the TWAP tick.
The pre-swap fee is charged to the complete swap; economic suitability is assessed separately for
the relevant liquidity, execution path and external-market conditions.

**Inherits:** [IAlgebraDynamicFeePlugin](../../Core/interfaces/plugin/IAlgebraDynamicFeePlugin.md)

## Events
### DeviationFeeConfigChanged

```solidity
event DeviationFeeConfigChanged(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow)
```

Emitted when the deviation fee configuration is changed

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseFee | uint16 | The fee charged on all swaps, in hundredths of a bip (1e-6) |
| feeCap | uint16 | The maximum total fee, in hundredths of a bip (1e-6) |
| scalingFactor | uint64 | Extra fee per tick of deviation, scaled by SCALING_PRECISION |
| twapWindow | uint32 | The TWAP lookback window, in seconds |

## Functions
### deviationFeeConfig

```solidity
function deviationFeeConfig() external view returns (uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow)
```
**Selector**: `0x393dcdf5`

Current deviation fee configuration

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseFee | uint16 | The fee charged on all swaps, in hundredths of a bip (1e-6) |
| feeCap | uint16 | The maximum total fee, in hundredths of a bip (1e-6) |
| scalingFactor | uint64 | Extra fee per tick of deviation, scaled by SCALING_PRECISION. 0 disables the dynamic part |
| twapWindow | uint32 | The TWAP lookback window, in seconds |

### getTwapTick

```solidity
function getTwapTick() external view returns (int24 twapTick, bool available)
```
**Selector**: `0xbf4365be`

Returns the time-weighted average tick over the configured window

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| twapTick | int24 | The TWAP tick |
| available | bool | False if the oracle does not yet cover the window (fee falls back to baseFee) |

### isTwapReady

```solidity
function isTwapReady(uint32 window) external view returns (bool)
```
**Selector**: `0xa294277c`

True when stored timepoint history covers &#x60;window&#x60; seconds.

| Name | Type | Description |
| ---- | ---- | ----------- |
| window | uint32 |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool |  |

### setDeviationFeeConfig

```solidity
function setDeviationFeeConfig(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow) external
```
**Selector**: `0xfa0c811f`

Changes the deviation fee configuration for the pool

*Developer note: Callable by the plugin factory or holders of the &#x60;DEVIATION_FEE_MANAGER&#x60; role.*

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseFee | uint16 |  |
| feeCap | uint16 |  |
| scalingFactor | uint64 |  |
| twapWindow | uint32 |  |

