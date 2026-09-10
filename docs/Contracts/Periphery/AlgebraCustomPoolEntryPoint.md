

# AlgebraCustomPoolEntryPoint

Algebra custom pool entry point

Is used to create and manage custom pools

**Inherits:** [IAlgebraCustomPoolEntryPoint](interfaces/IAlgebraCustomPoolEntryPoint.md) [Ownable2Step](https://docs.openzeppelin.com/contracts/4.x/)
## Modifiers
### onlyCustomDeployer

```solidity
modifier onlyCustomDeployer(address pool)
```

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address |  |

## Public variables
### factory
```solidity
address immutable factory
```
**Selector**: `0xc45a0155`

Returns the address of the corresponding AlgebraFactory contract

### isCustomPoolDeployer
```solidity
mapping(address => bool) isCustomPoolDeployer
```
**Selector**: `0xd85bf23d`

Returns whether a deployer can create custom pools

## Functions
### constructor

```solidity
constructor(address _factory) public
```

| Name | Type | Description |
| ---- | ---- | ----------- |
| _factory | address |  |

### createCustomPool

```solidity
function createCustomPool(address deployer, address creator, address tokenA, address tokenB, bytes data) external returns (address customPool)
```
**Selector**: `0xdbbf3db4`

Creates a custom pool

| Name | Type | Description |
| ---- | ---- | ----------- |
| deployer | address | The plugin deployer, also used for custom pool address calculation |
| creator | address | The initiator of custom pool creation |
| tokenA | address | One of the two tokens in the desired pool |
| tokenB | address | The other of the two tokens in the desired pool |
| data | bytes | Additional data for plugin creation |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| customPool | address | The newly created custom pool |

### setCustomPoolDeployer

```solidity
function setCustomPoolDeployer(address deployer, bool allowed) external
```
**Selector**: `0xf108bb6d`

Changes a custom pool deployer whitelist status

| Name | Type | Description |
| ---- | ---- | ----------- |
| deployer | address | The custom pool deployer address |
| allowed | bool | Whether the deployer should be whitelisted |

### setCustomPoolDeployerBatch

```solidity
function setCustomPoolDeployerBatch(address[] deployers, bool allowed) external
```
**Selector**: `0x32cd5777`

Changes whitelist status for a batch of custom pool deployers

| Name | Type | Description |
| ---- | ---- | ----------- |
| deployers | address[] | The custom pool deployer addresses |
| allowed | bool | Whether the deployers should be whitelisted |

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

### setTickSpacing

```solidity
function setTickSpacing(address pool, int24 newTickSpacing) external
```
**Selector**: `0x4bf092cd`

Changes the tick spacing value in a custom pool

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address |  |
| newTickSpacing | int24 |  |

### setPlugin

```solidity
function setPlugin(address pool, address newPluginAddress) external
```
**Selector**: `0xf9f4c09a`

Changes the plugin address in a custom pool

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address |  |
| newPluginAddress | address |  |

### setPluginConfig

```solidity
function setPluginConfig(address pool, uint8 newConfig) external
```
**Selector**: `0x054bee3d`

Changes the plugin configuration in a custom pool

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address |  |
| newConfig | uint8 |  |

### setFee

```solidity
function setFee(address pool, uint16 newFee) external
```
**Selector**: `0x337f3a31`

Changes the fee value in a custom pool

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address |  |
| newFee | uint16 |  |

### createPlugin

```solidity
function createPlugin(address, address, address) external pure returns (address)
```
**Selector**: `0x9533ff10`

*Developer note: Just implementation of the function from IAlgebraPluginFactory to not create new additional interface*

| Name | Type | Description |
| ---- | ---- | ----------- |
|  | address |  |
|  | address |  |
|  | address |  |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address |  |

