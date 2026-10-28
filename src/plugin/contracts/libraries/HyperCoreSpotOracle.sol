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
  uint256 internal constant MAX_RAW_PRICE = type(uint64).max;
  int256 internal constant MAX_PRICE_EXP = 60;

  function getOracleTick(uint256 spotIndex, int8 priceExp, bool inverted) internal view returns (int24 tick, bool available) {
    return _readTick(SPOT_PX_PRECOMPILE, spotIndex, priceExp, inverted);
  }

  function _readTick(address precompile, uint256 index, int8 priceExp, bool inverted) private view returns (int24 tick, bool available) {
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
  function tryConvertPriceToTick(uint256 priceRaw, int8 priceExp, bool inverted) internal pure returns (int24 tick, bool available) {
    if (priceRaw == 0 || priceRaw > MAX_RAW_PRICE) return (0, false);
    int256 signedExp = int256(priceExp);
    if (signedExp < -MAX_PRICE_EXP || signedExp > MAX_PRICE_EXP) return (0, false);

    bool negativeExp = signedExp < 0;
    uint256 scale = 10 ** uint256(negativeExp ? -signedExp : signedExp);
    uint256 q192 = 1 << 192;
    uint256 maxX192Operand = type(uint256).max >> 192;
    uint256 ratioX192;
    if (inverted) {
      if (negativeExp) {
        // floor(floor(Q192 / priceRaw) / scale) == floor(Q192 / (priceRaw * scale)),
        // without forming the potentially overflowing denominator product.
        ratioX192 = q192 / priceRaw / scale;
      } else {
        // The quotient check guarantees the full-precision mulDiv result fits in uint256.
        if (scale / priceRaw > maxX192Operand) return (0, false);
        ratioX192 = Math.mulDiv(scale, q192, priceRaw);
      }
    } else {
      if (negativeExp) {
        if (scale > maxX192Operand || priceRaw > maxX192Operand / scale) return (0, false);
        ratioX192 = (priceRaw * scale) << 192;
      } else {
        // The quotient check guarantees the full-precision mulDiv result fits in uint256.
        if (priceRaw / scale > maxX192Operand) return (0, false);
        ratioX192 = Math.mulDiv(priceRaw, q192, scale);
      }
    }

    uint256 sqrtPriceX96 = Math.sqrt(ratioX192);
    if (sqrtPriceX96 < TickMath.MIN_SQRT_RATIO || sqrtPriceX96 >= TickMath.MAX_SQRT_RATIO) return (0, false);

    tick = TickMath.getTickAtSqrtRatio(uint160(sqrtPriceX96));
    available = true;
  }
}
