# Notes for Auditors

This branch adds support for custom Algebra pools based on the custom pool logic from Algebra protocol v1.2.2. The changes were reviewed against `main` from the current branch `feauture/nest-914`.

## Summary of protocol changes

Classic Algebra pools remain identified only by token pair. Custom pools are identified by:

- custom deployer address
- sorted token pair

This allows the protocol to support both a classic pool and one or more custom pools for the same token pair, as long as every custom pool uses a different custom deployer.

Main changed contracts:

- `src/core/contracts/AlgebraFactoryUpgradeable.sol`
- `src/core/contracts/AlgebraPoolDeployer.sol`
- `src/periphery/contracts/AlgebraCustomPoolEntryPoint.sol`
- `src/plugin/contracts/BaseV1PluginFactory.sol`

Periphery contracts were updated for backward compatibility with classic pools and support for custom pools:

- `src/periphery/contracts/lens/Quoter.sol`
- `src/periphery/contracts/lens/QuoterV2.sol`
- `src/periphery/contracts/NonfungiblePositionManager.sol`
- `src/periphery/contracts/NonfungibleTokenPositionDescriptor.sol`
- `src/periphery/contracts/SwapRouter.sol`
- Supporting interfaces and libraries such as `Path`, `PoolAddress`, `CallbackValidation`, `LiquidityManagement`, and periphery params interfaces.

The farming contracts under `src/farming` and `src/periphery/contracts/V3Migrator.sol` are not intended to support custom pools in this branch because they are not currently used for this integration. Any small changes in those areas should be treated as compatibility or test-maintenance changes, not as a custom-pool feature surface.

## Expected custom pool flow

1. Team deploys the new `AlgebraPoolDeployer` contract.
2. Team deploys new version of `AlgebraFactoryUpgradeable`, upgrade current proxy and call `setPoolDeployer` with new address of pool deployer contract.
3. Team deploys and initializes `AlgebraCustomPoolEntryPoint`.
4. Team deploys `BaseV1PluginFactory` with the Algebra factory, custom pool entry point, and plugin implementation constructor arguments.
5. Team grants the required permissions:
   - Algebra factory must allow the entry point to create custom pools through the `CUSTOM_POOL_DEPLOYER` role.
   - Algebra custom pool entry point must allow `BaseV1PluginFactory` as a custom pool deployer.
   - Algebra custom pool entry point must be allowed to manage pool parameters where needed through the factory pool administrator permissions through the `POOLS_ADMINISTRATOR` role.
6. An account authorized by role, or any account after public mode is enabled in `BaseV1PluginFactory`, calls `BaseV1PluginFactory.deployCustomPool(tokenA, tokenB, data)`.
7. `BaseV1PluginFactory` validates permissions, sorted tokens, expected pool address, and pending pool state.
8. `BaseV1PluginFactory` calls `AlgebraCustomPoolEntryPoint.createCustomPool(...)`.
9. The entry point calls `AlgebraFactoryUpgradeable.createCustomPool(...)`.
10. The factory calls `beforeCreatePoolHook` on the entry point, which forwards the hook to `BaseV1PluginFactory`.
11. `BaseV1PluginFactory.beforeCreatePoolHook` validates pending pool data and deploys a plugin for the expected custom pool address.
12. The factory deploys the custom pool through `AlgebraPoolDeployer` using a CREATE2 salt that includes the custom deployer address and token pair.
13. The factory calls `afterCreatePoolHook` on the entry point, which forwards the hook to `BaseV1PluginFactory`.
14. `BaseV1PluginFactory.afterCreatePoolHook` validates the created plugin and marks the pool as a known custom pool.
15. The factory records `customPoolByPair[customDeployer][token0][token1]`, mirrors the reverse token order, records `deployerByPool[customPool]`, emits `CustomPool`, and creates a vault if a vault factory is configured.

Later, the team expects to make custom pool creation public by enabling public pool creation mode in `BaseV1PluginFactory`. The entry point itself always requires the calling deployer contract to be allowlisted, so public users can create pools only through an approved plugin factory.

## In audit scope

- Correct upgrade and initialization path for `AlgebraFactoryUpgradeable.setPoolDeployer`.
- Storage layout safety for upgraded core contracts and beacon-proxy plugin implementations.
- New factory state and address derivation:
  - `customPoolByPair`
  - `deployerByPool`
  - `computeCustomPoolAddress`
  - CREATE2 salts for classic pools versus custom pools
- Access control around custom pool creation:
  - `CUSTOM_POOL_DEPLOYER` role on the Algebra factory
  - mandatory custom deployer allowlist on `AlgebraCustomPoolEntryPoint`
  - `CUSTOM_POOL_DEPLOYER` role and public mode on `BaseV1PluginFactory`
