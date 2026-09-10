// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './base/NestFeePluginFactory.sol';

/// @title Nest TWAP fee plugin factory
/// @notice Creates beacon-proxy Nest self-TWAP fee plugins for standard and custom Algebra pools.
contract NestTWAPFeePluginFactory is NestFeePluginFactory {
  constructor(
    address _algebraFactory,
    address _algebraCustomPoolEntryPoint,
    address _pluginImplementation
  ) NestFeePluginFactory(_algebraFactory, _algebraCustomPoolEntryPoint, _pluginImplementation) {}
}
