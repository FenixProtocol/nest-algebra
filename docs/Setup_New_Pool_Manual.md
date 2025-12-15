# HyperEVM V3 Pool Lifecycle Guide (Manual)
**Create → Initialize → Configure Tick Spacing → Configure Plugin Fees**  
Target stack: **Algebra V3 (Factory + Pool + Plugin)**  
Factory (proxy): `0xF77Bd082c627aA54591cF2f2EaA811fd1AB3b1F3`  
Write UI (proxy): https://hyperevmscan.io/address/0xF77Bd082c627aA54591cF2f2EaA811fd1AB3b1F3#writeProxyContract#F2

This guide explains how to manually reproduce the exact flow performed by the provided Hardhat script:
- Detect whether a pool already exists (`poolByPair`)
- Create the pool if missing (`createPool`)
- Initialize the pool price once (`initialize`)
- Ensure `tickSpacing` is set (`setTickSpacing`)
- Read the pool plugin (`plugin`) and update fee configuration on the plugin when needed (`changeFeeConfiguration`)

---
## Short
```
Create pool:
| AlgebraFactory.createPool(${token 0 address}, ${token 1 address})
| <- take pool address from logs of tx, or scanner data

| AlgebraPool.initialize(${sqrt price ration})
| AlgebraPool.setTickSpacing(${new tick spacing})
| <- AlgebraPool.plugin() take pools attached plugin address

| Plugin.changeFeeConfiguration(${new fee configuration})

```
## 1) Data to define upfront

### 1.1 Token pair, tick spacing, and fee
Before you touch the factory UI, lock in the pool parameters.

#### A) `token0` / `token1`
You must choose the two ERC-20 tokens that define the pool.

Example from the script:
- `USDH = 0x111111a1a0667d36bD57c0A9f569b98057111111`
- `bbHLP = 0x4bB19336C973506B9405Db586b7AEE302a7CbCFc`

In Algebra / V3-style factories, token ordering is canonical and deterministic:

* `token0` **is the token with the lower address**
* `token1` **is the token with the higher address**

**Example**
* `USDH = 0x1111…1111`
* `bbHLP = 0x4bb1…cbfc`
Since `0x11… < 0x4b…`:
* `token0 = USDH`
* `token1 = bbHLP`

Even though the factory usually accepts either order, **price math and initialization always assume the canonical `token0/token1` order**.

#### B) `tickSpacing`
`tickSpacing` defines the discrete interval between initialized ticks and affects.
Example from the script:
- `tickSpacing = 1/5/10/50/any` or `60 (default)`

#### C) “Fee”
In this Algebra setup, fee behavior is controlled by the **pool plugin**, not by the factory or pool at creation time.

Example from the script:
- `baseFee = 0.05e4` (which is `500`)

The baseFee value is expressed in **parts per million (PPM)**:
* 1e6 = 100%
* 1e4 = 1%
* 1e3 = 0.1%
* 500 = 0.05%

---

### 1.2 Price source (from another V3 pool or your own calculation)

You must provide the pool’s **initial sqrt price in Q96 format** (`sqrtPriceX96`, or an equivalent field). This value is passed directly into:

- `AlgebraPool.initialize(initialPrice)`

#### Where to read the current price from an existing pool
Depending on the V3 implementation, the current sqrt price is typically available via:

- **Algebra-style pools:** `globalState()` — one of the returned fields is commonly named **`price`** (sqrt price in Q96 form).
- **Uniswap V3–style pools:** `slot0()` — one of the returned fields is commonly named **`sqrtPriceX96`**.

#### Important: price depends on token order
The sqrt price is always defined relative to the pool’s **`token0` / `token1` ordering**.  
If token order is reversed, the implied human price is inverted.

When copying a price from an existing (“neighbor”) pool, always verify:
1. The pool contains the **same two tokens**, and
2. They are in the **same order** (`token0` and `token1`).

If token order differs, you must **invert or recompute** the price before using it for initialization.

#### Option A — Use price from an existing V3 pool
If there is already a trusted V3 pool:
- Read the current sqrt price via `globalState().price` or `slot0().sqrtPriceX96`
- Confirm token addresses and ordering match
- Use this value as `initialPrice` for the new pool

This approach minimizes risk and ensures parity with an established market price.

**Operational advice**
- Always sanity-check the implied price by reversing the calculation after computing `sqrtPriceX96`.
- Initialize price only once; a wrong initialization is bit difficult to correct (requires add one side liquidity and call bit swap).

---

## 2) Pool creation

### Goal
Create the pool at the factory level **only if it does not already exist**.

### What the script does
1. Calls:
   - `poolByPair(token0, token1)`
2. If the result is zero address:
   - Calls `createPool(token0, token1)`
3. Reads the final pool address again:
   - `poolByPair(token0, token1)`

### Manual steps (Explorer / UI)
> **HyperEVM requirement:** enable **Big Blocks** before sending `createPool`, as pool creation can exceed small-block gas limits.

1. Open the factory proxy write page:
   - https://hyperevmscan.io/address/0xF77Bd082c627aA54591cF2f2EaA811fd1AB3b1F3#writeProxyContract#F2
2. Call the **read** method (or “Read Proxy Contract” tab if available):
   - `poolByPair(token0, token1)`
