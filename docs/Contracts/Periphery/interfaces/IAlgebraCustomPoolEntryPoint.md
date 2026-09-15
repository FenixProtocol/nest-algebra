

# IAlgebraCustomPoolEntryPoint

An interface for a contract that deploys and manages Algebra custom pools

**Inherits:** [IAlgebraPluginFactory](../../Core/interfaces/plugin/IAlgebraPluginFactory.md)

## Events
### CustomPoolDeployer

```solidity
event CustomPoolDeployer(address deployer, bool allowed)
```

Emitted when a custom pool deployer whitelist status is changed

| Name | Type | Description |
| ---- | ---- | ----------- |
| deployer | address | The custom pool deployer address |
| allowed | bool | Whether the deployer is whitelisted |

## Functions
### factory

```solidity
function factory() external view returns (address factory)
```
**Selector**: `0xc45a0155`

Returns the address of the corresponding AlgebraFactory contract

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| factory | address | The address of AlgebraFactory |

### isCustomPoolDeployer

```solidity
function isCustomPoolDeployer(address deployer) external view returns (bool)
```
**Selector**: `0xd85bf23d`

Returns whether a deployer can create custom pools

| Name | Type | Description |
| ---- | ---- | ----------- |
| deployer | address | The custom pool deployer address |

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool Whether the deployer is whitelisted |

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

