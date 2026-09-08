# Notes for Developers

This branch adds custom Algebra pool support. Classic pools are still identified by token pair only. Custom pools are identified by custom deployer plus sorted token pair.

Use `address(0)` as the deployer value whenever interacting with classic pools through the updated periphery APIs.

Important deployment note: after this upgrade, the Algebra factory points to a new `poolDeployer` address. Any backend, indexer, SDK, subgraph, script, or off-chain service that computes pool addresses locally from the old `poolDeployer` address will compute wrong addresses for newly created pools. Update that logic to use the current `factory.poolDeployer()`, `factory.computePoolAddress(...)`, `factory.computeCustomPoolAddress(...)`, or the factory registry mappings.

## ABI and functionality changes

### Core factory

`src/core/contracts/AlgebraFactoryUpgradeable.sol`

New role:

```solidity
bytes32 public constant CUSTOM_POOL_DEPLOYER = keccak256('CUSTOM_POOL_DEPLOYER');
```

New storage-backed getters:

```solidity
mapping(address => mapping(address => mapping(address => address))) public customPoolByPair;
mapping(address => address) public deployerByPool;
```

New or changed functions:

```solidity
function setPoolDeployer(address newPoolDeployer) external reinitializer(2) onlyOwner;

function computeCustomPoolAddress(
  address customDeployer,
  address token0,
  address token1
) public view returns (address customPool);

function createCustomPool(
  address customDeployer,
  address creator,
  address tokenA,
  address tokenB,
  bytes calldata data
) external returns (address customPool);
```

Behavior changes:

- `createPool` remains the classic pool creation flow.
- `createCustomPool` can only be called by an address with factory `CUSTOM_POOL_DEPLOYER`.
- Custom pools are stored in both token orders in `customPoolByPair[customDeployer][tokenA][tokenB]`.
- `deployerByPool[customPool]` is set to the custom deployer. Classic pools keep `address(0)`.
- New pools are deployed through the new `poolDeployer` address after `setPoolDeployer`; code that uses the previous deployer address to compute pool addresses will not work for pools created after the upgrade.
- Custom pool CREATE2 salt is `keccak256(abi.encode(customDeployer, token0, token1))`.
- Classic pool CREATE2 salt remains `keccak256(abi.encode(token0, token1))`.

Added events:

```solidity
event CustomPool(address indexed deployer, address indexed token0, address indexed token1, address pool); // to track custom pool creation
event PoolDeployer(address poolDeployerAddress); 
```

Updated existing events:

- No existing event signatures were changed in this branch.

### Pool deployer

`src/core/contracts/AlgebraPoolDeployer.sol`

Changed signature:

```solidity
function deploy(
  address plugin,
  address token0,
  address token1,
  address customDeployer
) external returns (address pool);
```

Behavior changes:

- `customDeployer == address(0)` deploys a classic pool using the old salt format.
- `customDeployer != address(0)` deploys a custom pool using the deployer-aware salt.
- `getDeployParameters()` still returns only `plugin`, `factory`, `token0`, and `token1`; the pool itself does not receive `customDeployer` in constructor parameters.

### Plugin factory interface

`src/core/contracts/interfaces/plugin/IAlgebraPluginFactory.sol`

Added hook functions:

```solidity
function beforeCreatePoolHook(
  address pool,
  address creator,
  address deployer,
  address token0,
  address token1,
  bytes calldata data
) external returns (address);

function afterCreatePoolHook(address plugin, address pool, address deployer) external;
```

Any contract implementing `IAlgebraPluginFactory` must now implement these functions. `BasePluginV1Factory` implements them as reverting stubs because it does not support the custom pool hook flow.

### Custom pool entry point

New contract: `src/periphery/contracts/AlgebraCustomPoolEntryPoint.sol`

Main functions:

```solidity
function createCustomPool(
  address deployer,
  address creator,
  address tokenA,
  address tokenB,
  bytes calldata data
) external returns (address customPool);

function setPublicPoolCreationMode(bool mode) external;
function setCustomPoolDeployer(address deployer, bool allowed) external;
function setCustomPoolDeployerBatch(address[] calldata deployers, bool allowed) external;

function setTickSpacing(address pool, int24 newTickSpacing) external;
function setPlugin(address pool, address newPluginAddress) external;
function setPluginConfig(address pool, uint8 newConfig) external;
function setFee(address pool, uint16 newFee) external;
```

Added events:

