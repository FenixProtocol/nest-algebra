# HyperCore Oracle and Market Metadata on HyperEVM

This document describes how Nest contracts can read HyperCore spot prices from HyperEVM, validate the identity of a configured spot market, derive the price orientation used by an Algebra pool, and normalize the price for ERC-20 decimals.

It distinguishes three kinds of information:

- **Official protocol behavior** documented by Hyperliquid.
- **Observed mainnet state** reproduced through the official HyperEVM RPC on 27 October 2026.
- **Nest governance assumptions** that cannot be proven from HyperCore metadata alone.

The primary use case is removing the operator-supplied `inverted` and `priceExp` values from the trust boundary of `NestMEVFeePlugin.setOracleConfig`.

## Official sources

- [Interacting with HyperCore](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore) documents read precompiles, their state guarantee, price scaling, failure behavior, and gas formula.
- [Official `L1Read.sol`](https://2356094849-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FyUdp569E6w18GdfqlGvJ%2Fuploads%2FLXZLGWjNoZCV4IpfEQUJ%2FL1Read.sol?alt=media&token=f19b1226-95bc-4ad4-9bbc-a55665676b92) defines the current precompile addresses, inputs, and return structures.
- [Spot Info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot) documents the off-chain `spotMeta` and `spotMetaAndAssetCtxs` responses and provides token-ordering examples.
- [HyperCore and HyperEVM transfers](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/hypercore-less-than-greater-than-hyperevm-transfers) documents Core/EVM token linking, decimal differences, native HYPE, and linked-contract caveats.
- [Wrapped HYPE](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/wrapped-hype) documents the canonical immutable WHYPE contract.
- [HyperEVM JSON-RPC](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/json-rpc) documents limitations of the default RPC, including historical read-precompile data.

Documentation and precompile ABIs can change. Pin the ABI used in production, test it on the target network, and review official changes before deployment or an implementation upgrade.

## HyperCore read-precompile model

HyperCore and HyperEVM are parts of the same Hyperliquid state machine. HyperEVM contracts access selected HyperCore state through system precompiles.

The official documentation states that read-precompile values match the latest HyperCore state when the EVM block is constructed. A value is therefore consensus-backed on the target HyperEVM block, but it is not a separately signed oracle report and it does not include a price timestamp.

Calls use raw ABI-encoded arguments without a Solidity function selector:

```solidity
(bool success, bytes memory result) = PRECOMPILE.staticcall(abi.encode(input));
```

Invalid inputs cause the precompile call frame to fail and consume all gas forwarded to that frame. The documented precompile gas charge is:

```text
2,000 + 65 * (input length + output length)
```

Use a bounded gas stipend and treat any failed call, unexpected output size, or failed decode as unavailable data. The metadata calls should be made only during configuration; they are not required on every swap.

The official documentation page still uses the phrase "testnet EVM" for read precompiles. The spot-price and metadata precompiles described below were independently observed working through the official mainnet RPC.

## Relevant precompiles

| Function | Address | Input | Return value | Nest use |
| --- | --- | --- | --- | --- |
| `spotPx` | `0x0000000000000000000000000000000000000808` | `uint32 spotIndex` | `uint64 priceRaw` | Read a live HyperCore spot price |
| `spotInfo` | `0x000000000000000000000000000000000000080b` | `uint32 spotIndex` | `SpotInfo` | Resolve a spot market to its base and quote token indices |
| `tokenInfo` | `0x000000000000000000000000000000000000080c` | `uint32 tokenIndex` | `TokenInfo` | Resolve token identity, linked EVM contract, and decimal metadata |
| `bbo` | `0x000000000000000000000000000000000000080e` | `uint32 asset` | `Bbo` | Optional best-bid/best-ask availability or spread check |

The official ABI structures are:

```solidity
struct SpotInfo {
  string name;
  uint64[2] tokens;
}

struct TokenInfo {
  string name;
  uint64[] spots;
  uint64 deployerTradingFeeShare;
  address deployer;
  address evmContract;
  uint8 szDecimals;
  uint8 weiDecimals;
  int8 evmExtraWeiDecimals;
}

struct Bbo {
  uint64 bid;
  uint64 ask;
}
```

`SpotInfo` and `TokenInfo` contain dynamic ABI values. Their returndata is larger than the 32-byte `spotPx` response. Do not reuse the current 20,000-gas spot-price stipend without measuring the metadata calls. Configuration code should also cap acceptable returndata before copying or decoding it.

### Outcome assets

The current official `L1Read.sol` states that `spotPx` also accepts an encoded outcome-asset ID:

```text
100,000,000 + outcome * 10 + side
```

Values below `100,000,000` retain their historical interpretation as raw spot-market indices. Nest's current oracle configuration is intended for ordinary spot indices and should reject outcome encodings unless outcome support is explicitly designed and audited.

## Off-chain Info API

Hyperliquid also provides the HTTP Info API:

```http
POST https://api.hyperliquid.xyz/info
Content-Type: application/json

{"type":"spotMeta"}
```

The response contains:

- `universe`: spot markets with `index`, `name`, `tokens`, and `isCanonical`;
- `tokens`: token records with `index`, names, decimal metadata, token IDs, and optional EVM links.

`spotMetaAndAssetCtxs` adds human-readable market context such as mark and mid prices.

The HTTP API is useful for deployment tooling, monitoring, and comparing precompile results. It cannot be called by Solidity and must not be the on-chain source of truth for arming the plugin.

## Spot token ordering and price units

The official Spot API example defines market `0` as:

```json
{
  "name": "PURR/USDC",
  "tokens": [1, 0],
  "index": 0
}
```

Token index `1` is PURR and token index `0` is USDC. This establishes the market-token ordering used here:

```text
SpotInfo.tokens[0] = base token
SpotInfo.tokens[1] = quote token
spotPx              = quote human units per base human unit
```

The documented spot-price conversion is:

```text
humanPrice = priceRaw / 10^(8 - baseToken.szDecimals)
```

Consequently, `szDecimals` of the **base** token determines the `spotPx` scale. `weiDecimals` is not the price exponent.

## Validating `spotIndex` on-chain

The plugin does not need a reverse address-to-token registry when the caller already supplies `spotIndex`. It can resolve the proposed market and compare both sides with the pool:

1. Read `IAlgebraPool(pool).token0()` and `token1()`.
2. Call `spotInfo(spotIndex)`.
3. Interpret `tokens[0]` as the HyperCore base index and `tokens[1]` as the quote index.
4. Require both indices to fit the `uint32` input accepted by `tokenInfo`.
5. Call `tokenInfo` for both indices.
6. Match both pool-token addresses to the returned `evmContract` addresses or to explicitly approved representations.
7. Optionally verify that `spotIndex` appears in both returned `TokenInfo.spots` arrays as a metadata-consistency check.
8. Reject ambiguous, partial, or unrelated matches.

Conceptually:

```solidity
SpotInfo memory spot = _readSpotInfo(spotIndex);
TokenInfo memory base = _readTokenInfo(_toUint32(spot.tokens[0]));
TokenInfo memory quote = _readTokenInfo(_toUint32(spot.tokens[1]));

address token0 = IAlgebraPool(pool).token0();
address token1 = IAlgebraPool(pool).token1();

bool forward = _isRepresentation(spot.tokens[0], token0, base)
  && _isRepresentation(spot.tokens[1], token1, quote);
bool reverse = _isRepresentation(spot.tokens[0], token1, base)
  && _isRepresentation(spot.tokens[1], token0, quote);

require(forward != reverse, "Spot market does not match pool");
```

Do not compare `name`, ticker symbols, or `SpotInfo.name`. Symbols are not unique token identities. Exact linked addresses are preferable; approved aliases require governance trust.

### Meaning and limitation of `evmContract`

`TokenInfo.evmContract` is the EVM address linked to that HyperCore token. Matching it proves that HyperCore records the supplied contract as the token's linked representation.

It does not prove that the linked contract is a correct ERC-20 or economically fungible with another asset. Hyperliquid explicitly warns that a linked contract may contain arbitrary bytecode and that users should not blindly assume Core/EVM fungibility. Nest must separately require a usable ERC-20, validate `decimals()`, and understand any proxy or issuer risk.

## Deriving `inverted`

An Algebra price and tick represent the raw-unit ratio:

```text
token1 smallest units / token0 smallest units
```

HyperCore `spotPx` represents:

```text
quote human units / base human unit
```

The orientation follows directly from the verified token ordering:

| Algebra pool ordering | Algebra ratio | Derived `inverted` |
| --- | --- | --- |
| `token0 = base`, `token1 = quote` | quote/base | `false` |
| `token0 = quote`, `token1 = base` | base/quote | `true` |

Therefore `inverted` should be derived rather than accepted as an independent manager input:

```solidity
bool inverted;
if (forward) {
  inverted = false;
} else if (reverse) {
  inverted = true;
} else {
  revert("Spot market does not match pool");
}
```

This closes the wrong-inversion configuration path described by audit Issue 49 for markets whose token identity can be established.

## Deriving the decimal normalization

Define:

```text
E  = 8 - base.szDecimals
Db = ERC-20 decimals of the pool token representing the HyperCore base
Dq = ERC-20 decimals of the pool token representing the HyperCore quote
```

For the arithmetic currently implemented by `HyperCoreSpotOracle`, the derived exponent is:

```text
priceExp = E + Db - Dq
```

The exponent is the same in both orientations. Only `inverted` changes.

For a directly linked EVM token, configuration can additionally check the documented Core/EVM decimal relationship:

```text
EVM decimals = weiDecimals + evmExtraWeiDecimals
```

Use signed arithmetic for this check because `evmExtraWeiDecimals` can be negative. The official linking documentation currently bounds this difference to `[-2, 18]`.

### Recommended rational conversion

The current oracle library represents decimal normalization only as division by an unsigned power of ten. That cannot represent every possible token-decimal combination. A clearer implementation constructs the exact rational Algebra raw price.

When `token0 = base` and `token1 = quote`:

```text
ratio = priceRaw * 10^Dq / (10^E * 10^Db)
```

When `token0 = quote` and `token1 = base`:

```text
ratio = 10^E * 10^Db / (priceRaw * 10^Dq)
```

It can then be converted to Q192 using full-precision `Math.mulDiv`:

```solidity
uint256 scale = 10 ** (8 - base.szDecimals);
uint256 numerator;
uint256 denominator;

if (!inverted) {
  numerator = priceRaw * 10 ** quoteDecimals;
  denominator = scale * 10 ** baseDecimals;
} else {
  numerator = scale * 10 ** baseDecimals;
  denominator = priceRaw * 10 ** quoteDecimals;
}

uint256 ratioX192 = Math.mulDiv(numerator, 1 << 192, denominator);
```

Production code must bound all decimal values before exponentiation, reject zero prices, check intermediate multiplication bounds, validate the resulting square-root price against `TickMath`, and return `available = false` rather than reverting on the swap path.

## Native HYPE and canonical WHYPE

HYPE is special. Hyperliquid documents it as the native HyperEVM gas token rather than an ERC-20 linked through the normal token flow. Its HyperCore `TokenInfo.evmContract` is therefore zero.

Algebra pools require token contracts, so HYPE pools use canonical WHYPE:

```text
0x5555555555555555555555555555555555555555
```

The official WHYPE documentation identifies this as an immutable canonical system contract with 18 decimals. A Nest identity resolver may safely encode the reviewed special case:

```text
HyperCore token 150 / HYPE
    -> canonical WHYPE 0x5555555555555555555555555555555555555555
```

The token index must still be confirmed for the target network and deployment. Do not generalize the HYPE exception to arbitrary wrappers.

## Approved representation registry

Exact `TokenInfo.evmContract` matching is not sufficient when a pool intentionally uses:

- canonical WHYPE for native HYPE;
- another issued representation of a quote asset;
- a wrapped or bridged representation;
- a derivative intended to track, but not equal, a HyperCore asset.

Use a small, explicit registry:

```solidity
mapping(uint64 hyperCoreToken => mapping(address evmToken => bool))
  public approvedRepresentation;
```

Resolution can prefer exact links and then consult governance-approved representations:

```solidity
function _isRepresentation(
  uint64 coreToken,
  address poolToken,
  TokenInfo memory info
) internal view returns (bool) {
  if (info.evmContract != address(0) && info.evmContract == poolToken) {
    return true;
  }
  return approvedRepresentation[coreToken][poolToken];
}
```

Every alias is a governance and economic assumption. It should be separately documented, emitted in events, timelocked where possible, and removable before the associated oracle can be armed. A price-pegged derivative is not automatically the same asset and may need its own oracle or conversion rate.

## Nest mainnet case study

The following values were observed on 27 October 2026 near HyperEVM block `49,647,409`. They are evidence of the ABI and derivation, not immutable protocol constants.

### Market 107

Calling `spotInfo(107)` returned:

```text
name   = "@107"
tokens = [150, 0]
```

Calling `tokenInfo(150)` returned the relevant values:

```text
name          = "HYPE"
evmContract   = 0x0000000000000000000000000000000000000000
szDecimals    = 2
weiDecimals   = 8
spots         = [107, 207, 232, 255]
```

Calling `tokenInfo(0)` returned the relevant values:

```text
name                = "USDC"
evmContract         = 0x6b9e773128f453f5c2c60935ee2de2cbc5390a24
szDecimals          = 8
weiDecimals         = 8
evmExtraWeiDecimals = -2
```

An observed `spotPx(107)` value was `77,738,000`. Applying the official scale for base HYPE:

```text
77,738,000 / 10^(8 - 2) = 77.738 quote units per HYPE
```

### Nest pool identity

The reviewed Nest pool was:

```text
0xbe512f5881b85c48d9c17bc5bb2be047d156d696
```

Its live immutable token addresses and decimals were:

```text
token0 = 0x5555555555555555555555555555555555555555  // WHYPE, 18 decimals
token1 = 0xb88339CB7199b77E23DB6E890353E22632Ba630f  // pool quote token, 6 decimals
```

With approved representations for HYPE and the quote asset:

```text
token0 represents base
token1 represents quote
inverted = false

priceExp = (8 - 2) + 18 - 6 = 18
```

This independently derives the expected `inverted = false` and `priceExp = 18`.

### Identity limitation for this pool

The HYPE side can be resolved through the officially documented WHYPE special case. The quote side cannot be proven by exact HyperCore linkage because:

```text
HyperCore token 0 linked EVM contract:
  0x6b9e773128f453f5c2c60935ee2de2cbc5390a24

Nest pool token1:
  0xb88339CB7199b77E23DB6E890353E22632Ba630f
```

The Nest quote token therefore needs an explicit approved-representation entry. On-chain metadata alone cannot prove its economic equivalence to HyperCore USDC. This assumption must remain visible in governance and risk documentation.

## Reproduction commands

The precompiles take a single 32-byte ABI word containing the index.

Read market `107` (`0x6b`):

```bash
cast call 0x000000000000000000000000000000000000080b \
  0x000000000000000000000000000000000000000000000000000000000000006b \
  --rpc-url https://rpc.hyperliquid.xyz/evm
```

Read token `150` (`0x96`):

```bash
cast call 0x000000000000000000000000000000000000080c \
  0x0000000000000000000000000000000000000000000000000000000000000096 \
  --rpc-url https://rpc.hyperliquid.xyz/evm
```

Read the spot price for market `107`:

```bash
cast call 0x0000000000000000000000000000000000000808 \
  0x000000000000000000000000000000000000000000000000000000000000006b \
  --rpc-url https://rpc.hyperliquid.xyz/evm
```

Read the Nest pool tokens:

```bash
cast call 0xbe512f5881b85c48d9c17bc5bb2be047d156d696 \
  'token0()(address)' \
  --rpc-url https://rpc.hyperliquid.xyz/evm

cast call 0xbe512f5881b85c48d9c17bc5bb2be047d156d696 \
  'token1()(address)' \
  --rpc-url https://rpc.hyperliquid.xyz/evm
```

The default Hyperliquid RPC does not provide arbitrary historical precompile evaluation. Official documentation states that read-precompile results are recorded only for calls actually made in a block; hypothetical historical results require a full HyperCore replay. Treat the observations above as point-in-time evidence.

## Security requirements

An implementation should satisfy all of the following:

- Resolve a proposed `spotIndex` through `spotInfo` before arming.
- Resolve both token indices through `tokenInfo`.
- Compare addresses, never names or symbols.
- Derive `inverted`; do not trust a caller-provided flag.
- Derive decimal normalization from base `szDecimals` and actual pool-token decimals.
- Prefer direct rational conversion over an unsigned operator-provided exponent.
- Validate the documented Core/EVM decimal relationship for directly linked tokens.
- Require explicit governance approval for WHYPE, wrappers, bridges, and other aliases.
- Reject an alias that maps one pool token to both sides of a market.
- Reject unsupported native assets, outcome assets, extreme decimals, zero prices, malformed returndata, and out-of-range ticks.
- Use bounded gas for precompile calls; invalid inputs burn all forwarded gas.
- Cap returndata before decoding dynamic metadata.
- Keep metadata calls on the configuration path, not the per-swap path.
- Freeze the derived market identity while armed.
- Retain a narrow activation gap check as defense in depth, not as proof of identity.
- Consider a separate runtime market-health policy. `SpotInfo` proves token identity but does not establish that a market remains liquid, active, unmanipulated, or economically suitable.

## Recommended configuration flow

```text
fee manager proposes spotIndex
        |
        v
read pool token0/token1
        |
        v
spotInfo(spotIndex) -> base index, quote index
        |
        v
tokenInfo(base), tokenInfo(quote)
        |
        v
exact linked-address or approved-representation match
        |
        +---- mismatch ----> reject
        |
        v
derive orientation and decimal normalization
        |
        v
read spotPx and convert to Algebra tick
        |
        v
apply narrow activation-gap and remaining arming checks
        |
        v
store derived identity and arm
```

This makes `spotIndex` the only proposed market identifier while `inverted` and price normalization become deterministic consequences of verified on-chain metadata and explicit representation policy.
