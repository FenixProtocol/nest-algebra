// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolState.sol';

import '../interfaces/IMevxPlugin.sol';
import '../interfaces/mevx/IMevxExecutor.sol';
import '../interfaces/mevx/IMevxRouter.sol';
import '../interfaces/mevx/IProfitDistributor.sol';
import '../libraries/MevxStorage.sol';

/// @title Homelander (MEVX) backrun arbitrage for Algebra Integral plugins
abstract contract MevxPlugin is IMevxPlugin {
  bytes32 public constant MEVX_MANAGER = keccak256('MEVX_MANAGER');

  uint16 internal constant ALGEBRA_POOL_TYPE = 3;
  uint256 internal constant OUT_OF_GAS_MAX_DEPTH = 8;

  function _mevxPool() internal view virtual returns (address);

  function _isMevxManager(address account) internal view virtual returns (bool);

  /// @inheritdoc IMevxPlugin
  function getMevxConfig() external view override returns (address, address, address, bytes32) {
    MevxStorage.Layout storage mevx = MevxStorage.layout();
    return (mevx.mevxRouter, mevx.mevxExecutor, mevx.mevxProfitDistributor, mevx.mevxConfigId);
  }

  /// @inheritdoc IMevxPlugin
  function getHardMode() external view override returns (bool) {
    return MevxStorage.layout().hardMode;
  }

  /// @inheritdoc IMevxPlugin
  function getCallGasBudget() external view override returns (uint256) {
    return MevxStorage.callGasBudget(MevxStorage.layout());
  }

  /// @inheritdoc IMevxPlugin
  function setMevxConfig(address mevxRouter, address mevxExecutor, address profitDistributor, bytes32 configId) external override {
    _checkMevxManager();
    _setMevxConfig(mevxRouter, mevxExecutor, profitDistributor, configId);
  }

  /// @inheritdoc IMevxPlugin
  function setHardMode(bool enabled) external override {
    _checkMevxManager();
    MevxStorage.Layout storage mevx = MevxStorage.layout();
    emit HardModeSet(mevx.hardMode, enabled);
    mevx.hardMode = enabled;
  }

  /// @inheritdoc IMevxPlugin
  function setCallGasBudget(uint256 callGasBudget) external override {
    _checkMevxManager();
    require(callGasBudget <= MevxStorage.MAX_CALL_GAS_BUDGET, 'callGasBudget too high');
    MevxStorage.Layout storage mevx = MevxStorage.layout();
    emit CallGasBudgetSet(mevx.callGasBudget, callGasBudget);
    mevx.callGasBudget = callGasBudget;
  }

  function _checkMevxManager() private view {
    require(_isMevxManager(msg.sender), 'Not MEVX manager');
  }

  function _setMevxConfig(address mevxRouter, address mevxExecutor, address profitDistributor, bytes32 configId) internal {
    MevxStorage.Layout storage mevx = MevxStorage.layout();
    (mevx.mevxRouter, mevx.mevxExecutor, mevx.mevxProfitDistributor, mevx.mevxConfigId) = (mevxRouter, mevxExecutor, profitDistributor, configId);
    emit MevxConfigSet(mevxRouter, mevxExecutor, profitDistributor, configId);
  }

  function _initializeMevxPool() internal {
    address router = MevxStorage.layout().mevxRouter;
    if (router == address(0)) return;

    bytes32 poolId = bytes32(uint256(uint160(_mevxPool())));
    IMevxRouter(router).initializePoolExternally(poolId, ALGEBRA_POOL_TYPE, abi.encode(poolId));
  }

  function _mevxBeforeSwap(address sender) internal {
    MevxStorage.Layout storage mevx = MevxStorage.layout();
    if (sender != mevx.mevxExecutor) return;
    address pool = _mevxPool();
    (, , uint16 fee, , , ) = IAlgebraPoolState(pool).globalState();
    (mevx.savedFee, mevx.feeSaved) = (fee, true);
    if (fee != 0) IAlgebraPool(pool).setFee(0);
  }

  function _mevxAfterSwap(address sender, address recipient, bool zeroToOne, int256 amount0, int256 amount1) internal {
    MevxStorage.Layout storage mevx = MevxStorage.layout();
    if (mevx.feeSaved) {
      uint16 fee = mevx.savedFee;
      (mevx.savedFee, mevx.feeSaved) = (0, false);
      if (fee != 0) IAlgebraPool(_mevxPool()).setFee(fee);
    }
    if (mevx.mevxRouter == address(0)) return;

    bytes memory branchData = abi.encodeCall(
      IMevxPlugin.runArbitrage,
      (bytes32(uint256(uint160(_mevxPool()))), zeroToOne, amount0, amount1, sender, recipient)
    );

    uint256 budget = MevxStorage.callGasBudget(mevx);
    uint256 gasLeftBeforeArb = gasleft();
    (bool success, bytes memory returnData) = address(this).call{gas: budget}(branchData);
    uint256 gasLeftAfterArb = gasleft();

    if (!success && mevx.hardMode && sender != mevx.mevxExecutor) {
      uint256 maxForwarded = gasLeftBeforeArb - gasLeftBeforeArb / 64;
      uint256 arbGas = budget < maxForwarded ? budget : maxForwarded;
      bool shortOfBudget = arbGas < budget;
      if (shortOfBudget && (_isOutOfGasMarker(returnData) || _ranOutOfGas(gasLeftBeforeArb, gasLeftAfterArb))) {
        revert('Insufficient gas for afterSwap hook');
      }
    }
  }

  /// @inheritdoc IMevxPlugin
  function runArbitrage(
    bytes32 poolId,
    bool zeroToOne,
    int256 amount0,
    int256 amount1,
    address sender,
    address recipient
  ) external override {
    require(msg.sender == address(this), 'self only');

    MevxStorage.Layout storage mevx = MevxStorage.layout();

    (bool successInitialArbCheck, bytes memory returnDataInitialArbCheck) = mevx.mevxRouter.call(
      abi.encodeCall(IMevxRouter.initialArbCheck, (poolId, !zeroToOne))
    );

    if (sender == mevx.mevxExecutor) return;
    if (!successInitialArbCheck || returnDataInitialArbCheck.length != 64) return;

    (bool isArbPossible, bytes16 arbData) = abi.decode(returnDataInitialArbCheck, (bool, bytes16));
    if (!isArbPossible) return;

    _constructAndExecute(mevx, abi.encodeCall(IMevxRouter.constructArbitrageRoute, (poolId, zeroToOne, arbData, amount0, amount1)), recipient);
  }

  function _constructAndExecute(MevxStorage.Layout storage mevx, bytes memory callData, address recipient) private {
    (bool isArbPossible, address profitToken, address[] memory pools, uint256 amountIn, bytes memory encodedRoute) = _constructRoute(
      mevx,
      callData
    );

    if (isArbPossible) _executeArbitrage(mevx, profitToken, pools, amountIn, encodedRoute, recipient);
  }

  function _constructRoute(
    MevxStorage.Layout storage mevx,
    bytes memory callData
  ) private returns (bool isArbPossible, address profitToken, address[] memory pools, uint256 amountIn, bytes memory encodedRoute) {
    uint256 gasLeftBeforeRoute = gasleft();
    (bool success, bytes memory returnData) = mevx.mevxRouter.call(callData);
    uint256 gasLeftAfterRoute = gasleft();
    if (!success && mevx.hardMode && _ranOutOfGas(gasLeftBeforeRoute, gasLeftAfterRoute)) revert ArbitrageOutOfGas();

    if (success && returnData.length >= 224) {
      (isArbPossible, profitToken, pools, amountIn, encodedRoute) = abi.decode(returnData, (bool, address, address[], uint256, bytes));
    }
  }

  function _executeArbitrage(
    MevxStorage.Layout storage mevx,
    address profitToken,
    address[] memory pools,
    uint256 amountIn,
    bytes memory encodedRoute,
    address recipient
  ) private {
    address distributor = mevx.mevxProfitDistributor;
    uint256 gasLeftBeforeExecution = gasleft();
    try IMevxExecutor(mevx.mevxExecutor).executeRoute(encodedRoute, pools, amountIn, profitToken, distributor) {
      try IProfitDistributor(distributor).distributeProfit(mevx.mevxConfigId, profitToken, recipient) {} catch {}
    } catch (bytes memory reason) {
      if (mevx.hardMode && (_isOutOfGasMarker(reason) || _ranOutOfGas(gasLeftBeforeExecution, gasleft()))) revert ArbitrageOutOfGas();
    }
  }

  function _isOutOfGasMarker(bytes memory returnData) private pure returns (bool) {
    if (returnData.length != 4) return false;
    bytes4 selector;
    assembly {
      selector := mload(add(returnData, 32))
    }
    return selector == ArbitrageOutOfGas.selector;
  }

  function _ranOutOfGas(uint256 gasLeftBefore, uint256 gasLeftAfter) private pure returns (bool) {
    return gasLeftAfter * 64 <= gasLeftBefore * (1 + OUT_OF_GAS_MAX_DEPTH);
  }
}
