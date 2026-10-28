# Bailsec Resolution Report — Nest Algebra Plugin

## 1. Resolution baseline

This document is the development team's issue-by-issue response to the **Bailsec — Nest — Algebra Plugin — 2nd Audit Report** (Final, October 2026).

- Audit source: [local report](<audits/Bailsec - Nest - Algebra Plugin - 2nd Audit Report.pdf>)
- Audit report SHA-256: `11de1e7e6fb524dfbd895efe45b379362802ab226a76fb910c1011720e015175`
- Audited commit: [`3139ba1c75e24028dda2a9d0e2602cdf0025bbc2`](https://github.com/FenixProtocol/nest-algebra/tree/3139ba1c75e24028dda2a9d0e2602cdf0025bbc2)
- Resolution commit: [`11f969070c50973c2a790b3fdf11d41b6fe630e9`](https://github.com/FenixProtocol/nest-algebra/commit/11f969070c50973c2a790b3fdf11d41b6fe630e9)
- Full resolution comparison: [`3139ba1c…11f9690`](https://github.com/FenixProtocol/nest-algebra/compare/3139ba1c75e24028dda2a9d0e2602cdf0025bbc2...11f969070c50973c2a790b3fdf11d41b6fe630e9)

The resolution commit contains the implementation, documentation, and counter-PoC changes described below. Each response records the affected behavior, caller and preconditions, implemented resolution, and supporting test evidence.

This is a development-team response, not confirmation from Bailsec that a finding is resolved.

Two commits support the numbered resolutions without representing separate issue dispositions:

- [`05714925d97742146aa18eff4249029309d1c96c`](https://github.com/FenixProtocol/nest-algebra/commit/05714925d97742146aa18eff4249029309d1c96c) corrects `MockDefaultPluginFactory` so hook tests resolve the factory through the custom-pool entry point and updates the affected position-manager gas snapshot.
- [`f41d7fc5252a6477df33c311b615ca0890270b1e`](https://github.com/FenixProtocol/nest-algebra/commit/f41d7fc5252a6477df33c311b615ca0890270b1e) adds HyperCore oracle documentation; the later Issue_54 commit updates it for signed exponents and decimal-orientation support.

## 2. Executive status

| Category | Issues | Status |
| --- | --- | --- |
| Behavioral fixes | 02, 05, 10, 12, 23, 24, 25, 28, 36, 37, 38, 45, 46, 54 | Implemented |
| Documentation-only resolutions | 21, 30, 31 | Implemented; no runtime behavior changed |
| Counter-PoC evidence | 02, 05, 10, 12, 23, 24, 25, 28, 36, 37, 38, 45, 46, 54 | Included |

## 3. Issue responses

### Issue_02 — Factory upgrade cannot be made atomic

- **Severity:** Low
- **Resolution:** Implemented, with a mandatory deployment constraint
- **Fix commit:** [`a29ba95b10d54de6259c0006589a79d6f6bed9f5`](https://github.com/FenixProtocol/nest-algebra/commit/a29ba95b10d54de6259c0006589a79d6f6bed9f5)

**Issue summary.** The old `onlyOwner` restriction on `setPoolDeployer` made `ProxyAdmin.upgradeAndCall` unusable because a transparent proxy admin cannot fall through to the implementation and cannot simultaneously be the factory owner. A two-transaction upgrade temporarily installed code that used the new four-argument deployer API while the proxy still pointed to the old pool deployer. Pool creation therefore reverted between the upgrade and reinitialization transactions.

**Source and preconditions.** This was not a permissionless fund-theft path. It was initiated by the `ProxyAdmin` owner while upgrading an existing factory proxy. The affected call path was `ProxyAdmin.upgrade` → factory proxy running the new implementation → `createPool`/`createCustomPool` → old `AlgebraPoolDeployer.deploy`, which had an incompatible selector. Existing pools and positions were not changed, but all new pool creation was unavailable during the gap.

**Resolution and behavior change.** `setPoolDeployer` is now an unguarded `reinitializer(2)` and the shared `_setPoolDeployer` helper is used by both fresh initialization and the upgrade path. The supported deployment path executes the factory upgrade and `setPoolDeployer(newPoolDeployer)` atomically through `ProxyAdmin.upgradeAndCall`. This deployment constraint is documented in `FOR_AUDITORS.md` and `FOR_DEVELOPERS.md`.

This fix deliberately moves authorization from `onlyOwner` to the proxy-admin-controlled atomic upgrade. If an operator upgrades first and calls `setPoolDeployer` later, any account can consume reinitializer version 2 and set a malicious deployer. The code does not make a non-atomic deployment safe.

**Counter-PoC.** [`AlgebraFactory.spec.ts` — atomic upgrade, state preservation, pool creation, and one-time reinitializer](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/core/test/AlgebraFactory.spec.ts#L168-L203). The second test intentionally proves that an arbitrary caller can consume the reinitializer on a fresh proxy, reinforcing the atomic deployment requirement.

### Issue_05 — Custom pool registry is updated after hooks

- **Severity:** Low
- **Resolution:** Implemented
- **Fix commit:** [`a73b4fc3e1fb186e6e589417a9b78ced75c73ea7`](https://github.com/FenixProtocol/nest-algebra/commit/a73b4fc3e1fb186e6e589417a9b78ced75c73ea7)

**Issue summary.** The registry entry for a deterministic custom-pool address was previously written only after both plugin-factory hooks. A hook could reenter custom-pool creation for the same `(customDeployer, token0, token1)` tuple while the duplicate check still observed an empty registry. CREATE2 collision behavior was the final backstop rather than registry consistency.

**Source and preconditions.** The initiator had to be a contract reached through an authorized `CUSTOM_POOL_DEPLOYER` call. The path was `createCustomPool` → `beforeCreatePoolHook` or `afterCreatePoolHook` → reentrant `createCustomPool`. This affected newly created custom pools only; existing pools were unaffected.

**Resolution and behavior change.** The factory now computes and writes `customPoolByPair` in both token orders and `deployerByPool` before making either external hook call. If a hook or deployment later reverts, EVM transaction rollback removes the provisional registry writes. The implementation does not add a broad reentrancy guard; it closes the reported same-tuple duplicate window by establishing registry consistency before interaction.

**Counter-PoC.** [`AlgebraFactory.spec.ts` — registry is populated during the pre-hook while pool code is still absent, and remains correct after the post-hook](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/core/test/AlgebraFactory.spec.ts#L342-L366). Related uniqueness and salt-isolation checks are at [lines 403–470](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/core/test/AlgebraFactory.spec.ts#L403-L470).

### Issue_10 — `collect`, `decreaseLiquidity`, and `burn` are not reentrancy-protected

- **Severity:** Medium
- **Resolution:** Implemented
- **Fix commit:** [`fd55cee9cc3567ab8acd06d0e326209ed6ca9354`](https://github.com/FenixProtocol/nest-algebra/commit/fd55cee9cc3567ab8acd06d0e326209ed6ca9354)
- **Counter-PoC commit:** [`11f969070c50973c2a790b3fdf11d41b6fe630e9`](https://github.com/FenixProtocol/nest-algebra/commit/11f969070c50973c2a790b3fdf11d41b6fe630e9)

**Issue summary.** The position manager shared a reentrancy lock across minting, liquidity increases, and payment helpers, but `decreaseLiquidity`, `collect`, and `burn` were outside the lock. A malicious pool token could reenter a public payment helper while `collect` temporarily held user assets. A malicious plugin could also reenter `decreaseLiquidity` during `increaseLiquidity`, causing the outer call to overwrite cached position accounting.

**Attack source A — malicious token.** Any position owner could interact with a pool containing a malicious token. The path was `NonfungiblePositionManager.collect` → `AlgebraPool.collect` → malicious token transfer callback → `sweepToken`/`unwrapWNativeToken`/`refundNativeToken`. Theft depended on the manager temporarily holding assets and the victim using permissive zero minimums in a later multicall step.

**Attack source B — malicious plugin.** A malicious or compromised pool plugin could use a position hook reached during `increaseLiquidity` to call the unguarded `decreaseLiquidity` on a shared tick-range position. The outer call then wrote stale cached liquidity. This source required a malicious plugin and authorization for the nested NFT operation; it was not an arbitrary callback from an unrelated contract.

**Resolution and behavior change.** `nonReentrant` was added to `decreaseLiquidity`, `collect`, and `burn`, placing every mutating position operation and payment helper under the same manager lock. Ordinary sequential multicall operations remain valid because the lock is released between delegatecalled multicall elements.

**Counter-PoCs.** [`ReentrancyProtection.spec.ts`](https://github.com/FenixProtocol/nest-algebra/blob/11f969070c50973c2a790b3fdf11d41b6fe630e9/src/periphery/test/ReentrancyProtection.spec.ts) contains both reported attack traces:

1. **[Malicious-token `collect` callback](https://github.com/FenixProtocol/nest-algebra/blob/11f969070c50973c2a790b3fdf11d41b6fe630e9/src/periphery/test/ReentrancyProtection.spec.ts#L405-L486).** The test creates two positions and collects both to the position manager in one multicall. The malicious token callback fires during the second `collect` and attempts `sweepToken` to the thief while the manager holds assets from the first collection. The nested settlement call fails with `ReentrancyGuard: reentrant call`, the thief receives no tokens, and the intended final sweep transfers the exact owed balance to the legitimate recipient.
2. **[Malicious-plugin position-hook callback](https://github.com/FenixProtocol/nest-algebra/blob/11f969070c50973c2a790b3fdf11d41b6fe630e9/src/periphery/test/ReentrancyProtection.spec.ts#L488-L551).** The test grants a malicious plugin approval for the NFT, enables its `beforeModifyPosition` hook, and has that hook call `decreaseLiquidity` while `increaseLiquidity` is active. The nested call fails with the shared reentrancy guard; the outer increase succeeds, the NFT liquidity doubles as expected, and the manager's recorded liquidity equals the pool position liquidity with no unexpected owed balances.

The tests use dedicated attacker doubles in [`ReentrantCollectToken.sol`](https://github.com/FenixProtocol/nest-algebra/blob/11f969070c50973c2a790b3fdf11d41b6fe630e9/src/periphery/contracts/test/ReentrantCollectToken.sol) and [`ReentrantPositionPlugin.sol`](https://github.com/FenixProtocol/nest-algebra/blob/11f969070c50973c2a790b3fdf11d41b6fe630e9/src/periphery/contracts/test/ReentrantPositionPlugin.sol). They pass with `npx hardhat test test/ReentrancyProtection.spec.ts` from `src/periphery`.

### Issue_12 — `mint` accepts tokens in the wrong order

- **Severity:** Low
- **Resolution:** Implemented
- **Fix commit:** [`69dfbe109a698446e53cd58ba10eb1c36be36b0f`](https://github.com/FenixProtocol/nest-algebra/commit/69dfbe109a698446e53cd58ba10eb1c36be36b0f)

**Issue summary.** Registry-based pool lookup sorted the supplied token addresses, but the desired and minimum amounts were still interpreted as token0/token1 fields. Reversed input could therefore apply deposit and slippage parameters to the wrong assets.

**Source and preconditions.** This was primarily a user/integrator input-safety failure. Any caller could submit a reversed pair to `NonfungiblePositionManager.mint`; only the new position was affected.

**Resolution and behavior change.** `mint` now requires `params.token0 < params.token1` before resolving the pool or transferring assets, restoring the canonical ordering requirement.

**Counter-PoC.** [`NonfungiblePositionManager.spec.ts` — reversed token order reverts](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/periphery/test/NonfungiblePositionManager.spec.ts#L144-L163).

### Issue_21 — Path and callback-validation changes break integrators silently

- **Severity:** Informational
- **Resolution:** Documentation response implemented; API consolidation intentionally not performed
- **Fix commit:** [`3ca86eca7c2409c18eba4abbcf6a6e09716f5eb9`](https://github.com/FenixProtocol/nest-algebra/commit/3ca86eca7c2409c18eba4abbcf6a6e09716f5eb9)

**Issue summary.** The new path encoding is `token, deployer, token, ...`, and callback validation now expects the factory rather than the pool deployer. Stale integrations could compile but decode incorrect addresses or revert every callback.

**Source and preconditions.** This is an integration migration risk, not a permissionless protocol exploit. It affects routers, quoters, SDKs, and contracts built against the old path or callback API.

**Resolution and behavior change.** NatSpec now specifies the deployer-aware path for exact-input and reverse exact-output routes, requires `address(0)` for classic pools, and states that callback validation uses the factory registry. No runtime behavior changed. The functions were not renamed or consolidated, avoiding additional code and ABI churn; the documentation includes the corresponding migration guidance.

**Supporting tests.** Existing behavior tests prove custom multi-hop paths and explicit rejection of legacy token-only paths: [Quoter](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/periphery/test/Quoter.spec.ts#L176-L201) and [QuoterV2](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/periphery/test/QuoterV2.spec.ts#L238-L267). These tests support the documented behavior but are not new counter-PoCs in the fix commit.

### Issue_23 — Connecting an incentive before oracle initialization halts trading

- **Severity:** Medium
- **Resolution:** Implemented
- **Fix commit:** [`7ed1c7b0a5af4fb034aa94f4d1c39919a27c2408`](https://github.com/FenixProtocol/nest-algebra/commit/7ed1c7b0a5af4fb034aa94f4d1c39919a27c2408)

**Issue summary.** On an already initialized pool, a newly attached plugin can still have an unseeded oracle. The configured farming address could attach an incentive, which enabled swap hooks before oracle initialization. Every swap and quote then reached `_writeTimepoint` and reverted with `Not initialized`.

**Source and preconditions.** The initiator had to be the `farmingAddress` configured on the relevant plugin factory. Preconditions were an initialized pool, an attached but uninitialized plugin, and hook configuration still disabled. The path was `setIncentive` → `_updatePluginConfigInPool` → later pool `beforeSwap` → `_writeTimepoint`. Existing liquidity remained withdrawable, but trading and quoting halted until an administrator initialized or disabled the plugin hooks.

**Resolution and behavior change.** Both `AlgebraBasePluginV1` and `NestTWAPFeePlugin` now require `isInitialized` before any incentive connection or hook reconfiguration. `NestMEVFeePlugin` inherits the Nest TWAP behavior.

**Counter-PoCs.** [Base V1 plugin](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/AlgebraBasePluginV1.spec.ts#L640-L655) and [Nest TWAP/MEV base path](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/NestTWAPFeePlugin.spec.ts#L99-L119) prove that the call reverts and the hook configuration remains disabled.

### Issue_24 — Plugins of custom pools cannot be replaced

- **Severity:** Low
- **Resolution:** Implemented
- **Fix commits:** [`b5e78197838221b75ead261f1c2d86af1f24c0d9`](https://github.com/FenixProtocol/nest-algebra/commit/b5e78197838221b75ead261f1c2d86af1f24c0d9) and mapping synchronization completed in [`8194fe9a7f9b4cb7afff0ac13d9f34870f683750`](https://github.com/FenixProtocol/nest-algebra/commit/8194fe9a7f9b4cb7afff0ac13d9f34870f683750)

**Issue summary.** `createPluginForExistingPool` resolved only classic pools, while Nest plugin initialization and management require `pluginByPool` to identify the active plugin. After a custom-pool plugin replacement, there was no supported path to create and activate another Nest plugin.

**Source and preconditions.** This was a privileged recovery/upgrade failure rather than a public exploit. It arose after a custom deployer owner or pool administrator replaced a plugin. Existing pool liquidity remained, but Nest oracle reads and fee management could become unavailable or inconsistent.

**Resolution and behavior change.** `createPluginForExistingPool` now accepts a deployer identifier, resolves classic pools when it is zero and the matching custom-pool registry otherwise. The owner-controlled `setPlugin` path also updates `pluginByPool` before forwarding the pool change; a downstream revert rolls the mapping write back.

**Counter-PoCs.** [`NestFeePluginFactory.spec.ts`](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/NestFeePluginFactory.spec.ts#L78-L124) creates and initializes a replacement plugin for an existing custom pool and proves that an unrelated deployer cannot resolve it. Mapping synchronization is checked at [lines 184–193](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/NestFeePluginFactory.spec.ts#L184-L193).

### Issue_25 — Price of a new custom pool can be front-run

- **Severity:** Low
- **Resolution:** Implemented with an intentional ABI change
- **Fix commit:** [`7c169171a56cb0f02716dd8f528e0a2ae2f39d91`](https://github.com/FenixProtocol/nest-algebra/commit/7c169171a56cb0f02716dd8f528e0a2ae2f39d91)

**Issue summary.** A custom pool was deployed without an initial price and initialized in a later transaction. Any public account could initialize it first. Slippage could protect the creator's initial liquidity deposit, but the base plugin oracle could retain the attacker's seed price and keep adaptive fees elevated after the spot price was moved back.

**Source and preconditions.** The attacker was any public account monitoring a newly created, uninitialized custom pool. The path was `deployCustomPool` in transaction one, followed by attacker `AlgebraPool.initialize(attackerPrice)` before the creator's transaction two. Only newly created custom pools were affected.

**Resolution and behavior change.** `NestFeePluginFactory.deployCustomPool` now accepts `sqrtPriceX96` and initializes the pool before returning. The generic `bytes data` path was removed from factory, entry-point, and pre-create hook interfaces. An invalid price reverts the entire transaction, including pool bytecode deployment, registry entries, pending state, and plugin mappings.

This resolution changes the custom-pool creation and hook interfaces to the new ABI.

**Counter-PoCs.** [Nest factory atomic initialization and rollback](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/NestFeePluginFactory.spec.ts#L128-L163) and [Base V1 factory rollback](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/BaseV1PluginFactory.spec.ts#L69-L107).

### Issue_28 — Static admin fees can exceed the Nest fee cap

- **Severity:** Low
- **Resolution:** Implemented
- **Fix commit:** [`ecd637d5953eaa7f5949677c17d6d2b8678506e7`](https://github.com/FenixProtocol/nest-algebra/commit/ecd637d5953eaa7f5949677c17d6d2b8678506e7)

**Issue summary.** When dynamic fees were disabled, a privileged pool-admin path accepted any `uint16` static fee, exceeding the Nest plugin's documented 5% maximum.

**Source and preconditions.** Only the `NestFeePluginFactory` owner could call the affected wrapper, or a separate `POOLS_ADMINISTRATOR_ROLE` holder could act through other pool administration paths. It required dynamic fees to be disabled. This was unsafe privileged configuration, not a public exploit.

**Resolution and behavior change.** `NestFeePluginFactory.setFee` now rejects `newFee > 50_000` before forwarding to the custom-pool entry point.

The cap applies to the Nest factory owner wrapper. A holder of the Algebra factory's `POOLS_ADMINISTRATOR_ROLE` retains the broader governance capability to call the pool's privileged static-fee path directly while dynamic fees are disabled.

**Counter-PoC.** [`BaseV1PluginFactory.spec.ts` — owner cannot set a static fee above 5%](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/BaseV1PluginFactory.spec.ts#L225-L230).

### Issue_30 — A same-block tick move can lower the next fee

- **Severity:** Informational
- **Resolution:** Documentation-only
- **Fix commit:** [`eecf4072222dc33568c2b3b6eb6605b7f41f1d5e`](https://github.com/FenixProtocol/nest-algebra/commit/eecf4072222dc33568c2b3b6eb6605b7f41f1d5e)

**Issue summary.** The implementation already recalculated the fee from the absolute current-tick/TWAP distance before every swap. The code comment incorrectly claimed that any prior same-block tick movement raises the next fee; movement toward the TWAP lowers it.

**Source and impact.** There was no attack or broken runtime behavior. The risk was an integrator or reviewer forming an incorrect model of the fee behavior.

**Resolution and behavior change.** The comment now states that the prior swap changes the next fee according to the current-versus-TWAP delta. Runtime behavior is unchanged; no counter-PoC is applicable. Existing fee behavior tests continue to cover capped and decaying TWAP fees.

### Issue_31 — `isTwapReady` is false when the plugin is inactive

- **Severity:** Informational
- **Resolution:** Documentation-only
- **Fix commit:** [`5e2e7f10d507cab65f699522aaae88b8e53a3e12`](https://github.com/FenixProtocol/nest-algebra/commit/5e2e7f10d507cab65f699522aaae88b8e53a3e12)

**Issue summary.** NatSpec described readiness only in terms of stored history, while the function also requires initialization, attachment as `pool.plugin()`, and the factory's `pluginByPool(pool)` pointer to reference the same plugin.

**Source and impact.** This was an API-documentation mismatch affecting monitoring and integrations, not a public exploit.

**Resolution and behavior change.** The interface documentation now lists the inactive states that return false. Runtime behavior is unchanged. Existing detachment tests prove the documented behavior, but no new counter-PoC was required for the comment-only change.

### Issue_36 — A detached Base V1 plugin still quotes a live TWAP

- **Severity:** Low
- **Resolution:** Implemented
- **Fix commits:** [`8194fe9a7f9b4cb7afff0ac13d9f34870f683750`](https://github.com/FenixProtocol/nest-algebra/commit/8194fe9a7f9b4cb7afff0ac13d9f34870f683750) and [`11f969070c50973c2a790b3fdf11d41b6fe630e9`](https://github.com/FenixProtocol/nest-algebra/commit/11f969070c50973c2a790b3fdf11d41b6fe630e9)

**Issue summary.** After plugin detachment, the pool and factory registries could disagree. The old Base V1 plugin still extrapolated missing history using the pool's current tick and exposed a misleading live TWAP and fee even though it had stopped recording.

**Source and preconditions.** A privileged custom-pool deployer owner first changed the pool plugin. External readers then queried the stale address directly or through the stale `pluginByPool` mapping. No public caller could cause detachment without the required administration authority, but any integrator could consume the bad quote afterward.

**Resolution and behavior change.** Base V1 `getSingleTimepoint`, `getTimepoints`, and `getCurrentFee` now require the oracle to be initialized and the plugin to remain attached to the pool. The Nest factory `setPlugin` path synchronizes `pluginByPool` with the forwarded pool update.

**Counter-PoCs.** [`AlgebraBasePluginV1.spec.ts`](https://github.com/FenixProtocol/nest-algebra/blob/11f969070c50973c2a790b3fdf11d41b6fe630e9/src/plugin/test/AlgebraBasePluginV1.spec.ts#L146-L253) rejects timepoint reads before initialization and after detachment. Its [`#getCurrentFee` tests](https://github.com/FenixProtocol/nest-algebra/blob/11f969070c50973c2a790b3fdf11d41b6fe630e9/src/plugin/test/AlgebraBasePluginV1.spec.ts#L357-L370) apply the same checks to dynamic-fee reads. Factory mapping synchronization is checked in [`NestFeePluginFactory.spec.ts`](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/NestFeePluginFactory.spec.ts#L184-L193).

### Issue_37 — Base V1 plugins ignore the deviation-fee default

- **Severity:** Low
- **Resolution:** Implemented
- **Fix commit:** [`db6357fcc24acea162319a380dc811f2cd2c17f7`](https://github.com/FenixProtocol/nest-algebra/commit/db6357fcc24acea162319a380dc811f2cd2c17f7)

**Issue summary.** `BaseV1PluginFactory` inherited a setter and event for a deviation-fee default that its creation path never consumed. An administrator could receive a successful transaction and event while all new Base V1 plugins continued using the adaptive-fee configuration.

**Source and preconditions.** This was privileged operator misconfiguration by the plugin-factory administrator or Algebra factory owner. It affected newly created Base V1 plugins after the misleading setter call.

**Resolution and behavior change.** The shared setter is now virtual, and Base V1 overrides it to revert with `Deviation fee is not supported in V1`. Nest TWAP and MEV factories retain the supported shared behavior.

**Counter-PoC.** [`BaseV1PluginFactory.spec.ts` — unsupported configuration reverts and the adaptive default remains unchanged](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/BaseV1PluginFactory.spec.ts#L193-L204).

### Issue_38 — Free tick moves through empty-liquidity regions can force cap fees

- **Severity:** Medium
- **Resolution:** Implemented; targeted and package-level regression tests pass
- **Fix commit:** [`f0993530a1d727fae39cbfc0a71800bd325be721`](https://github.com/FenixProtocol/nest-algebra/commit/f0993530a1d727fae39cbfc0a71800bd325be721)

**Issue summary.** Nest TWAP and MEV fees previously consumed the pool's raw pre-swap `globalState.tick`. When active liquidity was zero, a swap could move that tick through empty space to an extreme price limit without consuming meaningful input. A later return swap recorded the freely parked tick for the elapsed interval, shifting the self-TWAP and potentially forcing subsequent users to pay `feeCap`. In MEV mode, the same tick could also become `_blockStartTick` and maximize the LVR component for the next block.

**Source and preconditions.** This was a public-user manipulation path; no protocol role was required. The attacker needed an initialized Nest pool with zero active liquidity, such as a concentrated-liquidity pool whose price had left all ranges or a newly initialized pool before its first mint. The path was `AlgebraPool.swap` → `NestTWAPFeePlugin.beforeSwap` → raw pool tick → `_writeTimepoint` and `_updateDeviationFee`; the MEV override additionally copied the same tick into `_blockStartTick`. Existing LP positions and future swappers were affected while the manipulated observation remained inside the configured TWAP window. Each swap's direct surcharge remained bounded by `feeCap - baseFee`, but the manipulation required only gas and negligible token input.

**Resolution and behavior change.** `beforeSwap` now receives the swap direction and obtains one unlocked snapshot through `safelyGetStateOfAMM`. With non-zero active liquidity it preserves the current tick. With exactly zero active liquidity it selects the adjacent initialized boundary that activates liquidity in the swap direction: `previousTick - 1` for zero-to-one and `nextTick` for one-to-zero. If the swap points away from every range, it uses the opposite real boundary; if no initialized range exists, it retains the last accepted oracle tick. This bounded selection does not walk the initialized-tick list.

The protected tick is used consistently for the timepoint write, TWAP fee, and MEV `_blockStartTick`. Directionless reads (`getCurrentFee`, `getTwapTick`, and timepoint views) and MEV activation validation now use the last recorded tick whenever active liquidity is zero, so a freely parked raw pool tick is not extrapolated into quotes or configuration checks. The raw pool price and tick are not rewritten; only the plugin's oracle and fee inputs are protected.

**Counter-PoCs and business-logic tests.** The dedicated [Issue_38 real-pool regression](https://github.com/FenixProtocol/nest-algebra/blob/f0993530a1d727fae39cbfc0a71800bd325be721/src/plugin/test/NestTWAPFeePlugin.issue38.poc.spec.ts#L62-L95) exits a `[-600, 600]` position in both directions, parks the raw tick outside the liquid range, returns with one wei, and proves that the plugin records the corresponding liquid edge rather than the parked tick. [Unit coverage](https://github.com/FenixProtocol/nest-algebra/blob/f0993530a1d727fae39cbfc0a71800bd325be721/src/plugin/test/NestTWAPFeePlugin.spec.ts#L54-L114) covers both directions, a swap pointing away from all liquidity, a pool with no initialized ranges, protected fee/TWAP/timepoint views, and re-entry after an extreme park. The [MEV regression](https://github.com/FenixProtocol/nest-algebra/blob/f0993530a1d727fae39cbfc0a71800bd325be721/src/plugin/test/NestMEVFeePlugin.spec.ts#L64-L75) verifies the protected live gap and `_blockStartTick`; the [production-pool integration test](https://github.com/FenixProtocol/nest-algebra/blob/f0993530a1d727fae39cbfc0a71800bd325be721/src/plugin/test/NestFeePlugin.integration.spec.ts#L128-L148) verifies the boundary, non-cap fee, and unpolluted TWAP against the real Algebra pool implementation.

The eight Issue_38-focused cases pass, and the complete plugin package validation completed with 432 passing tests.

**Resolution scope.** The protected boundary rule applies when active liquidity is exactly zero, closing the reported cost-free movement path. Historical timepoints are not rewritten and age out through the existing oracle-window behavior.

### Issue_45 — Final timepoint ring-buffer slot cannot be prepaid

- **Severity:** Informational
- **Resolution:** Implemented
- **Fix commit:** [`3a56d4828bfd91fa2a6d1f52f9b8eca15f25d826`](https://github.com/FenixProtocol/nest-algebra/commit/3a56d4828bfd91fa2a6d1f52f9b8eca15f25d826)

**Issue summary.** An off-by-one bound limited the exclusive prepayment endpoint to 65,535 even though the `uint16` indexed ring has 65,536 slots. Slot 65,535 could be initialized by normal writes but not prepaid.

**Source and impact.** Any caller could invoke prepayment, but there was no theft or oracle-integrity impact. The final slot merely retained a higher future write cost.

**Resolution and behavior change.** Both Base V1 and Nest TWAP implementations compute the endpoint in `uint256`, allow endpoints up to 65,536, and iterate without `uint16` overflow. The buffer-size comment and interface documentation were corrected.

**Counter-PoCs.** [Nest TWAP final-slot and past-end checks](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/NestTWAPFeePlugin.spec.ts#L16-L24) and [Base V1 final-slot check](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/AlgebraBasePluginV1.spec.ts#L298-L305).

### Issue_46 — LVR fee can freeze pools away from the oracle price

- **Severity:** Low
- **Resolution:** Implemented
- **Fix commit:** [`3900289e9c6eb0c32ddf46306e803f46cceff0e3`](https://github.com/FenixProtocol/nest-algebra/commit/3900289e9c6eb0c32ddf46306e803f46cceff0e3)

**Issue summary.** The former configuration check approximated one tick of price movement as exactly 100 fee units and checked only the start of the LVR term. Because the fee is charged on gross input, the true price hurdle is nonlinear. At high slopes and fees, arbitrage toward the oracle could be unprofitable, leaving the pool displaced and charging near-cap fees.

**Source and preconditions.** A public trader could move a pool away from the oracle, or the external HyperCore market could move while the pool lagged. The plugin also had to be armed with an unsafe high-slope/deadband/fee combination. Existing positions were exposed while that configuration remained active.

**Resolution and behavior change.** `MAX_KLVR` was reduced from 1.00 to 0.94. Configuration now checks the exact input-fee inequality using `TickMath` both where the LVR term begins and where it reaches the fee cap. The same validation is rerun when deviation-fee parameters change while the oracle is armed.

The validation uses the non-decreasing net arbitrage edge between the checked endpoints below the 0.95 break-even slope.

**Counter-PoCs.** [Unit checks at maximum slope and reconfiguration](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/NestMEVFeePlugin.spec.ts#L435-L450) and [integration proof of profitable arbitrage at the first 5% cap gap](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/NestFeePlugin.integration.spec.ts#L129-L174).

### Issue_54 — Price conversion fails for some token decimals

- **Severity:** Medium
- **Resolution:** Implemented with an intentional ABI change
- **Fix commit:** [`189728886c3f4ba7032ef3d01e3377c06a601a7b`](https://github.com/FenixProtocol/nest-algebra/commit/189728886c3f4ba7032ef3d01e3377c06a601a7b)

**Issue summary.** The oracle accepted only unsigned decimal exponents, so it could divide by powers of ten but could not represent pairs requiring multiplication, including common 6/8-decimal versus 18-decimal orientations. The inverted path also rejected usable exponents above 19, and the raw-price bound did not match HyperCore's `uint64` value domain.

**Source and preconditions.** This was a configuration/availability failure rather than an attacker-controlled loss path. A fee manager attempting to arm the oracle for an unsupported decimal orientation could never obtain the correct tick. Newly configured pools were affected; existing pools using representable orientations continued to work.

**Resolution and behavior change.** `priceExp` is now signed `int8` across storage, events, getters, setters, and the oracle library. Conversion supports multiplication and division in both orientations, uses full-precision `mulDiv` where required, bounds raw prices to `uint64`, and rejects only overflow or TickMath-range failures. The `INestMEVFeeManager` ABI and corresponding integration bindings now use the signed exponent.

**Counter-PoCs.** [`HyperCoreSpotOracle.spec.ts`](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/HyperCoreSpotOracle.spec.ts#L20-L109) covers negative exponents, both orientations, rounding, exponents above 19, `uint64` bounds, invalid responses, and a live precompile mock. [`NestMEVFeePlugin.spec.ts`](https://github.com/FenixProtocol/nest-algebra/blob/189728886c3f4ba7032ef3d01e3377c06a601a7b/src/plugin/test/NestMEVFeePlugin.spec.ts#L62-L137) exercises 6/8/18-decimal pool orientations through plugin arming and fee application.
