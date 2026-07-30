# CustomPoolPluginFactory

`CustomPoolPluginFactory` is the plugin package entry point for deploying Algebra custom pools with a default Algebra base plugin.

The contract is an edited copy of `src/plugin/contracts/BasePluginV1Factory.sol` adapted for custom pool creation. It keeps the base
plugin factory behavior for beacon-proxy plugin deployment and default dynamic fee configuration, but routes pool creation through
`AlgebraCustomPoolEntryPoint` and the Algebra core custom-pool flow.

## Required Parameters

`initialize(factory, algebraCustomPoolEntryPoint, pluginImplementation)` must be called through the upgradeable proxy initializer.

| Name | Description |
| ---- | ----------- |
| `factory` | The Algebra core factory address. It is used to compute custom pool addresses and create pools through the core custom pool flow. |
| `algebraCustomPoolEntryPoint` | The periphery entry point used by this contract to request custom pool creation and later manage custom pool parameters. |
| `pluginImplementation` | The `AlgebraBasePluginV1` implementation used by the beacon proxies created for new custom pools. |

The deployment setup must also configure permissions on the Algebra core factory:

| Permission | Required holder | Reason |
| ---------- | --------------- | ------ |
| `CUSTOM_POOL_DEPLOYER` | `AlgebraCustomPoolEntryPoint` | Allows the entry point to call `AlgebraFactoryUpgradeable.createCustomPool`. |
| `POOLS_ADMINISTRATOR_ROLE` | `AlgebraCustomPoolEntryPoint` | Allows the entry point to call permissioned pool setters on custom pools. |

## Custom Pool Creation

The main function is:

```solidity
deployCustomPool(address tokenA, address tokenB, bytes data)
```

Before creating a pool, the contract checks:

- If public creation mode is disabled, the caller must have `CUSTOM_POOL_DEPLOYER`.
- `tokenA` and `tokenB` must both be whitelisted.
- The token pair must be valid and not already in a pending creation flow.

The `data` parameter is forwarded through the custom pool hook flow and included in hook validation, but it is not interpreted by
`CustomPoolPluginFactory` for now.

During creation, the factory:

1. Computes the expected custom pool address through the Algebra core factory.
2. Calls `AlgebraCustomPoolEntryPoint.createCustomPool`.
3. Receives `beforeCreatePoolHook` from the entry point.
4. Deploys a new beacon-proxy `AlgebraBasePluginV1` plugin for the expected pool.
5. Receives `afterCreatePoolHook` from the entry point and verifies the pool, plugin, and deployer.

## Admin Controls

`CustomPoolPluginFactory` is upgradeable and owned through `Ownable2StepUpgradeable`. The owner is the admin for factory configuration and
custom-pool management.

The owner can:

- Enable or disable public custom pool creation with `setPublicPoolCreationMode`.
- Add or remove a single whitelisted token with `setTokenWhitelist`.
- Add or remove a batch of whitelisted tokens with `setTokenWhitelistBatch`.
- Change the default fee configuration applied to newly deployed plugins with `setDefaultFeeConfiguration`.
- Upgrade the beacon implementation used by plugin proxies with `upgradeTo`.

The contract also has admin access over custom pools created through it. For those pools, the owner can call:

- `setTickSpacing`
- `setPlugin`
- `setPluginConfig`
- `setFee`

These functions forward through `AlgebraCustomPoolEntryPoint`, so they only work for pools created by this `CustomPoolPluginFactory` and when
the entry point has the required Algebra core factory administrator role.

## Plugin Deployment

Each custom pool receives a plugin deployed as:

```solidity
new BeaconProxy(address(this), '')
```

The proxy uses `CustomPoolPluginFactory` as the beacon. After deployment, the plugin is initialized with:

```solidity
initialize(pool, factory, address(this))
```

Then the current `defaultFeeConfiguration` is applied through `changeFeeConfiguration`.

`createPlugin` is still implemented because `CustomPoolPluginFactory` implements `IAlgebraPluginFactory`, but it is deprecated for this
contract and always reverts.
