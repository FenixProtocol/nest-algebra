// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title An interface for a contract that is capable of deploying Algebra plugins
/// @dev Such a factory is needed if the plugin should be automatically created and connected to each new pool
interface IAlgebraPluginFactory {
  /// @notice Deploys new plugin contract for pool
  /// @param pool The address of the pool for which the new plugin will be created
  /// @param token0 First token of the pool
  /// @param token1 Second token of the pool
  /// @return New plugin address
  function createPlugin(address pool, address token0, address token1) external returns (address);

  /// @notice Called before pool creation to optionally deploy a plugin.
  /// @param pool The computed address of the new pool
  /// @param creator The address that initiated pool creation
  /// @param deployer The custom pool deployer, or address(0) for classic pools
  /// @param token0 First token of the pool
  /// @param token1 Second token of the pool
  /// @param data Additional data for plugin creation
  /// @return New plugin address
  function beforeCreatePoolHook(
    address pool,
    address creator,
    address deployer,
    address token0,
    address token1,
    bytes calldata data
  ) external returns (address);

  /// @notice Called after pool creation.
  /// @param plugin The plugin address
  /// @param pool The address of the new pool
  /// @param deployer The custom pool deployer, or address(0) for classic pools
  function afterCreatePoolHook(address plugin, address pool, address deployer) external;
}