3. If returned `0x0000000000000000000000000000000000000000`:
   - Call `createPool(token0, token1)` from an authorized account (see “Permissions” note below).
4. After the transaction confirms:
   - Call `poolByPair(token0, token1)` again and record the pool address.

**Permissions note**
Pool creation is role-gated. The caller must have **`POOLS_CREATOR_ROLE`**, defined as:

```solidity
bytes32 public constant override POOLS_CREATOR_ROLE = keccak256("POOLS_CREATOR"); // public visibility of the value
// 0xa7106ea771a74f2d048c62cace8c00d3e120b24b61327e6415035f60d47ce888 - role hash
```
---

## 3) Price initialization

### Goal
Initialize the pool **once** with `initialPrice` (sqrt price Q96).

### Manual steps
1. **Get the pool address from the pool creation transaction**
   - Open the `createPool(token0, token1)` transaction on HyperEVMScan
   - Extract the created pool address from the transaction result/logs (factory emits/returns the new pool address)
2. Open the pool address on HyperEVMScan.
3. In **Write Contract** (or Write Proxy if pool is proxied):
   - call `initialize(initialPrice)`
4. Confirm success.
5. Verify via read call:
   - `globalState()` returns a non-zero `price`.

**Common failure reasons**
- Pool already initialized (will revert or no-op depending on implementation)
- Invalid price encoding (wrong Q96 / decimal handling)

---

## 4) Tick spacing configuration

### Goal
Ensure `tickSpacing` matches your intended configuration.

### Manual steps
1. Read the current value:
   - `tickSpacing()`
2. If it does not match your intended value:
   - call `Pool.setTickSpacing(tickSpacing)`

**Permissions**
Calling `setTickSpacing` requires the **`POOLS_ADMINISTRATOR_ROLE`**, defined as:

```solidity
bytes32 internal constant POOLS_ADMINISTRATOR_ROLE =
    keccak256("POOLS_ADMINISTRATOR");
```
If the caller does not have this role, the transaction will revert due to access control.

---


## 5) Determine the pool plugin

### Goal
Identify the **plugin contract** attached to the pool.  
The plugin is responsible for **fee logic** and may also control other pool behaviors (e.g. dynamic fee formulas, bounds, or extensions).

### Manual steps
1. On the pool contract, read:
   - `plugin()`

2. Open the returned plugin address in the explorer.
3. On the plugin contract, read:
   - `feeConfig()`

Record the full fee configuration:
- `alpha1`, `alpha2` — dynamic fee sensitivity parameters
- `beta1`, `beta2` — response shaping parameters
- `gamma1`, `gamma2` — bounds / smoothing parameters
- `baseFee` — baseline fee (PPM, where `1e6 = 100%`)

These values define **how the pool fee behaves** and whether it is **static or dynamic**.

---

## 6) Fee configuration (Plugin)

> In this architecture, **fees are configured on the plugin**, not on the factory and not directly on the pool.

Any fee change must be executed by calling the plugin’s configuration method (typically `changeFeeConfiguration`).


### 6.2 Static fee configuration

A **static fee** setup means the swap fee:
- does **not** react to volatility or pool state
- remains constant over time

This is typically achieved by:
- `alpha1 = 0`
- `alpha2 = 0`

**How to apply (static)**
- Set:
  - `alpha1 = 0`
  - `alpha2 = 0`
  - `baseFee = desiredBaseFee` (PPM units)
- Keep `beta*` and `gamma*` unchanged unless you intentionally tune them.

**Result**
- The pool uses a constant base fee, as defined by the plugin’s logic.

---

### 6.3 Dynamic fee configuration

A **dynamic fee** setup means the swap fee:
- can increase or decrease over time
- reacts to volatility, imbalance, or other pool signals

This typically requires:
- `alpha1` and/or `alpha2` to be **non-zero**

**How to apply (dynamic)**
- Do **not** zero out `alpha1` / `alpha2`
- Define:
  - `alpha1`, `alpha2` — dynamic sensitivity
  - `beta1`, `beta2`, `gamma1`, `gamma2` — curve shape, bounds, and smoothing
  - `baseFee` — minimum or baseline fee (PPM)


### Examples of `changeFeeConfiguration` calls (using `oldFeeConfig`)

Assume you read the current values first:
```js
const oldFeeConfig = await plugin.feeConfig();
```

**Static fee example (force static mode + set baseFee)**

```js
// Example: set 0.05% fee (PPM) => 500, and disable dynamics
const desiredBaseFee = 0.05e4;

await plugin.changeFeeConfiguration({
  alpha1: 0n,
  alpha2: 0n,
  beta1: oldFeeConfig.beta1,
  beta2: oldFeeConfig.beta2,
  gamma1: oldFeeConfig.gamma1,
  gamma2: oldFeeConfig.gamma2,
  baseFee: desiredBaseFee,
});
```

**Dynamic fee example (keep dynamics enabled, update parameters)**
```
await plugin.changeFeeConfiguration({
  alpha1: xx,
  alpha2: xx,
  beta1: xx,
  beta2: xx,
  gamma1: xx,
  gamma2: xx,
  baseFee: xx,
});
```