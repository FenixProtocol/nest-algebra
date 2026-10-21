// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;
pragma abicoder v1;

import '../interfaces/plugin/IAlgebraPluginFactory.sol';
import '../interfaces/IAlgebraFactory.sol';
import './MockPoolPlugin.sol';

interface IFactoryProvider {
  function factory() external view returns (address);
}

// used for testing time dependent behavior
contract MockDefaultPluginFactory is IAlgebraPluginFactory {
  mapping(address => address) public pluginsForPools;
  bool public isCustomPoolRegisteredBeforeHook;
  uint256 public customPoolCodeSizeBeforeHook;
  bool public isCustomPoolRegisteredAfterHook;
  uint256 public customPoolCodeSizeAfterHook;

  function createPlugin(address pool, address, address) external override returns (address plugin) {
    plugin = address(new MockPoolPlugin(pool));
    pluginsForPools[pool] = plugin;
  }

  function beforeCreatePoolHook(
    address pool,
    address,
    address customDeployer,
    address token0,
    address token1,
    bytes calldata
  ) external override returns (address plugin) {
    IAlgebraFactory factory = _factory();
    isCustomPoolRegisteredBeforeHook =
      factory.customPoolByPair(customDeployer, token0, token1) == pool &&
      factory.deployerByPool(pool) == customDeployer;
    customPoolCodeSizeBeforeHook = pool.code.length;
    plugin = address(new MockPoolPlugin(pool));
    pluginsForPools[pool] = plugin;
  }

  function afterCreatePoolHook(address, address pool, address customDeployer) external override {
    isCustomPoolRegisteredAfterHook = _factory().deployerByPool(pool) == customDeployer;
    customPoolCodeSizeAfterHook = pool.code.length;
  }

  function _factory() private view returns (IAlgebraFactory factory) {
    try IFactoryProvider(msg.sender).factory() returns (address actualFactory) {
      factory = IAlgebraFactory(actualFactory);
    } catch {
      factory = IAlgebraFactory(msg.sender);
    }
  }

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
