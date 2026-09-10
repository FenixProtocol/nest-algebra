

# IBaseV1PluginFactory

Interface for the Algebra base V1 plugin factory

Creates Algebra base V1 plugins for standard, existing, and custom pools.

**Inherits:** [INestFeePluginFactory](INestFeePluginFactory.md)

## Events
### DefaultFeeConfiguration

```solidity
event DefaultFeeConfiguration(struct AlgebraFeeConfiguration newConfig)
```

Emitted when the default fee configuration is changed.

| Name | Type | Description |
| ---- | ---- | ----------- |
| newConfig | struct AlgebraFeeConfiguration |  |

## Functions
### defaultFeeConfiguration

```solidity
function defaultFeeConfiguration() external view returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee)
```
**Selector**: `0x4e09a96a`

Current default dynamic fee configuration for newly created plugins.

**Returns:**

| Name | Type | Description |
| ---- | ---- | ----------- |
| alpha1 | uint16 |  |
| alpha2 | uint16 |  |
| beta1 | uint32 |  |
| beta2 | uint32 |  |
| gamma1 | uint16 |  |
| gamma2 | uint16 |  |
| baseFee | uint16 |  |

### setDefaultFeeConfiguration

```solidity
function setDefaultFeeConfiguration(struct AlgebraFeeConfiguration newConfig) external
```
**Selector**: `0xf718949a`

Changes initial fee configuration for new plugins.

| Name | Type | Description |
| ---- | ---- | ----------- |
| newConfig | struct AlgebraFeeConfiguration |  |

