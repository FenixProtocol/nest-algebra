// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import './PoolAddress.sol';

/// @notice Provides validation for callbacks from Algebra Pools
/// @dev Credit to Uniswap Labs under GPL-2.0-or-later license:
/// https://github.com/Uniswap/v3-periphery
library CallbackValidation {
    /// @notice Returns the address of a valid Algebra Pool
    /// @param factory The Algebra factory address
    /// @param tokenA The contract address of either token0 or token1
    /// @param tokenB The contract address of the other token
    /// @return pool The Algebra pool contract address
    function verifyCallback(
        address factory,
        address tokenA,
        address tokenB
    ) internal view returns (IAlgebraPool pool) {
        return verifyCallback(factory, PoolAddress.getPoolKey(tokenA, tokenB));
    }

    /// @notice Returns the address of a valid classic or custom Algebra Pool
    /// @param factory The Algebra factory address
    /// @param deployer The custom pool deployer identifier, or address(0) for classic pools
    /// @param tokenA The contract address of either token0 or token1
    /// @param tokenB The contract address of the other token
    /// @return pool The Algebra pool contract address
    function verifyCallback(
        address factory,
        address deployer,
        address tokenA,
        address tokenB
    ) internal view returns (IAlgebraPool pool) {
        return verifyCallback(factory, PoolAddress.getPoolKey(deployer, tokenA, tokenB));
    }

    /// @notice Returns the address of a valid Algebra Pool
    /// @param factory The Algebra factory address
    /// @param poolKey The identifying key of the ALgebra pool
    /// @return pool The Algebra pool contract address
    function verifyCallback(
        address factory,
        PoolAddress.PoolKey memory poolKey
    ) internal view returns (IAlgebraPool pool) {
        pool = IAlgebraPool(PoolAddress.getPool(factory, poolKey));
        require(msg.sender == address(pool), 'Invalid caller of callback');
    }

    /// @notice Returns the address of a valid classic Algebra Pool from the factory registry
    /// @param factory The Algebra factory address
    /// @param tokenA The contract address of either token0 or token1
    /// @param tokenB The contract address of the other token
    /// @return pool The Algebra pool contract address
    function verifyCallbackFromFactory(address factory, address tokenA, address tokenB) internal view returns (IAlgebraPool pool) {
        pool = IAlgebraPool(IAlgebraFactory(factory).poolByPair(tokenA, tokenB));
        require(msg.sender == address(pool), 'Invalid caller of callback');
    }

    /// @notice Returns the address of a valid custom Algebra Pool from the factory registry
    /// @param factory The Algebra factory address
    /// @param deployer The custom pool deployer identifier
    /// @param tokenA The contract address of either token0 or token1
    /// @param tokenB The contract address of the other token
    /// @return pool The Algebra pool contract address
    function verifyCustomCallbackFromFactory(
        address factory,
        address deployer,
        address tokenA,
        address tokenB
    ) internal view returns (IAlgebraPool pool) {
        pool = IAlgebraPool(IAlgebraFactory(factory).customPoolByPair(deployer, tokenA, tokenB));
        require(msg.sender == address(pool), 'Invalid caller of callback');
    }
}
