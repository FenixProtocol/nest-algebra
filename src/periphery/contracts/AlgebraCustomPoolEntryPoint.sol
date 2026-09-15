// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import {IAlgebraCustomPoolEntryPoint} from './interfaces/IAlgebraCustomPoolEntryPoint.sol';
import {IAlgebraPluginFactory} from '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPluginFactory.sol';
import {IAlgebraPool} from '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import {IAlgebraFactory} from '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import {Ownable2Step} from '@openzeppelin/contracts/access/Ownable2Step.sol';

/// @title Algebra custom pool entry point
/// @notice Is used to create and manage custom pools
contract AlgebraCustomPoolEntryPoint is IAlgebraCustomPoolEntryPoint, Ownable2Step {
    /// @inheritdoc IAlgebraCustomPoolEntryPoint
    address public immutable override factory;

    /// @inheritdoc IAlgebraCustomPoolEntryPoint
    mapping(address => bool) public override isCustomPoolDeployer;

    modifier onlyCustomDeployer(address pool) {
        _checkIfDeployer(pool);
        _;
    }

    constructor(address _factory) {
        require(_factory != address(0));
        factory = _factory;
    }

    /// @inheritdoc IAlgebraCustomPoolEntryPoint
    function createCustomPool(
        address deployer,
        address creator,
        address tokenA,
        address tokenB,
        bytes calldata data
    ) external override returns (address customPool) {
        require(msg.sender == deployer, 'Only deployer');
        require(isCustomPoolDeployer[deployer], 'Can`t create custom pools');
        return IAlgebraFactory(factory).createCustomPool(deployer, creator, tokenA, tokenB, data);
    }

    /// @inheritdoc IAlgebraCustomPoolEntryPoint
    function setCustomPoolDeployer(address deployer, bool allowed) external override onlyOwner {
        _setCustomPoolDeployer(deployer, allowed);
    }

    /// @inheritdoc IAlgebraCustomPoolEntryPoint
    function setCustomPoolDeployerBatch(address[] calldata deployers, bool allowed) external override onlyOwner {
        uint256 deployersLength = deployers.length;
        for (uint256 i; i < deployersLength; ++i) {
            _setCustomPoolDeployer(deployers[i], allowed);
        }
    }

    /// @inheritdoc IAlgebraPluginFactory
    function beforeCreatePoolHook(
        address pool,
        address creator,
        address deployer,
        address token0,
        address token1,
        bytes calldata data
    ) external override returns (address) {
        require(msg.sender == factory, 'Only factory');
        return IAlgebraPluginFactory(deployer).beforeCreatePoolHook(pool, creator, deployer, token0, token1, data);
    }

    /// @inheritdoc IAlgebraPluginFactory
    function afterCreatePoolHook(address plugin, address pool, address deployer) external override {
        require(msg.sender == factory, 'Only factory');
        IAlgebraPluginFactory(deployer).afterCreatePoolHook(plugin, pool, deployer);
    }

    /// @inheritdoc IAlgebraCustomPoolEntryPoint
    function setTickSpacing(address pool, int24 newTickSpacing) external override onlyCustomDeployer(pool) {
        IAlgebraPool(pool).setTickSpacing(newTickSpacing);
    }

    /// @inheritdoc IAlgebraCustomPoolEntryPoint
    function setPlugin(address pool, address newPluginAddress) external override onlyCustomDeployer(pool) {
        IAlgebraPool(pool).setPlugin(newPluginAddress);
    }

    /// @inheritdoc IAlgebraCustomPoolEntryPoint
    function setPluginConfig(address pool, uint8 newConfig) external override onlyCustomDeployer(pool) {
        IAlgebraPool(pool).setPluginConfig(newConfig);
    }

    /// @inheritdoc IAlgebraCustomPoolEntryPoint
    function setFee(address pool, uint16 newFee) external override onlyCustomDeployer(pool) {
        IAlgebraPool(pool).setFee(newFee);
    }

    /// @dev Just implementation of the function from IAlgebraPluginFactory to not create new additional interface
    function createPlugin(address, address, address) external pure returns (address) {
        revert('Not implemented');
    }

    function _checkIfDeployer(address pool) internal view {
        require(
            IAlgebraFactory(factory).hasRoleOrOwner(IAlgebraFactory(factory).POOLS_ADMINISTRATOR_ROLE(), address(this)),
            'Not administrator'
        );
        address token0 = IAlgebraPool(pool).token0();
        address token1 = IAlgebraPool(pool).token1();
        require(pool == IAlgebraFactory(factory).customPoolByPair(msg.sender, token0, token1), 'Only deployer');
    }

    function _setCustomPoolDeployer(address deployer, bool allowed) internal {
        require(deployer != address(0));
        if (isCustomPoolDeployer[deployer] != allowed) {
            isCustomPoolDeployer[deployer] = allowed;
            emit CustomPoolDeployer(deployer, allowed);
        }
    }
}
