// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';

/// @title HyperCore spot-price oracle reader (HyperEVM precompile 0x0808)
/// @notice Reads a HyperCore spot price and converts it to an Algebra raw price tick.
/// @dev Spot-only. Every rejected result returns available=false. The precompile call has a fixed gas stipend
/// and copies at most one 32-byte output word. The caller uses its internal-TWAP fallback when unavailable.
library HyperCoreSpotOracle {
  address internal constant SPOT_PX_PRECOMPILE = 0x0000000000000000000000000000000000000808;

  /// @dev Measurement candidate. Confirm valid and invalid reads on live HyperEVM before deployment.
  uint256 internal constant PRECOMPILE_GAS_STIPEND = 20_000;
  uint256 internal constant MAX_RAW_PRICE = 1e30;
  uint256 internal constant MAX_PRICE_EXP = 60;

  function getOracleTick(uint256 spotIndex, uint256 priceExp, bool inverted) internal view returns (int24 tick, bool available) {
    return _readTick(SPOT_PX_PRECOMPILE, spotIndex, priceExp, inverted);
  }

  function _readTick(address precompile, uint256 index, uint256 priceExp, bool inverted) private view returns (int24 tick, bool available) {
    bool success;
    uint256 returnSize;
    uint256 priceRaw;

    // A sub-32-byte result can leave input bytes in the scratch word, but returnSize is checked before priceRaw
    // is used. A failed callee can burn at most the forwarded stipend; arbitrary returndata is never copied.
    assembly ('memory-safe') {
      let ptr := mload(0x40)
      mstore(ptr, index)
      success := staticcall(PRECOMPILE_GAS_STIPEND, precompile, ptr, 0x20, ptr, 0x20)
      returnSize := returndatasize()
      priceRaw := mload(ptr)
    }

    if (!success || returnSize != 32) return (0, false);
    return tryConvertPriceToTick(priceRaw, priceExp, inverted);
  }

  /// @dev Internal pure conversion split from the call boundary so the exact production arithmetic can be
  /// fuzzed and symbolically checked without replacing the HyperEVM precompile.
  function tryConvertPriceToTick(uint256 priceRaw, uint256 priceExp, bool inverted) internal pure returns (int24 tick, bool available) {
    if (priceRaw == 0 || priceRaw > MAX_RAW_PRICE) return (0, false);
    if (priceExp > MAX_PRICE_EXP) return (0, false);

    uint256 denom = 10 ** priceExp;
    uint256 maxX192Operand = type(uint256).max >> 192;
    uint256 ratioX192;
    if (inverted) {
      if (denom > maxX192Operand) return (0, false);
      ratioX192 = Math.mulDiv(denom, 1 << 192, priceRaw);
    } else {
      if (priceRaw > maxX192Operand) return (0, false);
      ratioX192 = Math.mulDiv(priceRaw, 1 << 192, denom);
    }

    uint256 sqrtPriceX96 = Math.sqrt(ratioX192);
    if (sqrtPriceX96 < TickMath.MIN_SQRT_RATIO || sqrtPriceX96 >= TickMath.MAX_SQRT_RATIO) return (0, false);

    tick = TickMath.getTickAtSqrtRatio(uint160(sqrtPriceX96));
    available = true;
  }
}
