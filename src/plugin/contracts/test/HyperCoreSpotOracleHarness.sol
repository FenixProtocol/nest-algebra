// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../libraries/HyperCoreSpotOracle.sol';

contract HyperCoreSpotOracleHarness {
  function getOracleTick(uint256 spotIndex, uint256 priceExp, bool inverted) external view returns (int24 tick, bool available) {
    return HyperCoreSpotOracle.getOracleTick(spotIndex, priceExp, inverted);
  }

  function convertPrice(uint256 raw, uint256 exp, bool inverted) external pure returns (int24 tick, bool available) {
    return HyperCoreSpotOracle.tryConvertPriceToTick(raw, exp, inverted);
  }
}
