

# INestFeePluginFactory

Shared interface for the Nest fee-plugin factories

A factory creates one current Nest TWAP or MEV beacon-proxy plugin per Algebra pool.

**Inherits:** [IAlgebraPluginFactory](../../Core/interfaces/plugin/IAlgebraPluginFactory.md) [IBeacon](https://docs.openzeppelin.com/contracts/4.x/)

## Events
### PublicPoolCreationMode

```solidity
event PublicPoolCreationMode(bool mode)
```

Emitted when public custom-pool creation mode changes.

| Name | Type | Description |
| ---- | ---- | ----------- |
| mode | bool |  |

### DefaultDeviationFeeConfiguration

```solidity
event DefaultDeviationFeeConfiguration(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow)
```

Emitted when the default deviation fee configuration is changed

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseFee | uint16 | The default fee charged on all swaps, in hundredths of a bip (1e-6) |
| feeCap | uint16 | The default maximum total fee, in hundredths of a bip (1e-6) |
| scalingFactor | uint64 | The default extra fee per tick of deviation, scaled by 1e6 |
| twapWindow | uint32 | The default TWAP lookback window, in seconds |

### FarmingAddress

```solidity
event FarmingAddress(address newFarmingAddress)
```

Emitted when the farming address is changed

| Name | Type | Description |
| ---- | ---- | ----------- |
| newFarmingAddress | address | The farming address after the address was changed |

### Upgraded

```solidity
event Upgraded(address implementation)
```

*Developer note: Emitted when the implementation returned by the beacon is changed.*

| Name | Type | Description |
| ---- | ---- | ----------- |
| implementation | address | The new implementation address after changed |

## Functions
### ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR

```solidity
function ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR() external pure returns (bytes32)
```
**Selector**: `0xcddff269`

The hash of &#x27;ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR&#x27; used as role

*Developer note: Identifies the role authorized to change Nest fee-plugin factory settings.*

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 |  |

### CUSTOM_POOL_DEPLOYER

```solidity
function CUSTOM_POOL_DEPLOYER() external pure returns (bytes32)
```
**Selector**: `0x07810754`

Role allowed to create custom pools while public creation is disabled.

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 |  |

### algebraFactory

```solidity
function algebraFactory() external view returns (address)
```
**Selector**: `0xa7b64b04`

Returns the address of AlgebraFactory

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The AlgebraFactory contract address |

### algebraCustomPoolEntryPoint

```solidity
function algebraCustomPoolEntryPoint() external view returns (address)
```
**Selector**: `0x8efc190e`

Algebra custom-pool entry point used by this factory.

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address |  |

### isPublicPoolCreationMode

```solidity
function isPublicPoolCreationMode() external view returns (bool)
```
**Selector**: `0x63d21273`

Whether callers without CUSTOM_POOL_DEPLOYER may create custom pools.

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool |  |

### defaultDeviationFeeConfiguration

```solidity
function defaultDeviationFeeConfiguration() external view returns (uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow)
```
**Selector**: `0x8e0d00ae`

Current default deviation fee configuration, set in new plugins at creation

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseFee | uint16 |  |
| feeCap | uint16 |  |
| scalingFactor | uint64 |  |
| twapWindow | uint32 |  |

### farmingAddress

```solidity
function farmingAddress() external view returns (address)
```
**Selector**: `0x8a2ade58`

Returns current farming address

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The farming contract address |

### pluginByPool

```solidity
function pluginByPool(address pool) external view returns (address)
```
**Selector**: `0xcdef16f6`

Returns address of plugin created for given AlgebraPool

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address | The address of AlgebraPool |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The address of corresponding plugin |

### isCustomPool

```solidity
function isCustomPool(address pool) external view returns (bool)
```
**Selector**: `0x9853708d`

Whether a pool was created through this factory&#x27;s custom-pool flow.

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool |  |

### deployCustomPool

```solidity
function deployCustomPool(address tokenA, address tokenB, bytes data) external returns (address customPool)
```
**Selector**: `0xa0149a1b`

Deploys a custom pool and its Nest fee plugin through the configured entry point.

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenA | address |  |
| tokenB | address |  |
| data | bytes |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| customPool | address |  |

### createPluginForExistingPool

```solidity
function createPluginForExistingPool(address token0, address token1) external returns (address)
```
**Selector**: `0x27733026`

Create plugin for already existing pool

| Name | Type | Description |
| ---- | ---- | ----------- |
| token0 | address | The address of first token in pool |
| token1 | address | The address of second token in pool |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The address of created plugin |

### setTickSpacing

```solidity
function setTickSpacing(address pool, int24 newTickSpacing) external
```
**Selector**: `0x4bf092cd`

Changes tick spacing for a custom pool created by this factory.

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address |  |
| newTickSpacing | int24 |  |

### setPlugin

```solidity
function setPlugin(address pool, address newPluginAddress) external
```
**Selector**: `0xf9f4c09a`

Changes the attached plugin for a custom pool created by this factory.

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address |  |
| newPluginAddress | address |  |

### setPluginConfig

```solidity
function setPluginConfig(address pool, uint8 newConfig) external
```
**Selector**: `0x054bee3d`

Changes plugin flags for a custom pool created by this factory.

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address |  |
| newConfig | uint8 |  |

### setFee

```solidity
function setFee(address pool, uint16 newFee) external
```
**Selector**: `0x337f3a31`

Changes the static fee for a custom pool created by this factory.

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address |  |
| newFee | uint16 |  |

### setPublicPoolCreationMode

```solidity
function setPublicPoolCreationMode(bool mode) external
```
**Selector**: `0xfd182714`

Changes public custom-pool creation mode.

| Name | Type | Description |
| ---- | ---- | ----------- |
| mode | bool |  |

### setDefaultDeviationFeeConfiguration

```solidity
function setDefaultDeviationFeeConfiguration(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow) external
```
**Selector**: `0x443dd6f1`

Changes the default deviation fee configuration for new plugins

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseFee | uint16 |  |
| feeCap | uint16 |  |
| scalingFactor | uint64 |  |
| twapWindow | uint32 |  |

### setFarmingAddress

```solidity
function setFarmingAddress(address newFarmingAddress) external
```
**Selector**: `0xb001f618`

*Developer note: updates farmings manager address on the factory*

| Name | Type | Description |
| ---- | ---- | ----------- |
| newFarmingAddress | address | The new tokenomics contract address |

### upgradeTo

```solidity
function upgradeTo(address newImplementation) external
```
**Selector**: `0x3659cfe6`

Updates the beacon implementation used by all plugins from this factory.

*Developer note: Callable only by an Algebra base-plugin factory administrator.*

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImplementation | address |  |

## Errors
## BeaconInvalidImplementation

```solidity
error BeaconInvalidImplementation(address implementation)
```
**Selector**: `0x847ac564`

*Developer note: The &#x60;implementation&#x60; of the beacon is invalid.*

| Name | Type | Description |
| ---- | ---- | ----------- |
| implementation | address |  |

