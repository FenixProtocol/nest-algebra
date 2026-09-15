# Custom pools and custom pool deployers

Custom pools allow more than one Algebra pool to exist for the same token pair. A classic pool is identified by its sorted token pair. A custom pool is identified by:

- the custom pool deployer address; and
- the sorted token pair.

In the Nest deployment, a Nest fee-plugin factory such as `BaseV1PluginFactory`, `NestTWAPFeePluginFactory`, or `NestMEVFeePluginFactory` is the custom pool deployer. `AlgebraCustomPoolEntryPoint` is the trusted gateway between an approved custom deployer and the Algebra factory. These are different roles and addresses.

For every custom deployer, only one pool can exist for a given token pair. A classic pool and custom pools created by different deployers can coexist for that pair.

## Deployment and permissions

For an upgraded Algebra factory, deploy a compatible `AlgebraPoolDeployer` and call the owner-only, one-time reinitializer:

```solidity
factory.setPoolDeployer(address(newPoolDeployer));
```

Then deploy `AlgebraCustomPoolEntryPoint` with the factory address and configure the control plane:

1. Grant the entry point `factory.CUSTOM_POOL_DEPLOYER()` so it can call `factory.createCustomPool`.
2. Grant the entry point `factory.POOLS_ADMINISTRATOR_ROLE()` if custom deployers must manage pool tick spacing, plugin, plugin configuration, or fee after creation.
3. Deploy a supported Nest fee-plugin implementation and its factory. Pass both the Algebra factory and entry point addresses to the plugin-factory constructor.
4. Allowlist the plugin factory with `entryPoint.setCustomPoolDeployer(pluginFactory, true)`.

The entry point is not upgradeable, and each Nest fee-plugin factory stores its entry point as an immutable. Replacing the entry point therefore requires replacement plugin factories. Do not revoke the old entry point's pool-administrator role until pools created through it no longer require management.

Updating `poolDeployer` changes deterministic addresses for pools created afterward. Off-chain software must use the current `factory.poolDeployer()`, factory compute functions, or registry mappings instead of a hard-coded deployer address. Existing pools should be resolved from registry or indexed historical data rather than recomputed with the new deployer.

## Creating a custom pool

Custom pool creation is exposed by the approved plugin factory:

```solidity
address pool = pluginFactory.deployCustomPool(tokenA, tokenB, data);
```

Creation is private by default. The caller needs the plugin factory's `CUSTOM_POOL_DEPLOYER` role unless its owner enables public creation with:

```solidity
pluginFactory.setPublicPoolCreationMode(true);
```

Public mode on a plugin factory does not allow arbitrary deployer contracts. The entry point still requires the calling plugin factory to be allowlisted. Classic pool creation mode on `AlgebraFactoryUpgradeable` is separate.

The creation transaction performs this flow atomically:

```text
caller
  -> Nest fee-plugin factory
  -> AlgebraCustomPoolEntryPoint
  -> AlgebraFactoryUpgradeable
  -> entry point before-create hook
  -> plugin factory before-create hook and plugin deployment
  -> AlgebraPoolDeployer and pool deployment
  -> entry point after-create hook
  -> plugin factory after-create validation
  -> factory registry updates
```

The plugin factory records and validates pending creation data, including creator, sorted tokens, custom deployer, expected pool, plugin, and `data` hash. A failure in any hook or validation reverts the complete transaction.

The `data` argument is forwarded through the hook flow and authenticated by the Nest factory. The current Nest factories do not interpret it.

## Address calculation and lookup

Token arguments are sorted before address calculation. The custom-pool CREATE2 salt is:

```text
keccak256(abi.encode(customDeployer, token0, token1))
```

Use the factory APIs rather than reproducing this calculation when possible:

```solidity
address predicted = factory.computeCustomPoolAddress(customDeployer, token0, token1);
address deployed = factory.customPoolByPair(customDeployer, tokenA, tokenB);
address customDeployer = factory.deployerByPool(pool);
```

`customPoolByPair` accepts either token order. `deployerByPool` returns `address(0)` for classic and unknown pools, so use `poolByPair` when distinguishing those cases.

## Swaps, quotes, and paths

All deployer-aware periphery APIs use:

- `address(0)` for a classic pool; or
- the custom pool deployer address for a custom pool.

This applies to router single-hop parameters, Quoter and QuoterV2 single-hop parameters, and NFT mint parameters. An unknown nonzero deployer does not fall back to the classic pool.

Multi-hop paths encode a deployer for every hop:

```text
token0 | deployer0 | token1 | deployer1 | token2
```

Every field is a 20-byte address, so a path for `n` pools is `20 + n * 40` bytes. Use a zero-address deployer for each classic hop. Exact-output paths remain reversed; the deployer stays adjacent to the same token pair when reversing the route.

Legacy token-only paths are not valid with the deployer-aware router and quoters, including routes made entirely of classic pools.

## NFT positions

`INonfungiblePositionManager.MintParams` includes `deployer`. Set it to the custom deployer for a custom pool or `address(0)` for a classic pool. The selected deployer is stored in the position and returned by `positions(tokenId)`, allowing later liquidity and collection operations to resolve the same pool.

This changes the ABI and function selector for `mint` and the return layout of `positions`. Integrations must update their ABI and must not decode the old return layout.

## Managing custom pools

The owner of a Nest fee-plugin factory can manage only custom pools created through that factory:

```solidity
pluginFactory.setTickSpacing(pool, newTickSpacing);
pluginFactory.setPlugin(pool, newPlugin);
pluginFactory.setPluginConfig(pool, newConfig);
pluginFactory.setFee(pool, newFee);
```

Calls are forwarded through the entry point. They require the pool to be registered under the calling custom deployer and the entry point to hold the Algebra factory's pool-administrator permission.

## Related API documentation

- [Developer migration and ABI notes](../FOR_DEVELOPERS.md)
- [AlgebraFactoryUpgradeable](Contracts/Core/AlgebraFactoryUpgradeable.md)
- [IAlgebraFactory](Contracts/Core/interfaces/IAlgebraFactory.md)
- [AlgebraPoolDeployer](Contracts/Core/AlgebraPoolDeployer.md)
- [AlgebraCustomPoolEntryPoint](Contracts/Periphery/AlgebraCustomPoolEntryPoint.md)
- [IAlgebraCustomPoolEntryPoint](Contracts/Periphery/interfaces/IAlgebraCustomPoolEntryPoint.md)
- [BaseV1PluginFactory](Contracts/Plugin/BaseV1PluginFactory.md)
- [NestFeePluginFactory](Contracts/Plugin/base/NestFeePluginFactory.md)
- [SwapRouter](Contracts/Periphery/SwapRouter.md)
- [NonfungiblePositionManager](Contracts/Periphery/NonfungiblePositionManager.md)
