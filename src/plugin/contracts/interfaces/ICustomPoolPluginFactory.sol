// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@openzeppelin/contracts/proxy/beacon/IBeacon.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPluginFactory.sol';

import '../base/AlgebraFeeConfiguration.sol';

/// @title Interface for the Algebra custom pool plugin factory
/// @notice Creates custom pools and deploys plugins for them.
interface ICustomPoolPluginFactory is IAlgebraPluginFactory, IBeacon {
  /// @notice Emitted when public pool creation mode is changed.
  event PublicPoolCreationMode(bool mode);

  /// @notice Emitted when a token whitelist status is changed.
  event TokenWhitelist(address indexed token, bool allowed);

  /// @notice Emitted when the default fee configuration is changed.
  event DefaultFeeConfiguration(AlgebraFeeConfiguration newConfig);

  /// @dev Emitted when the implementation returned by the beacon is changed.
  event Upgraded(address indexed implementation);

  /// @dev The implementation returned by the beacon is invalid.
  error BeaconInvalidImplementation(address implementation);

  /// @notice Role that can deploy custom pools when public creation mode is disabled.
  function CUSTOM_POOL_DEPLOYER() external view returns (bytes32);

  /// @notice Algebra factory used for custom pool deployment.
  function factory() external view returns (address);

  /// @notice Algebra custom pool entry point used to create and manage custom pools.
  function algebraCustomPoolEntryPoint() external view returns (address);

  /// @notice Whether custom pool creation is public.
  function isPublicPoolCreationMode() external view returns (bool);

  /// @notice Current default dynamic fee configuration for newly created plugins.
  function defaultFeeConfiguration()
    external
    view
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee);

  /// @notice Plugin created for a custom pool.
  function pluginByPool(address pool) external view returns (address plugin);

  /// @notice Whether a token can be used for custom pool creation.
  function isWhitelistedToken(address token) external view returns (bool allowed);

  /// @notice Whether a pool was created through this factory.
  function isCustomPool(address pool) external view returns (bool allowed);

  /// @notice Initializes the upgradeable custom pool plugin factory.
  function initialize(address factory, address algebraCustomPoolEntryPoint, address pluginImplementation) external;

  /// @notice Deploys a custom pool with a newly created default plugin.
  function deployCustomPool(address tokenA, address tokenB, bytes calldata data) external returns (address customPool);

  /// @notice Changes tick spacing in a custom pool created by this factory.
  function setTickSpacing(address pool, int24 newTickSpacing) external;

  /// @notice Changes plugin address in a custom pool created by this factory.
  function setPlugin(address pool, address newPluginAddress) external;

  /// @notice Changes plugin config in a custom pool created by this factory.
  function setPluginConfig(address pool, uint8 newConfig) external;

  /// @notice Changes fee in a custom pool created by this factory.
  function setFee(address pool, uint16 newFee) external;

  /// @notice Changes public custom pool creation mode.
  function setPublicPoolCreationMode(bool mode) external;

  /// @notice Changes a token whitelist status.
  function setTokenWhitelist(address token, bool allowed) external;

  /// @notice Changes whitelist status for a batch of tokens.
  function setTokenWhitelistBatch(address[] calldata tokens, bool allowed) external;

  /// @notice Changes initial fee configuration for new plugins.
  function setDefaultFeeConfiguration(AlgebraFeeConfiguration calldata newConfig) external;

  /// @notice Upgrades the beacon to a new implementation.
  function upgradeTo(address newImplementation) external;
}
