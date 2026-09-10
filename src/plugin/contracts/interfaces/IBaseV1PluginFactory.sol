// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '../base/AlgebraFeeConfiguration.sol';
import './INestFeePluginFactory.sol';

/// @title Interface for the Algebra base V1 plugin factory
/// @notice Creates Algebra base V1 plugins for standard, existing, and custom pools.
interface IBaseV1PluginFactory is INestFeePluginFactory {
  /// @notice Emitted when the default fee configuration is changed.
  event DefaultFeeConfiguration(AlgebraFeeConfiguration newConfig);

  /// @notice Current default dynamic fee configuration for newly created plugins.
  function defaultFeeConfiguration()
    external
    view
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee);

  /// @notice Changes initial fee configuration for new plugins.
  function setDefaultFeeConfiguration(AlgebraFeeConfiguration calldata newConfig) external;
}
