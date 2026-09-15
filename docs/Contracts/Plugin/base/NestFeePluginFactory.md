

# NestFeePluginFactory

Shared Nest fee-plugin factory implementation

Creates Nest fee plugins for standard, existing, and custom Algebra pools.

**Inherits:** [INestFeePluginFactory](../interfaces/INestFeePluginFactory.md) [AccessControlEnumerable](https://docs.openzeppelin.com/contracts/4.x/) [Ownable2Step](https://docs.openzeppelin.com/contracts/4.x/)
## Modifiers
### onlyAdministrator

```solidity
modifier onlyAdministrator()
```

## Structs
### DeviationFeeConfig

```solidity
struct DeviationFeeConfig {
  uint16 baseFee;
  uint16 feeCap;
  uint64 scalingFactor;
  uint32 twapWindow;
}
```

### PendingCustomPool

```solidity
struct PendingCustomPool {
  address creator;
  address token0;
  address token1;
  address plugin;
  bytes32 dataHash;
}
```

## Public variables
### ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR
```solidity
bytes32 constant ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = 0x267da724c255813ae00f4522fe843cb70148a4b8099cbc5af64f9a4151e55ed6
```
**Selector**: `0xcddff269`

The hash of &#x27;ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR&#x27; used as role

*Developer note: Identifies the role authorized to change Nest fee-plugin factory settings.*

### CUSTOM_POOL_DEPLOYER
```solidity
bytes32 constant CUSTOM_POOL_DEPLOYER = 0xc9cf812513d9983585eb40fcfe6fd49fbb6a45815663ec33b30a6c6c7de3683b
```
**Selector**: `0x07810754`

Role allowed to create custom pools while public creation is disabled.

### algebraFactory
```solidity
address immutable algebraFactory
```
**Selector**: `0xa7b64b04`

Returns the address of AlgebraFactory

### algebraCustomPoolEntryPoint
```solidity
address immutable algebraCustomPoolEntryPoint
```
**Selector**: `0x8efc190e`

Algebra custom-pool entry point used by this factory.

### implementation
```solidity
address implementation
```
**Selector**: `0x5c60da1b`

*Developer note: Must return an address that can be used as a delegate call target.

{BeaconProxy} will check that this address is a contract.*

### defaultDeviationFeeConfiguration
```solidity
struct NestFeePluginFactory.DeviationFeeConfig defaultDeviationFeeConfiguration
```
**Selector**: `0x8e0d00ae`

Current default deviation fee configuration, set in new plugins at creation

### farmingAddress
```solidity
address farmingAddress
```
**Selector**: `0x8a2ade58`

Returns current farming address

### isPublicPoolCreationMode
```solidity
bool isPublicPoolCreationMode
```
**Selector**: `0x63d21273`

Whether callers without CUSTOM_POOL_DEPLOYER may create custom pools.

### pluginByPool
```solidity
mapping(address => address) pluginByPool
```
**Selector**: `0xcdef16f6`

Returns address of plugin created for given AlgebraPool

### isCustomPool
```solidity
mapping(address => bool) isCustomPool
```
**Selector**: `0x9853708d`

Whether a pool was created through this factory&#x27;s custom-pool flow.

## Functions
### createPlugin

```solidity
function createPlugin(address pool, address, address) external returns (address)
```
**Selector**: `0x9533ff10`

Deploys new plugin contract for pool

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address | The address of the pool for which the new plugin will be created |
|  | address |  |
|  | address |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | New plugin address |

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

### beforeCreatePoolHook

```solidity
function beforeCreatePoolHook(address pool, address creator, address deployer, address token0, address token1, bytes data) external returns (address plugin)
```
**Selector**: `0x1d0338d9`

Called before pool creation to optionally deploy a plugin.

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address | The computed address of the new pool |
| creator | address | The address that initiated pool creation |
| deployer | address | The custom pool deployer, or address(0) for classic pools |
| token0 | address | First token of the pool |
| token1 | address | Second token of the pool |
| data | bytes | Additional data for plugin creation |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| plugin | address | New plugin address |

### afterCreatePoolHook

```solidity
function afterCreatePoolHook(address plugin, address pool, address deployer) external
```
**Selector**: `0x8d5ef8d1`

Called after pool creation.

| Name | Type | Description |
| ---- | ---- | ----------- |
| plugin | address | The plugin address |
| pool | address | The address of the new pool |
| deployer | address | The custom pool deployer, or address(0) for classic pools |

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

