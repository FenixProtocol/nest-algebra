// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;
pragma abicoder v1;

import '../interfaces/plugin/IAlgebraPluginFactory.sol';
import './MockPoolPlugin.sol';

// used for testing time dependent behavior
contract MockDefaultPluginFactory is IAlgebraPluginFactory {
  mapping(address => address) public pluginsForPools;

  function createPlugin(address pool, address, address) external override returns (address plugin) {
    plugin = address(new MockPoolPlugin(pool));
    pluginsForPools[pool] = plugin;
  }

  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata) external override returns (address plugin) {
    plugin = address(new MockPoolPlugin(pool));
    pluginsForPools[pool] = plugin;
  }

  function afterCreatePoolHook(address, address, address) external override {}

  function createCustomPool(
    address entryPoint,
    address creator,
    address tokenA,
    address tokenB,
    bytes calldata data
  ) external returns (address pool) {
    (bool success, bytes memory result) = entryPoint.call(
      abi.encodeWithSignature('createCustomPool(address,address,address,address,bytes)', address(this), creator, tokenA, tokenB, data)
    );
    require(success);
    pool = abi.decode(result, (address));
  }
}
