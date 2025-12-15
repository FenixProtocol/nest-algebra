# `createV3Gauge(pool)` — Operational Guide (HyperEVM)

This document describes **how to call `createV3Gauge(address pool)`**, what parameters to provide, what permissions are required, and **HyperEVM-specific execution nuances**.

---

## Contract and Entry Point

- **Contract (Proxy):** `VoterUpgradeable_Proxy`  
- **Address:** `0x566bdc5444fd5fe5d93ec379Bd66eC861ddbA901`
- **Explorer (Write – Proxy):**  
  https://hyperevmscan.io/address/0x566bdc5444fd5fe5d93ec379Bd66eC861ddbA901#writeProxyContract#F8

---

## Function Signature

```solidity
/**
 * @notice Creates a new V3 gauge for a specified pool.
 * @dev Only callable by an address with the GOVERNANCE_ROLE.
 *      The pool must be created by the V3 Pool Factory.
 *
 * @param pool_ The address of the pool for which to create a gauge.
 *
 * @return gauge The address of the created gauge.
 * @return internalBribe The address of the created internal bribe.
 * @return externalBribe The address of the created external bribe.
 *
 * @custom:error GaugeForPoolAlreadyExists
 * @custom:error PoolNotCreatedByFactory
 */
function createV3Gauge(address pool_)
    external
    nonReentrant
    onlyRole(_GOVERNANCE_ROLE)
    returns (
        address gauge,
        address internalBribe,
        address externalBribe
    );
```

---

## Purpose

`createV3Gauge` creates and registers:

- a **V3 Gauge** for a specific pool,
- an **Internal Bribe** contract,
- an **External Bribe** contract.

---

## Required Permissions

### GOVERNANCE_ROLE

The caller **must** have `GOVERNANCE_ROLE`.

If the caller does not have this role, the transaction will revert due to access control checks.

---

## Pool Validation Rules

### Pool must be created by the V3 Pool Factory

The function verifies that `pool_`:

- is a valid **V3 pool**
- was deployed by the **configured V3 Pool Factory**

If this condition is not met, the call reverts with:

```
PoolNotCreatedByFactory
```
---

## Gauge Uniqueness Constraint

Each pool can have **only one gauge**.

If a gauge already exists for the given pool, the transaction reverts with:

```
GaugeForPoolAlreadyExists
```
---

## HyperEVM-Specific Requirement: Big Blocks

### ⚠️ Mandatory Step

Before calling `createV3Gauge`, you **must enable Big Blocks** for the wallet that sends the transaction.

Big Blocks are required because:
- `createV3Gauge` performs internal contract creation
- The gas usage often exceeds small-block limits on HyperEVM

### Big Blocks Toggle

Enable Big Blocks here:

Tool from hyper evm docs https://hyperliquid.gitbook.io/hyperliquid-docs/builder-tools/hyperevm-tools#big-blocks-small-blocks :
- https://hyperevm-block-toggle.vercel.app/

**Procedure**
1. Open the link
2. Connect the wallet that has `GOVERNANCE_ROLE`
3. Toggle to **Big Blocks**
4. Complete the required transaction/signature

---

## Manual Execution Flow (Explorer)

### Step 1 — Enable Big Blocks
Enable Big Blocks for the governance wallet using the toggle UI.

---

### Step 2 — Open Voter Proxy (Write)

Open:
https://hyperevmscan.io/address/0x566bdc5444fd5fe5d93ec379Bd66eC861ddbA901#writeProxyContract#F8

Ensure:
- You are interacting with the **proxy**
- The connected wallet has `GOVERNANCE_ROLE`

---

### Step 3 — Call `createV3Gauge`

Fill in:

| Field | Value |
|-----|------|
| `pool_` | Address of the V3 pool |

Submit the transaction.

---

### Step 4 — Verify Result

After the transaction is mined:

- Confirm the transaction succeeded
- Verify the gauge is registered for the pool inside the `Voter`

---

## Common Failure Modes

| Error | Meaning |
|-----|--------|
| `GaugeForPoolAlreadyExists` | Gauge already exists for this pool |
| `PoolNotCreatedByFactory` | Pool was not deployed by the V3 factory |
| AccessControl revert | Caller lacks `GOVERNANCE_ROLE` |
| Out-of-gas | Big Blocks not enabled or insufficient gas |