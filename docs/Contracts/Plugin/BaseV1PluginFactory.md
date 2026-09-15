# BaseV1PluginFactory

`BaseV1PluginFactory` deploys default Algebra base plugins for standard, existing, and custom pools.

The contract extends `NestFeePluginFactory` to share beacon management, governance, standard-pool plugin creation, and the
`AlgebraCustomPoolEntryPoint` flow. It overrides plugin creation to initialize `AlgebraBasePluginV1` and apply its adaptive fee configuration.

## Required Parameters

These parameters are passed to the constructor.

| Name                          | Description                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `algebraFactory`              | The Algebra core factory address. It is used to create standard-pool plugins and compute custom pool addresses.          |
| `algebraCustomPoolEntryPoint` | The periphery entry point used by this contract to request custom pool creation and later manage custom pool parameters. |
| `pluginImplementation`        | The `AlgebraBasePluginV1` implementation used by the beacon proxies created for new custom pools.                        |

The deployment setup must also configure permissions on the Algebra core factory:

| Permission                 | Required holder               | Reason                                                                       |
| -------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `CUSTOM_POOL_DEPLOYER`     | `AlgebraCustomPoolEntryPoint` | Allows the entry point to call `AlgebraFactoryUpgradeable.createCustomPool`. |
| `POOLS_ADMINISTRATOR_ROLE` | `AlgebraCustomPoolEntryPoint` | Allows the entry point to call permissioned pool setters on custom pools.    |

## Custom Pool Creation

The main function is:

```solidity
deployCustomPool(address tokenA, address tokenB, bytes data)
```

Before creating a pool, the contract checks:

- If public creation mode is disabled, the caller must have `CUSTOM_POOL_DEPLOYER`.
- The token pair must be valid and not already in a pending creation flow.

The factory does not restrict custom-pool creation by token address.

The `data` parameter is forwarded through the custom pool hook flow and included in hook validation, but it is not interpreted by
`BaseV1PluginFactory` for now.

During creation, the factory:

1. Computes the expected custom pool address through the Algebra core factory.
2. Calls `AlgebraCustomPoolEntryPoint.createCustomPool`.
3. Receives `beforeCreatePoolHook` from the entry point.
4. Deploys a new beacon-proxy `AlgebraBasePluginV1` plugin for the expected pool.
5. Receives `afterCreatePoolHook` from the entry point and verifies the pool, plugin, and deployer.

## Admin Controls

`BaseV1PluginFactory` is deployed directly and owned through `Ownable2Step`. Its beacon implementation remains upgradeable.

The owner can:

- Enable or disable public custom pool creation with `setPublicPoolCreationMode`.

An account authorized through the Algebra factory's `ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR` role (or the Algebra factory owner) can:

- Change the default fee configuration applied to newly deployed plugins with `setDefaultFeeConfiguration`.
- Change the farming address with `setFarmingAddress`.
- Upgrade the beacon implementation used by plugin proxies with `upgradeTo`.

The contract also has admin access over custom pools created through it. For those pools, the owner can call:

- `setTickSpacing`
- `setPlugin`
- `setPluginConfig`
- `setFee`

These functions forward through `AlgebraCustomPoolEntryPoint`, so they only work for pools created by this `BaseV1PluginFactory` and when
the entry point has the required Algebra core factory administrator role.

## Plugin Deployment

Each custom pool receives a plugin deployed as:

```solidity
new BeaconProxy(address(this), '')
```

The proxy uses `BaseV1PluginFactory` as the beacon. After deployment, the plugin is initialized with:

```solidity
initialize(pool, algebraFactory, address(this))
```

Then the current `defaultFeeConfiguration` is applied through `changeFeeConfiguration`.

`createPlugin` supports standard pools when this contract is configured as the Algebra factory's default plugin factory.
`createPluginForExistingPool` creates a plugin for an already deployed standard pool.
