

# IAlgebraPluginFactory

An interface for a contract that is capable of deploying Algebra plugins

*Developer note: Such a factory is needed if the plugin should be automatically created and connected to each new pool*

## Functions
### createPlugin

```solidity
function createPlugin(address pool, address token0, address token1) external returns (address)
```
**Selector**: `0x9533ff10`

Deploys new plugin contract for pool

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address | The address of the pool for which the new plugin will be created |
| token0 | address | First token of the pool |
| token1 | address | Second token of the pool |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | New plugin address |

### beforeCreatePoolHook

```solidity
function beforeCreatePoolHook(address pool, address creator, address deployer, address token0, address token1, bytes data) external returns (address)
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
| [0] | address | New plugin address |

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