- Hook correctness:
  - only the expected entry point can call custom factory hooks
  - pending pool data cannot be spoofed
  - hooks cannot create or mark a pool for the wrong deployer, token pair, creator, data, or plugin
- Plugin creation through beacon proxy and upgradeability of the plugin implementation.
- Custom pool management functions:
  - `setTickSpacing`
  - `setPlugin`
  - `setPluginConfig`
  - `setFee`
- Separation between classic and custom pools for the same token pair.
- Periphery compatibility:
  - classic pools must continue to work by passing `address(0)` as deployer
  - custom pools must route through the explicit deployer address
  - no fallback from an unknown custom deployer to a classic pool
- Path encoding changes from `token -> token` to `token -> deployer -> token`.
- Callback validation changes from deterministic address-only checks to factory registry checks.
- NFT position storage and descriptors now including the pool deployer identifier.
- Quoter, QuoterV2, SwapRouter, and NonfungiblePositionManager behavior for both classic and custom pools.

## Out of audit scope

- Full re-audit of unchanged Algebra pool swap, mint, burn, tick, fee growth, oracle, and liquidity math.
- Custom pool support in `src/farming`.
- Custom pool support in `src/periphery/contracts/V3Migrator.sol`.
- General deployment scripts, documentation generation, and generated artifacts unless they affect deployment safety.
- Existing classic pool behavior that was not touched by this branch, except where custom pool compatibility changes interact with it.
- Governance or voting logic unrelated to configuring the new custom pool deployment flow.

## Required test focus

Core factory and deployer tests:

- Classic pool creation still produces the same behavior and stores `deployerByPool[classicPool] == address(0)`.
- `setPoolDeployer` can only be called through the intended upgrade/reinitializer path and only by the owner.
- `createCustomPool` can only be called by an authorized custom pool deployer contract.
- Custom pool creation rejects zero deployer, zero token, equal tokens, and duplicate custom pools for the same deployer and pair.
- Classic pool and custom pool for the same pair can coexist.
- Multiple custom deployers can create isolated custom pools for the same pair.
- `customPoolByPair` works in both token orders.
- `deployerByPool` is set only for custom pools.
- Vault creation behavior is preserved for custom pools when a vault factory is configured.

Entry point tests:

- Only `msg.sender == deployer` can call `createCustomPool`.
- Private mode allows only whitelisted custom deployers.
- Public mode allows non-whitelisted deployers, while preserving the `msg.sender == deployer` check.
- Only the factory can call `beforeCreatePoolHook` and `afterCreatePoolHook`.
- Management calls can only be made by the actual custom deployer for a pool and only when the entry point has the required administrator permission.
- Batch whitelist operations reject zero addresses and emit expected events.

BaseV1PluginFactory tests:

- Construction rejects zero factory, zero entry point, and invalid plugin implementation.
- Owner/admin roles are assigned correctly and ownership transfer keeps admin role state consistent.
- Private mode requires `CUSTOM_POOL_DEPLOYER`.
- Public mode allows pool creation without `CUSTOM_POOL_DEPLOYER`.
- `deployCustomPool` permits any valid token pair.
- Pending pool state cannot be overwritten or reused.
- `beforeCreatePoolHook` validates creator, deployer, sorted tokens, data hash, and caller.
- `afterCreatePoolHook` validates caller, deployer, pending state, plugin address, and plugin registration.
- Plugin beacon proxy is initialized with expected pool, factory, and plugin factory.
- Owner-only pool management functions reject unknown pools.
- Beacon upgrade rejects non-contract implementations.

Periphery tests:

- All existing classic pool tests pass with `deployer == address(0)`.
- Exact input, exact output, single-hop, multi-hop, native-token, and payment-in-advance swaps work for custom pools.
- Same token pair can route to either the classic pool or the custom pool depending on the deployer encoded in calldata/path.
- Unknown deployer routes fail instead of falling back to a classic pool.
- Quoter and QuoterV2 return expected amounts and fees for custom pools.
- Path encoding and decoding handles `token -> deployer -> token` for single-hop and multi-hop routes.
- Callback validation rejects callbacks from pools that are not registered in the factory mapping for the provided deployer and token pair.
- NonfungiblePositionManager mints, increases liquidity, decreases liquidity, collects fees, and burns positions for custom pools.
- Position data exposes the custom deployer and keeps classic positions as `address(0)`.
- NonfungibleTokenPositionDescriptor resolves the correct custom pool for token URI generation.

Regression tests:

- Classic pool routes, quotes, NFT positions, callbacks, and descriptors remain backward compatible through `address(0)` deployer.
- Existing snapshots are updated only where ABI, route encoding, events, or gas costs intentionally changed.
- Custom pool tests should include both token orders to verify sorting and reverse mapping behavior.
