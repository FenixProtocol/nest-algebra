

# INestTWAPFeePlugin

The interface for the NestTWAPFeePlugin

This contract combines the standard volatility oracle and a TWAP-deviation based dynamic fee

*Developer note: The fee is recalculated on every swap:
fee &#x3D; min(baseFee + scalingFactor * |tick - twapTick| / SCALING_PRECISION, feeCap)*

**Inherits:** [IVolatilityOracle](plugins/IVolatilityOracle.md) [INestTWAPFeeManager](INestTWAPFeeManager.md) [IFarmingPlugin](plugins/IFarmingPlugin.md)

## Functions
### initialize

```solidity
function initialize() external
```
**Selector**: `0x8129fc1c`

Initialize the plugin externally

*Developer note: This function allows to initialize the plugin if it was created after the pool was created*

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

