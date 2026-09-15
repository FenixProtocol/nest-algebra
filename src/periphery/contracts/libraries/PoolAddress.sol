// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';

/// @title Provides functions for deriving a pool address from the poolDeployer and tokens
/// @dev Credit to Uniswap Labs under GPL-2.0-or-later license:
/// https://github.com/Uniswap/v3-periphery
library PoolAddress {
    bytes32 internal constant POOL_INIT_CODE_HASH = 0xe4894f29e2491e531db85584561de8b8869774d41313c860cf4089d80a51d8a4;

    /// @notice The identifying key of the pool
    struct PoolKey {
        address deployer;
        address token0;
        address token1;
    }

    /// @notice Returns PoolKey: the ordered tokens
    /// @param tokenA The first token of a pool, unsorted
    /// @param tokenB The second token of a pool, unsorted
    /// @return Poolkey The pool details with ordered token0 and token1 assignments
    function getPoolKey(address tokenA, address tokenB) internal pure returns (PoolKey memory) {
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);
        return PoolKey({deployer: address(0), token0: tokenA, token1: tokenB});
    }

    /// @notice Returns PoolKey: the custom deployer and ordered tokens
    /// @param deployer The custom pool deployer address
    /// @param tokenA The first token of a pool, unsorted
    /// @param tokenB The second token of a pool, unsorted
    /// @return Poolkey The pool details with ordered token0 and token1 assignments
    function getPoolKey(address deployer, address tokenA, address tokenB) internal pure returns (PoolKey memory) {
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);
        return PoolKey({deployer: deployer, token0: tokenA, token1: tokenB});
    }

    /// @notice Deterministically computes a classic or custom pool address for the given PoolKey
    /// @param poolDeployer The Algebra poolDeployer contract address
    /// @param key The PoolKey
    /// @return pool The contract address of the Algebra pool
    function computeAddress(address poolDeployer, PoolKey memory key) internal pure returns (address pool) {
        require(key.token0 < key.token1, 'Invalid order of tokens');
        bool isCustom = key.deployer != address(0);
        pool = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex'ff',
                            poolDeployer,
                            isCustom ? keccak256(abi.encode(key.deployer, key.token0, key.token1)) : keccak256(abi.encode(key.token0, key.token1)),
                            POOL_INIT_CODE_HASH
                        )
                    )
                )
            )
        );
    }

    /// @notice Returns a classic or custom pool from the factory registry.
    function getPool(address factory, PoolKey memory key) internal view returns (address pool) {
        return
            key.deployer == address(0)
                ? IAlgebraFactory(factory).poolByPair(key.token0, key.token1)
                : IAlgebraFactory(factory).customPoolByPair(key.deployer, key.token0, key.token1);
    }
}
