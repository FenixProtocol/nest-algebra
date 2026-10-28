// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../NestMEVFeePlugin.sol';

/// @dev Test-only Nest MEV plugin with controllable time.
contract MockTimeNestMEVFeePlugin is NestMEVFeePlugin {
  uint256 public time;

  function advanceTime(uint256 by) external {
    unchecked {
      time += by;
    }
  }

  function blockStartState() external view returns (uint32 startBlock, int24 startTick) {
    return (_blockStartBlock, _blockStartTick);
  }

  function _blockTimestamp() internal view override returns (uint32) {
    return uint32(time);
  }
}