```solidity
event PublicPoolCreationMode(bool mode);
event CustomPoolDeployer(address indexed deployer, bool allowed);
```

Behavior:

- `createCustomPool` requires `msg.sender == deployer`.
- If entry point public mode is disabled, `deployer` must be whitelisted in `isCustomPoolDeployer`.
- The entry point forwards `beforeCreatePoolHook` and `afterCreatePoolHook` calls from the Algebra factory to the custom deployer.
- Management functions can only be called by the deployer that created the custom pool.
- For management functions to succeed, the entry point must also be allowed as a pool administrator by the Algebra factory.

### Base V1 plugin factory

New contract: `src/plugin/contracts/BaseV1PluginFactory.sol`

Main functions:

```solidity
constructor(
  address algebraFactory,
  address algebraCustomPoolEntryPoint,
  address pluginImplementation
);

function deployCustomPool(address tokenA, address tokenB, bytes calldata data) external returns (address customPool);

function setPublicPoolCreationMode(bool mode) external;
function setTokenWhitelist(address token, bool allowed) external;
function setTokenWhitelistBatch(address[] calldata tokens, bool allowed) external;
function setDefaultFeeConfiguration(AlgebraFeeConfiguration calldata newConfig) external;
function upgradeTo(address newImplementation) external;

function setTickSpacing(address pool, int24 newTickSpacing) external;
function setPlugin(address pool, address newPluginAddress) external;
function setPluginConfig(address pool, uint8 newConfig) external;
function setFee(address pool, uint16 newFee) external;
```

Added role:

```solidity
bytes32 public constant CUSTOM_POOL_DEPLOYER = keccak256('CUSTOM_POOL_DEPLOYER');
```

Added events:

```solidity
event PublicPoolCreationMode(bool mode);
event TokenWhitelist(address indexed token, bool allowed);
event DefaultFeeConfiguration(AlgebraFeeConfiguration newConfig);
event Upgraded(address indexed implementation);
```

Added custom error:

```solidity
error BeaconInvalidImplementation(address implementation);
```

This error is new in the custom pool factory ABI. The same error name also exists in the base plugin factory interface.

Behavior:

- Private mode requires the caller of `deployCustomPool` to have `CUSTOM_POOL_DEPLOYER`.
- Public mode allows any caller to call `deployCustomPool`.
- Both `tokenA` and `tokenB` must be whitelisted.
- The factory stores pending pool data before calling the entry point.
- `beforeCreatePoolHook` validates caller, deployer, creator, sorted tokens, and `data` hash before deploying the plugin.
- `afterCreatePoolHook` validates pending state and marks the pool in `isCustomPool`.
- Plugins are deployed as beacon proxies using `implementation`.

### Periphery API changes

`ISwapRouter.ExactInputSingleParams` changed:

```solidity
struct ExactInputSingleParams {
  address tokenIn;
  address tokenOut;
  address deployer; // added
  address recipient;
  uint256 deadline;
  uint256 amountIn;
  uint256 amountOutMinimum;
  uint160 limitSqrtPrice;
}
```

`ISwapRouter.ExactOutputSingleParams` changed:

```solidity
struct ExactOutputSingleParams {
  address tokenIn;
  address tokenOut;
  address deployer; // added
  address recipient;
  uint256 deadline;
  uint256 amountOut;
  uint256 amountInMaximum;
  uint160 limitSqrtPrice;
}
```

`IQuoter` changed:

```solidity
function quoteExactInputSingle(
  address tokenIn,
  address tokenOut,
  address deployer,  // added
  uint256 amountIn,
  uint160 limitSqrtPrice
) external returns (uint256 amountOut, uint16 fee);

function quoteExactOutputSingle(
  address tokenIn,
  address tokenOut,
  address deployer,  // added
  uint256 amountOut,
  uint160 limitSqrtPrice
) external returns (uint256 amountIn, uint16 fee);
```

`IQuoterV2` structs changed:

```solidity
struct QuoteExactInputSingleParams {
  address tokenIn;
  address tokenOut;
  address deployer;  // added
  uint256 amountIn;
  uint160 limitSqrtPrice;
}

struct QuoteExactOutputSingleParams {
  address tokenIn;
  address tokenOut;
  address deployer;  // added
  uint256 amount;
  uint160 limitSqrtPrice;
}
```

`INonfungiblePositionManager.positions` now returns `deployer`:

