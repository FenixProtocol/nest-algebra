// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPluginFactory.sol';
import '@openzeppelin/contracts/proxy/beacon/IBeacon.sol';

/// @title Shared interface for the Nest fee-plugin factories
/// @notice A factory creates one current Nest TWAP or MEV beacon-proxy plugin per Algebra pool.
interface INestFeePluginFactory is IAlgebraPluginFactory, IBeacon {
  /// @notice Emitted when public custom-pool creation mode changes.
  event PublicPoolCreationMode(bool mode);

  /// @notice Emitted when the default deviation fee configuration is changed
  /// @param baseFee The default fee charged on all swaps, in hundredths of a bip (1e-6)
  /// @param feeCap The default maximum total fee, in hundredths of a bip (1e-6)
  /// @param scalingFactor The default extra fee per tick of deviation, scaled by 1e6
  /// @param twapWindow The default TWAP lookback window, in seconds
  event DefaultDeviationFeeConfiguration(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow);

  /// @notice Emitted when the farming address is changed
  /// @param newFarmingAddress The farming address after the address was changed
  event FarmingAddress(address newFarmingAddress);

  /// @dev Emitted when the implementation returned by the beacon is changed.
  /// @param implementation The new implementation address after changed
  event Upgraded(address indexed implementation);

  /// @dev The `implementation` of the beacon is invalid.
  error BeaconInvalidImplementation(address implementation);

  /// @notice The hash of 'ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR' used as role
  /// @dev Identifies the role authorized to change Nest fee-plugin factory settings.
  function ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR() external pure returns (bytes32);

  /// @notice Role allowed to create custom pools while public creation is disabled.
  function CUSTOM_POOL_DEPLOYER() external pure returns (bytes32);

  /// @notice Returns the address of AlgebraFactory
  /// @return The AlgebraFactory contract address
  function algebraFactory() external view returns (address);

  /// @notice Algebra custom-pool entry point used by this factory.
  function algebraCustomPoolEntryPoint() external view returns (address);

  /// @notice Whether callers without CUSTOM_POOL_DEPLOYER may create custom pools.
  function isPublicPoolCreationMode() external view returns (bool);

  /// @notice Current default deviation fee configuration, set in new plugins at creation
  function defaultDeviationFeeConfiguration() external view returns (uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow);

  /// @notice Returns current farming address
  /// @return The farming contract address
  function farmingAddress() external view returns (address);

  /// @notice Returns address of plugin created for given AlgebraPool
  /// @param pool The address of AlgebraPool
  /// @return The address of corresponding plugin
  function pluginByPool(address pool) external view returns (address);

  /// @notice Whether a pool was created through this factory's custom-pool flow.
  function isCustomPool(address pool) external view returns (bool);

  /// @notice Deploys a custom pool and its Nest fee plugin through the configured entry point.
  function deployCustomPool(address tokenA, address tokenB, bytes calldata data) external returns (address customPool);

  /// @notice Create plugin for already existing pool
  /// @param token0 The address of first token in pool
  /// @param token1 The address of second token in pool
  /// @return The address of created plugin
  function createPluginForExistingPool(address token0, address token1) external returns (address);

  /// @notice Changes tick spacing for a custom pool created by this factory.
  function setTickSpacing(address pool, int24 newTickSpacing) external;

  /// @notice Changes the attached plugin for a custom pool created by this factory.
  function setPlugin(address pool, address newPluginAddress) external;

  /// @notice Changes plugin flags for a custom pool created by this factory.
  function setPluginConfig(address pool, uint8 newConfig) external;

  /// @notice Changes the static fee for a custom pool created by this factory.
  function setFee(address pool, uint16 newFee) external;

  /// @notice Changes public custom-pool creation mode.
  function setPublicPoolCreationMode(bool mode) external;

  /// @notice Changes the default deviation fee configuration for new plugins
  function setDefaultDeviationFeeConfiguration(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow) external;

  /// @dev updates farmings manager address on the factory
  /// @param newFarmingAddress The new tokenomics contract address
  function setFarmingAddress(address newFarmingAddress) external;

  /// @notice Updates the beacon implementation used by all plugins from this factory.
  /// @dev Callable only by an Algebra base-plugin factory administrator.
  function upgradeTo(address newImplementation) external;
}
