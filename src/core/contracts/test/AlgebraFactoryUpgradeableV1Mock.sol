// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../AlgebraFactoryUpgradeable.sol';

/// @dev Reproduces the version-1 initialization state used by existing factory proxies.
contract AlgebraFactoryUpgradeableV1Mock is AlgebraFactoryUpgradeable {
  function initializeV1(address _poolDeployer, address _initOwner) external initializer {
    require(_poolDeployer != address(0));
    require(_initOwner != address(0));

    __AccessControlEnumerable_init();
    __Ownable2Step_init();
    _transferOwnership(_initOwner);

    poolDeployer = _poolDeployer;
    defaultTickspacing = Constants.INIT_DEFAULT_TICK_SPACING;
    defaultFee = Constants.INIT_DEFAULT_FEE;

    _grantRole(POOLS_CREATOR_ROLE, _initOwner);
  }
}
