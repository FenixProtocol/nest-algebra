// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol';

import './base/NestFeePluginFactory.sol';
import './interfaces/IAlgebraBasePluginV1.sol';
import './interfaces/IBaseV1PluginFactory.sol';
import './libraries/AdaptiveFee.sol';

/// @title Algebra base V1 plugin factory
/// @notice Creates beacon-proxy Algebra base V1 plugins for standard and custom Algebra pools.
contract BaseV1PluginFactory is NestFeePluginFactory, IBaseV1PluginFactory {
  AlgebraFeeConfiguration public override defaultFeeConfiguration;

  constructor(
    address _algebraFactory,
    address _algebraCustomPoolEntryPoint,
    address _pluginImplementation
  ) NestFeePluginFactory(_algebraFactory, _algebraCustomPoolEntryPoint, _pluginImplementation) {
    defaultFeeConfiguration = AdaptiveFee.initialFeeConfiguration();
    emit DefaultFeeConfiguration(defaultFeeConfiguration);
  }

  /// @inheritdoc IBaseV1PluginFactory
  function setDefaultFeeConfiguration(AlgebraFeeConfiguration calldata newConfig) external override onlyAdministrator {
    AdaptiveFee.validateFeeConfiguration(newConfig);
    defaultFeeConfiguration = newConfig;
    emit DefaultFeeConfiguration(newConfig);
  }

  function _createPlugin(address pool) internal override returns (address plugin) {
    require(pluginByPool[pool] == address(0), 'Already created');
    IAlgebraBasePluginV1 basePlugin = IAlgebraBasePluginV1(address(new BeaconProxy(address(this), '')));
    basePlugin.initialize(pool, algebraFactory, address(this));
    basePlugin.changeFeeConfiguration(defaultFeeConfiguration);
    plugin = address(basePlugin);
    pluginByPool[pool] = plugin;
  }
}
