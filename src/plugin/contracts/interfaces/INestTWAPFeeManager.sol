// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraDynamicFeePlugin.sol';

/// @title The interface for the Nest TWAP-deviation fee manager
/// @notice Manages a dynamic fee that grows with the deviation of the current tick from the TWAP tick.
/// The pre-swap fee is charged to the complete swap; economic suitability is assessed separately for
/// the relevant liquidity, execution path and external-market conditions.
interface INestTWAPFeeManager is IAlgebraDynamicFeePlugin {
  /// @notice Emitted when the deviation fee configuration is changed
  /// @param baseFee The fee charged on all swaps, in hundredths of a bip (1e-6)
  /// @param feeCap The maximum total fee, in hundredths of a bip (1e-6)
  /// @param scalingFactor Extra fee per tick of deviation, scaled by SCALING_PRECISION
  /// @param twapWindow The TWAP lookback window, in seconds
  event DeviationFeeConfigChanged(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow);

  /// @notice Current deviation fee configuration
  /// @return baseFee The fee charged on all swaps, in hundredths of a bip (1e-6)
  /// @return feeCap The maximum total fee, in hundredths of a bip (1e-6)
  /// @return scalingFactor Extra fee per tick of deviation, scaled by SCALING_PRECISION. 0 disables the dynamic part
  /// @return twapWindow The TWAP lookback window, in seconds
  function deviationFeeConfig() external view returns (uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow);

  /// @notice Returns the time-weighted average tick over the configured window
  /// @return twapTick The TWAP tick
  /// @return available False if the oracle does not yet cover the window (fee falls back to baseFee)
  function getTwapTick() external view returns (int24 twapTick, bool available);

  /// @notice True when stored timepoint history covers `window` seconds.
  function isTwapReady(uint32 window) external view returns (bool);

  /// @notice Changes the deviation fee configuration for the pool
  /// @dev Callable by the plugin factory or holders of the `DEVIATION_FEE_MANAGER` role.
  function setDeviationFeeConfig(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow) external;
}
