// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import './plugins/IVolatilityOracle.sol';
import './INestTWAPFeeManager.sol';
import './plugins/IFarmingPlugin.sol';

/// @title The interface for the NestTWAPFeePlugin
/// @notice This contract combines the standard volatility oracle and a TWAP-deviation based dynamic fee
/// @dev The fee is recalculated on every swap:
/// fee = min(baseFee + scalingFactor * |tick - twapTick| / SCALING_PRECISION, feeCap)
interface INestTWAPFeePlugin is IVolatilityOracle, INestTWAPFeeManager, IFarmingPlugin {
  /// @notice Initialize the plugin externally
  /// @dev This function allows to initialize the plugin if it was created after the pool was created
  function initialize() external;

  /// @notice Initialize factory-created proxy storage.
  /// @dev Callable only once and only by the plugin factory declared in the arguments.
  function initialize(address _pool, address _factory, address _pluginFactory) external;
}