```solidity
function positions(uint256 tokenId)
  external
  view
  returns (
    uint88 nonce,
    address operator,
    address token0,
    address token1,
    address deployer,  // added
    int24 tickLower,
    int24 tickUpper,
    uint128 liquidity,
    uint256 feeGrowthInside0LastX128,
    uint256 feeGrowthInside1LastX128,
    uint128 tokensOwed0,
    uint128 tokensOwed1
  );
```

`INonfungiblePositionManager.MintParams` now includes `deployer`:

```solidity
struct MintParams {
  address token0;
  address token1;
  address deployer;  // added
  int24 tickLower;
  int24 tickUpper;
  uint256 amount0Desired;
  uint256 amount1Desired;
  uint256 amount0Min;
  uint256 amount1Min;
  address recipient;
  uint256 deadline;
}
```

Internal library changes:

- `Path.decodeFirstPool(bytes)` now returns `(address tokenA, address deployer, address tokenB)`.
- `Path` path step size changed from 20 bytes to 40 bytes after the first token.
- `PoolAddress.PoolKey` now includes `address deployer`.
- `PoolAddress.computeAddress` supports classic and custom CREATE2 salt formats.
- `PoolAddress.getPool(factory, key)` resolves pools from the factory registry.
- `CallbackValidation.verifyCallback` now expects a factory address, not a pool deployer address.
- `CallbackValidation` has deployer-aware and factory-registry validation helpers.

## Deployment and custom pool creation process

Recommended setup:

1. Deploy the new `AlgebraPoolDeployer` with the Algebra factory address.
2. Call `AlgebraFactoryUpgradeable.setPoolDeployer(newPoolDeployer)` by factory owner. This is a `reinitializer(2)` function and is intended to run once.
3. Deploy and initialize `AlgebraCustomPoolEntryPoint` with the Algebra factory address.
4. Deploy the plugin implementation used by custom pool plugins.
5. Deploy `BaseV1PluginFactory` with its constructor dependencies:

```solidity
new BaseV1PluginFactory(algebraFactory, algebraCustomPoolEntryPoint, pluginImplementation)
```

6. Grant the entry point `CUSTOM_POOL_DEPLOYER` on the Algebra factory:

```solidity
AlgebraFactoryUpgradeable.grantRole(CUSTOM_POOL_DEPLOYER, algebraCustomPoolEntryPoint);
```

7. Whitelist `BaseV1PluginFactory` as a custom deployer in the entry point while entry point public mode is disabled:

```solidity
AlgebraCustomPoolEntryPoint.setCustomPoolDeployer(baseV1PluginFactory, true);
```

8. Whitelist tokens allowed for custom pool creation:

```solidity
BaseV1PluginFactory.setTokenWhitelist(token, true);
BaseV1PluginFactory.setTokenWhitelistBatch(tokens, true);
```

9. Create a custom pool:

```solidity
BaseV1PluginFactory.deployCustomPool(tokenA, tokenB, data);
```

The custom pool creation call flow is:

```text
caller
  -> BaseV1PluginFactory.deployCustomPool(tokenA, tokenB, data)
  -> AlgebraCustomPoolEntryPoint.createCustomPool(address(BaseV1PluginFactory), caller, tokenA, tokenB, data)
  -> AlgebraFactoryUpgradeable.createCustomPool(...)
  -> AlgebraCustomPoolEntryPoint.beforeCreatePoolHook(...)
  -> BaseV1PluginFactory.beforeCreatePoolHook(...)
  -> AlgebraPoolDeployer.deploy(plugin, token0, token1, customDeployer)
  -> AlgebraCustomPoolEntryPoint.afterCreatePoolHook(...)
  -> BaseV1PluginFactory.afterCreatePoolHook(...)
```

### Turning public custom pool creation on and off

There are two public-mode switches:

```solidity
BaseV1PluginFactory.setPublicPoolCreationMode(bool mode);
AlgebraCustomPoolEntryPoint.setPublicPoolCreationMode(bool mode);
```

For normal public custom pool creation through `BaseV1PluginFactory`, enable public mode on `BaseV1PluginFactory`:

```solidity
BaseV1PluginFactory.setPublicPoolCreationMode(true);
```

This allows any caller to call `deployCustomPool`, but token whitelist checks still apply.

To disable it:

```solidity
BaseV1PluginFactory.setPublicPoolCreationMode(false);
```

When disabled, callers need `CUSTOM_POOL_DEPLOYER` on `BaseV1PluginFactory`.

The entry point public mode is broader. If enabled, any deployer contract can call the entry point directly as long as `msg.sender == deployer`. Keep entry point public mode disabled unless direct custom deployer integrations are intentionally supported.

