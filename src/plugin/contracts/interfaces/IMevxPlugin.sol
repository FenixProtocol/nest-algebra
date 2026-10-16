// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.4;

/// @title MEVX backrun arbitrage of the Nest fee plugins
interface IMevxPlugin {
  /// @notice The arbitrage ran out of gas while hard mode is on. Also raised by the executor.
  error ArbitrageOutOfGas();

  event MevxConfigSet(address mevxRouter, address mevxExecutor, address profitDistributor, bytes32 configId);
  event HardModeSet(bool oldEnabled, bool newEnabled);
  event CallGasBudgetSet(uint256 oldCallGasBudget, uint256 newCallGasBudget);

  function pluginFactory() external view returns (address);

  function getMevxConfig() external view returns (address mevxRouter, address mevxExecutor, address profitDistributor, bytes32 configId);
  function getHardMode() external view returns (bool);
  function getCallGasBudget() external view returns (uint256);

  function setMevxConfig(address mevxRouter, address mevxExecutor, address profitDistributor, bytes32 configId) external;
  function setHardMode(bool enabled) external;
  function setCallGasBudget(uint256 callGasBudget) external;

  function runArbitrage(bytes32 poolId, bool zeroToOne, int256 amount0, int256 amount1, address sender, address recipient) external;
}
