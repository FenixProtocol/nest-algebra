# Audit Notes — nest-914

## Comparison and objective

This audit covers the protocol changes in `feauture/nest-914` relative to `main`.
The branch introduces custom Algebra pools, makes periphery routing and positions aware of those pools, and adds Nest TWAP and MEV-resistance fee plugins. It also includes targeted reentrancy remediations in the periphery, including the exact-output quote fix described below.

Classic pools remain identified by their sorted token pair. A custom pool is identified by its custom deployer and sorted token pair, so a classic pool and multiple custom pools can coexist for one pair.

## Required deployment and custom-pool flow

1. Upgrade `AlgebraFactoryUpgradeable` and execute its owner-only `setPoolDeployer` reinitializer with the new `AlgebraPoolDeployer`.
2. Deploy and configure `AlgebraCustomPoolEntryPoint`; grant it the factory's `CUSTOM_POOL_DEPLOYER` role and any required pool-administrator permissions.
3. Deploy a Nest fee-plugin factory, allowlist it in the entry point, and grant its required factory roles.
4. The approved factory calls `deployCustomPool`. It records pending creation data, calls the entry point, and the entry point calls `AlgebraFactoryUpgradeable.createCustomPool`.
5. The factory invokes the entry point's before/after creation hooks. The fee-plugin factory must create the expected beacon proxy, validate the pending creator/tokens/data/plugin, and mark only the resulting pool as custom.

Audit this flow atomically: authorization, deterministic address calculation, hook inputs, pending-state lifecycle, plugin initialization, factory registry writes, and failure rollback must all agree.

## In-scope contracts and test focus

### Core and custom-pool control plane

- `src/core/contracts/AlgebraFactoryUpgradeable.sol`
  - Upgrade/initializer ownership and storage-layout safety.
  - Classic versus custom CREATE2 salts and addresses; sorted/reverse registry mappings; `deployerByPool` integrity.
  - `CUSTOM_POOL_DEPLOYER` authorization, plugin hook ordering, vault creation, and coexistence of classic and multiple custom pools for one pair.
- `src/periphery/contracts/AlgebraCustomPoolEntryPoint.sol`
  - Deployer allowlisting, `msg.sender == deployer` enforcement, hook caller restrictions, and custom-pool-only management operations.
  - Ensure management forwarding (`setTickSpacing`, `setPlugin`, `setPluginConfig`, `setFee`) cannot control another deployer's pool or bypass factory roles.

### Periphery integration

- `src/periphery/contracts/SwapRouter.sol`
  - Classic routes using `deployer == address(0)` and custom routes using the encoded deployer; no fallback from an unknown custom deployer to a classic pool.
  - Single-hop/multihop exact-input and exact-output routing, native wrapping, payment-in-advance, callbacks, and router-wide reentrancy protection across swaps, payments, permits, and multicalls.
- `src/periphery/contracts/NonfungiblePositionManager.sol`
  - Custom deployer propagation through mint/increase-liquidity, pool-key caching, position reads, collection/burn paths, and compatibility of pre-existing classic positions.
  - The shared reentrancy boundary across permit callbacks, native-funded mint/increase-liquidity, payment, and multicall operations.
- `src/periphery/contracts/lens/Quoter.sol` and `src/periphery/contracts/lens/QuoterV2.sol`
  - Custom-pool lookup, callback authentication, and classic compatibility.
  - Exact-output completeness: a no-limit quote appends its expected output to its own callback data, and the callback requires the received output to match it. Test reentry from an output token and a before-swap hook; nested quotes must not weaken the outer quote. Explicit-price-limit partial-quote behavior must remain unchanged.

Supporting periphery interfaces and libraries changed with these contracts, notably path encoding (`token -> deployer -> token`), pool lookup, callback validation, and position pool keys. They are in scope where they affect the above behavior.

### Plugin factories and fee plugins

- `src/plugin/contracts/base/NestFeePluginFactory.sol`
  - Beacon implementation validation/upgrades, ownership and administrator role separation, public/private creation mode, existing-pool plugin creation, and custom-pool pending-state/hook validation.
  - Plugin-to-pool registry integrity and owner-only pool management forwarding.
- `src/plugin/contracts/BaseV1PluginFactory.sol`
  - Default deviation-fee configuration and initialization of the base plugin product.
- `src/plugin/contracts/NestTWAPFeePlugin.sol` and `src/plugin/contracts/NestTWAPFeePluginFactory.sol`
  - Beacon-proxy initialization and active-plugin checks; timepoint writes/reads, timestamp boundaries, TWAP availability, storage prepayment, fee configuration bounds, fee cap, and hook-driven fee updates.
- `src/plugin/contracts/NestMEVFeePlugin.sol` and `src/plugin/contracts/NestMEVFeePluginFactory.sol`
  - Oracle configuration and authorization, live-oracle versus internal-TWAP fallback, same-block starting-tick behavior, deadband/cap/slope arithmetic, and all disabled/unavailable/malformed oracle cases.
- `src/plugin/contracts/libraries/HyperCoreSpotOracle.sol`
  - HyperCore precompile call safety, returndata validation, decimal scaling, inversion, rounding, tick bounds, and graceful unavailable-oracle behavior.

## Required security regression coverage

- Custom pools: both token orders, duplicate prevention, multiple deployers for one pair, expected address equality, hook rollback, and no classic/custom registry confusion.
- Periphery: classic and custom single-hop/multihop routes, exact input/output, native flows, unknown deployers, callbacks from unregistered pools, and custom NFT lifecycle operations.
- Reentrancy: malicious payment/output/permit tokens must not drain router or position-manager custody. For `#214857`, a malicious output token must call a nested no-limit exact-output quote while an oversized outer no-limit quote is in progress; both quoters must still revert with `Not received full amountOut`.
- Plugins: unauthorized configuration and upgrades; plugin replacement/detachment; initialization sequencing; TWAP readiness and fee bounds; oracle valid, unavailable, malformed, out-of-range, inverted, and fallback paths.
- Upgrade paths: implementation initializer locks, proxy initialization/role assignment, reinitializer ordering, and storage compatibility for factory and beacon-proxy plugin state.

## Token-behavior acknowledgement

The protocol acknowledges that fee-on-transfer, tax, rebasing, and similarly non-standard ERC-20 tokens can break Algebra pool accounting and logic. That known limitation is expected to affect the particular pool that lists such a malicious or non-conforming token.

Findings involving these token classes remain valuable if they demonstrate an impact on users, assets, or pools outside the affected pool. We will review such cross-pool or protocol-wide impact carefully.

## Out of scope

- All contracts under `src/farming`.
- `src/periphery/contracts/V3Migrator.sol`.
- A full re-audit of otherwise unchanged core pool math, except where it is directly exercised by custom-pool deployment, periphery integration, or the new fee plugins.
- Generated artifacts, documentation tooling, and deployment scripts, unless they can alter the safety of the deployment/upgrade flow above.
