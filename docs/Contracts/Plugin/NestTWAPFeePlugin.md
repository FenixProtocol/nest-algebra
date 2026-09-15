

# NestTWAPFeePlugin

Nest self-TWAP fee plugin

Independently deployable Nest MEV-resistant fee. Stores timepoints and computes a dynamic fee from the deviation
of the current tick from the pool&#x27;s OWN TWAP:
fee &#x3D; min(baseFee + scalingFactor * |tick - twapTick| / SCALING_PRECISION, feeCap)
This mode is fully self-contained and has no external price dependency. NestMEVFeePlugin inherits
this implementation and adds the optional HyperCore spot-referenced fee term.

*Developer note: The fee is recalculated on every swap, including swaps within the same block. The resulting
fee is charged to the complete swap at its pre-swap value.
Economic protection depends on liquidity, trade size, execution path and external-market costs;
the configured slope alone is not a profitability proof.*

**Inherits:** [INestTWAPFeePlugin](interfaces/INestTWAPFeePlugin.md) [IAlgebraPlugin](../Core/interfaces/plugin/IAlgebraPlugin.md) [Initializable](https://docs.openzeppelin.com/contracts/4.x/) TimestampUpgradeable
## Modifiers
### onlyPool

```solidity
modifier onlyPool()
```

## Public variables
### DEVIATION_FEE_MANAGER
```solidity
bytes32 constant DEVIATION_FEE_MANAGER = 0x56d824eac3f5b24be53b94372785923a39fd403d3d2d887c343578adcf369962
```
**Selector**: `0xf818b649`

*Developer note: Dedicated role so fee control is separable from the shared base-plugin ops key. Grant in AlgebraFactory.*

### SCALING_PRECISION
```solidity
uint256 constant SCALING_PRECISION = 1e6
```
**Selector**: `0xd06152dd`

scalingFactor / SCALING_PRECISION &#x3D; fee units (1e-6) added per tick of deviation.
One tick is approximately 1bp of price, or 100 fee units. A value of
100 * SCALING_PRECISION is therefore the normalized arithmetic slope benchmark; it is not
an economic break-even claim for a complete trade.

### MAX_SCALING_FACTOR
```solidity
uint256 constant MAX_SCALING_FACTOR
```
**Selector**: `0x448384b8`

Maximum normalized slope is 1.0 (100 fee-units per raw tick).

### MAX_BASE_FEE
```solidity
uint16 constant MAX_BASE_FEE = 30_000
```
**Selector**: `0x98cc7a37`

### MAX_FEE_CAP
```solidity
uint16 constant MAX_FEE_CAP = 50_000
```
**Selector**: `0xd71b77ae`

### MIN_TWAP_WINDOW
```solidity
uint32 constant MIN_TWAP_WINDOW = 60
```
**Selector**: `0x1a65893b`

### MAX_TWAP_WINDOW
```solidity
uint32 constant MAX_TWAP_WINDOW = 12
```
**Selector**: `0xb88a92b4`

### defaultPluginConfig
```solidity
uint8 constant defaultPluginConfig
```
**Selector**: `0x689ea370`

Returns plugin config

### pool
```solidity
address pool
```
**Selector**: `0x16f0115b`

Returns the address of the pool the plugin is created for

### timepoints
```solidity
struct VolatilityOracle.Timepoint[65536] timepoints
```
**Selector**: `0x74eceae6`

Returns data belonging to a certain timepoint

*Developer note: There is more convenient function to fetch a timepoint: getTimepoints(). Which requires not an index but seconds*

### timepointIndex
```solidity
uint16 timepointIndex
```
**Selector**: `0x0786feb6`

Returns the index of the last timepoint that was written.

### lastTimepointTimestamp
```solidity
uint32 lastTimepointTimestamp
```
**Selector**: `0xf5985d35`

Returns the timestamp of the last timepoint that was written.

### isInitialized
```solidity
bool isInitialized
```
**Selector**: `0x392e53cd`

Returns information about whether oracle is initialized

### incentive
```solidity
address incentive
```
**Selector**: `0x1d4632ac`

Returns the address of active incentive

*Developer note: if there is no active incentive at the moment, incentiveAddress would be equal to address(0)*

## Functions
### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize(address _pool, address _factory, address _pluginFactory) external
```
**Selector**: `0xc0c53b8b`

Initialize factory-created proxy storage.

*Developer note: Callable only once and only by the plugin factory declared in the arguments.*

| Name | Type | Description |
| ---- | ---- | ----------- |
| _pool | address |  |
| _factory | address |  |
| _pluginFactory | address |  |

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

### initialize

```solidity
function initialize() external
```
**Selector**: `0x8129fc1c`

Initialize the plugin externally

*Developer note: This function allows to initialize the plugin if it was created after the pool was created*

### getSingleTimepoint

```solidity
function getSingleTimepoint(uint32 secondsAgo) external view returns (int56 tickCumulative, uint88 volatilityCumulative)
```
**Selector**: `0x88f2e862`

*Developer note: Reverts if a timepoint at or before the desired timepoint timestamp does not exist.
0 may be passed as &#x60;secondsAgo&#x27; to return the current cumulative values.
If called with a timestamp falling between two timepoints, returns the counterfactual accumulator values
at exactly the timestamp between the two timepoints.
&#x60;volatilityCumulative&#x60; values for timestamps after the last timepoint _should not_ be compared because they may differ due to interpolation errors*

| Name | Type | Description |
| ---- | ---- | ----------- |
| secondsAgo | uint32 | The amount of time to look back, in seconds, at which point to return a timepoint |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| tickCumulative | int56 | The cumulative tick since the pool was first initialized, as of `secondsAgo` |
| volatilityCumulative | uint88 | The cumulative volatility value since the pool was first initialized, as of `secondsAgo` |

### getTimepoints

```solidity
function getTimepoints(uint32[] secondsAgos) external view returns (int56[] tickCumulatives, uint88[] volatilityCumulatives)
```
**Selector**: `0x9d3a5241`

Returns the accumulator values as of each time seconds ago from the given time in the array of &#x60;secondsAgos&#x60;

*Developer note: Reverts if &#x60;secondsAgos&#x60; &gt; oldest timepoint
&#x60;volatilityCumulative&#x60; values for timestamps after the last timepoint _should not_ be compared because they may differ due to interpolation errors*

| Name | Type | Description |
| ---- | ---- | ----------- |
| secondsAgos | uint32[] | Each amount of time to look back, in seconds, at which point to return a timepoint |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| tickCumulatives | int56[] | The cumulative tick since the pool was first initialized, as of each `secondsAgo` |
| volatilityCumulatives | uint88[] | The cumulative volatility values since the pool was first initialized, as of each `secondsAgo` |

### prepayTimepointsStorageSlots

```solidity
function prepayTimepointsStorageSlots(uint16 startIndex, uint16 amount) external
```
**Selector**: `0xda705235`

Fills uninitialized timepoints with nonzero value

*Developer note: Can be used to reduce the gas cost of future swaps*

| Name | Type | Description |
| ---- | ---- | ----------- |
| startIndex | uint16 | The start index, must be not initialized |
| amount | uint16 | of slots to fill, startIndex + amount must be <= type(uint16).max |

### setDeviationFeeConfig

```solidity
function setDeviationFeeConfig(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow) external virtual
```
**Selector**: `0xfa0c811f`

Changes the deviation fee configuration for the pool

*Developer note: &#x60;virtual&#x60;, delegating to an &#x60;internal _setDeviationFeeConfig&#x60;, so NestMEVFeePlugin can wrap it with
the symmetric oracle-armed guard. The standalone Nest TWAP product has no override.*

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseFee | uint16 |  |
| feeCap | uint16 |  |
| scalingFactor | uint64 |  |
| twapWindow | uint32 |  |

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
function isTwapReady(uint32 window) public view returns (bool)
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

### getCurrentFee

```solidity
function getCurrentFee() external view returns (uint16 fee)
```
**Selector**: `0xf70d9362`

Returns fee from plugin

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| fee | uint16 | The pool fee value in hundredths of a bip, i.e. 1e-6 |

### setIncentive

```solidity
function setIncentive(address newIncentive) external
```
**Selector**: `0x7c1fe0c8`

Connects or disconnects an incentive.

*Developer note: Only farming can connect incentives.
The one who connected it and the current farming has the right to disconnect the incentive.*

| Name | Type | Description |
| ---- | ---- | ----------- |
| newIncentive | address | The address associated with the incentive or zero address |

### isIncentiveConnected

```solidity
function isIncentiveConnected(address targetIncentive) external view returns (bool)
```
**Selector**: `0xe63015f0`

Checks if the incentive is connected to pool

*Developer note: Returns false if the plugin has a different incentive set, the plugin is not connected to the pool,
or the plugin configuration is incorrect.*

| Name | Type | Description |
| ---- | ---- | ----------- |
| targetIncentive | address | The address of the incentive to be checked |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | Indicates whether the target incentive is active |

### beforeInitialize

```solidity
function beforeInitialize(address, uint160) external returns (bytes4)
```
**Selector**: `0x636fd804`

| Name | Type | Description |
| ---- | ---- | ----------- |
|  | address |  |
|  | uint160 |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes4 |  |

### afterInitialize

```solidity
function afterInitialize(address, uint160, int24 tick) external returns (bytes4)
```
**Selector**: `0x82dd6522`

| Name | Type | Description |
| ---- | ---- | ----------- |
|  | address |  |
|  | uint160 |  |
| tick | int24 |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes4 |  |

### beforeModifyPosition

```solidity
function beforeModifyPosition(address, address, int24, int24, int128, bytes) external returns (bytes4)
```
**Selector**: `0x5e2411b2`

| Name | Type | Description |
| ---- | ---- | ----------- |
|  | address |  |
|  | address |  |
|  | int24 |  |
|  | int24 |  |
|  | int128 |  |
|  | bytes |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes4 |  |

### afterModifyPosition

```solidity
function afterModifyPosition(address, address, int24, int24, int128, uint256, uint256, bytes) external returns (bytes4)
```
**Selector**: `0xd6852010`

*Developer note: unused*

| Name | Type | Description |
| ---- | ---- | ----------- |
|  | address |  |
|  | address |  |
|  | int24 |  |
|  | int24 |  |
|  | int128 |  |
|  | uint256 |  |
|  | uint256 |  |
|  | bytes |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes4 |  |

### beforeSwap

```solidity
function beforeSwap(address, address, bool, int256, uint160, bool, bytes) external returns (bytes4)
```
**Selector**: `0x029c1cb7`

| Name | Type | Description |
| ---- | ---- | ----------- |
|  | address |  |
|  | address |  |
|  | bool |  |
|  | int256 |  |
|  | uint160 |  |
|  | bool |  |
|  | bytes |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes4 |  |

### afterSwap

```solidity
function afterSwap(address, address, bool zeroToOne, int256, uint160, int256, int256, bytes) external returns (bytes4)
```
**Selector**: `0x9cb5a963`

| Name | Type | Description |
| ---- | ---- | ----------- |
|  | address |  |
|  | address |  |
| zeroToOne | bool |  |
|  | int256 |  |
|  | uint160 |  |
|  | int256 |  |
|  | int256 |  |
|  | bytes |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes4 |  |

### beforeFlash

```solidity
function beforeFlash(address, address, uint256, uint256, bytes) external returns (bytes4)
```
**Selector**: `0x8de0a8ee`

| Name | Type | Description |
| ---- | ---- | ----------- |
|  | address |  |
|  | address |  |
|  | uint256 |  |
|  | uint256 |  |
|  | bytes |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes4 |  |

### afterFlash

```solidity
function afterFlash(address, address, uint256, uint256, uint256, uint256, bytes) external returns (bytes4)
```
**Selector**: `0x343d37ff`

*Developer note: unused*

| Name | Type | Description |
| ---- | ---- | ----------- |
|  | address |  |
|  | address |  |
|  | uint256 |  |
|  | uint256 |  |
|  | uint256 |  |
|  | uint256 |  |
|  | bytes |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes4 |  |

