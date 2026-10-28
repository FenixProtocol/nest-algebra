// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';

/// @dev Plugin test double which reenters the position manager from a position
/// hook. It records a failed call rather than reverting the outer pool mint.
contract ReentrantPositionPlugin is IAlgebraPlugin {
    address public immutable positionManager;
    bytes public attackData;
    bool public attackEnabled;
    bool public attackSucceeded;
    bytes public attackResult;

    constructor(address _positionManager) {
        positionManager = _positionManager;
    }

    function configureAttack(bytes calldata data) external {
        attackData = data;
        attackEnabled = true;
        attackSucceeded = false;
        delete attackResult;
    }

    function defaultPluginConfig() external pure override returns (uint8) {
        return 0;
    }

    function beforeInitialize(address, uint160) external pure override returns (bytes4) {
        return IAlgebraPlugin.beforeInitialize.selector;
    }

    function afterInitialize(address, uint160, int24) external pure override returns (bytes4) {
        return IAlgebraPlugin.afterInitialize.selector;
    }

    function beforeModifyPosition(
        address,
        address,
        int24,
        int24,
        int128,
        bytes calldata
    ) external override returns (bytes4) {
        _attemptAttack();
        return IAlgebraPlugin.beforeModifyPosition.selector;
    }

    function afterModifyPosition(
        address,
        address,
        int24,
        int24,
        int128,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IAlgebraPlugin.afterModifyPosition.selector;
    }

    function beforeSwap(
        address,
        address,
        bool,
        int256,
        uint160,
        bool,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IAlgebraPlugin.beforeSwap.selector;
    }

    function afterSwap(
        address,
        address,
        bool,
        int256,
        uint160,
        int256,
        int256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IAlgebraPlugin.afterSwap.selector;
    }

    function beforeFlash(address, address, uint256, uint256, bytes calldata) external pure override returns (bytes4) {
        return IAlgebraPlugin.beforeFlash.selector;
    }

    function afterFlash(
        address,
        address,
        uint256,
        uint256,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IAlgebraPlugin.afterFlash.selector;
    }

    function _attemptAttack() private {
        if (!attackEnabled) return;

        attackEnabled = false;
        (attackSucceeded, attackResult) = positionManager.call(attackData);
    }
}
