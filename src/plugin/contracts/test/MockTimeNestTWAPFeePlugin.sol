// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../NestTWAPFeePlugin.sol';

/// @dev Test-only Nest TWAP plugin with controllable time.
contract MockTimeNestTWAPFeePlugin is NestTWAPFeePlugin {
  using VolatilityOracle for VolatilityOracle.Timepoint[UINT16_MODULO];

  uint256 public time;

  function advanceTime(uint256 by) external {
    unchecked {
      time += by;
    }
  }

  function batchUpdate(uint32[] calldata advances, int24[] calldata ticks) external {
    require(advances.length == ticks.length);
    uint16 index = timepointIndex;
    uint32 currentTime = lastTimepointTimestamp;
    unchecked {
      for (uint256 i; i < advances.length; ++i) {
        currentTime += advances[i];
        (index, ) = timepoints.write(index, currentTime, ticks[i]);
      }
    }
    lastTimepointTimestamp = currentTime;
    timepointIndex = index;
    time = currentTime;
  }

  function _blockTimestamp() internal view override returns (uint32) {
    return uint32(time);
  }
}