Classic pool public creation is separate and still controlled by:

```solidity
AlgebraFactoryUpgradeable.setIsPublicPoolCreationMode(bool mode);
```

### Backend and off-chain address calculation

After `setPoolDeployer(newPoolDeployer)` is executed, the old deployer address must not be used for address calculation of newly created pools.

If backend computes classic pool addresses off-chain, update it from:

```text
CREATE2(oldPoolDeployer, keccak256(abi.encode(token0, token1)), POOL_INIT_CODE_HASH)
```

to one of:

```text
factory.computePoolAddress(token0, token1)
factory.poolByPair(token0, token1)
CREATE2(factory.poolDeployer(), keccak256(abi.encode(token0, token1)), POOL_INIT_CODE_HASH)
```

For custom pools, use:

```text
factory.computeCustomPoolAddress(customDeployer, token0, token1)
factory.customPoolByPair(customDeployer, token0, token1)
CREATE2(factory.poolDeployer(), keccak256(abi.encode(customDeployer, token0, token1)), POOL_INIT_CODE_HASH)
```

For existing pools created before the deployer change, do not recompute addresses with the new deployer. Read existing pools from `factory.poolByPair(...)` or persisted historical data.

## Swap router flow and path encoding

The router now resolves pools through the Algebra factory registry:

- `deployer == address(0)` uses `factory.poolByPair(tokenA, tokenB)`.
- `deployer != address(0)` uses `factory.customPoolByPair(deployer, tokenA, tokenB)`.
- Unknown custom deployers do not fall back to the classic pool.

### Single-hop swaps

For classic pools, set `deployer` to `address(0)`:

```solidity
ISwapRouter.ExactInputSingleParams({
  tokenIn: tokenA,
  tokenOut: tokenB,
  deployer: address(0),
  recipient: recipient,
  deadline: deadline,
  amountIn: amountIn,
  amountOutMinimum: amountOutMinimum,
  limitSqrtPrice: 0
});
```

For custom pools, set `deployer` to the custom deployer used to create the pool, usually `BaseV1PluginFactory`:

```solidity
ISwapRouter.ExactInputSingleParams({
  tokenIn: tokenA,
  tokenOut: tokenB,
  deployer: baseV1PluginFactory,
  recipient: recipient,
  deadline: deadline,
  amountIn: amountIn,
  amountOutMinimum: amountOutMinimum,
  limitSqrtPrice: 0
});
```

The same `deployer` field is required for:

- `exactInputSingle`
- `exactOutputSingle`
- `exactInputSingleSupportingFeeOnTransferTokens`
- `quoteExactInputSingle`
- `quoteExactOutputSingle`
- QuoterV2 single-hop params

### Multi-hop path format

Old path format:

```text
token0 | token1 | token2
```

New path format:

```text
token0 | deployer0 | token1 | deployer1 | token2 | ... | deployerN | tokenN+1
```

Each token and each deployer is 20 bytes. The path length for `n` pools is:

```text
20 + n * 40 bytes
```

For each hop:

- `deployer[i]` identifies the pool for `token[i] <-> token[i + 1]`.
- Use `address(0)` for a classic pool hop.
- Use the custom deployer address for a custom pool hop.

TypeScript helper:

```ts
import { ZeroAddress } from 'ethers';

function encodeRoutePath(tokens: string[], deployers: string[]): string {
  if (tokens.length !== deployers.length + 1) throw new Error('Invalid route');

  let encoded = '0x';
  for (let i = 0; i < deployers.length; i++) {
    encoded += tokens[i].slice(2);
    encoded += deployers[i].slice(2);
  }
  encoded += tokens[tokens.length - 1].slice(2);

  return encoded.toLowerCase();
}

const classicThenCustom = encodeRoutePath(
  [tokenA, tokenB, tokenC],
  [ZeroAddress, baseV1PluginFactory]
);
```

Exact input example for `tokenA -> tokenB -> tokenC`:

```text
tokenA | deployerAB | tokenB | deployerBC | tokenC
```

Exact output paths are still reversed. For an exact output swap where the economic route is `tokenA -> tokenB -> tokenC`, encode:

```text
tokenC | deployerBC | tokenB | deployerAB | tokenA
```

Legacy token-only paths are no longer valid for router/quoter multi-hop calls. Even a fully classic route must include zero deployers:

```text
tokenA | address(0) | tokenB | address(0) | tokenC
```
