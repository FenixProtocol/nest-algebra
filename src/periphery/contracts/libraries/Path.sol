// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.6.0;

import './BytesLib.sol';

/// @title Functions for manipulating path data for multihop swaps
/// @dev Credit to Uniswap Labs under GPL-2.0-or-later license:
/// https://github.com/Uniswap/v3-periphery
library Path {
    using BytesLib for bytes;

    /// @dev The length of the bytes encoded address
    uint256 private constant ADDR_SIZE = 20;

    /// @dev The offset of a single token address
    uint256 private constant NEXT_OFFSET = ADDR_SIZE;
    /// @dev The offset of an encoded pool key
    uint256 private constant POP_OFFSET = NEXT_OFFSET + ADDR_SIZE;
    /// @dev The minimum length of an encoding that contains 2 or more pools
    uint256 private constant MULTIPLE_POOLS_MIN_LENGTH = POP_OFFSET + NEXT_OFFSET;

    /// @dev The offset of a custom pool deployer in custom paths.
    uint256 private constant CUSTOM_DEPLOYER_OFFSET = ADDR_SIZE;
    /// @dev The offset of a single token + deployer segment in custom paths.
    uint256 private constant CUSTOM_NEXT_OFFSET = ADDR_SIZE + ADDR_SIZE;
    /// @dev The offset of an encoded custom pool key.
    uint256 private constant CUSTOM_POP_OFFSET = CUSTOM_NEXT_OFFSET + ADDR_SIZE;
    /// @dev The minimum custom path length that contains 2 or more pools.
    uint256 private constant CUSTOM_MULTIPLE_POOLS_MIN_LENGTH = CUSTOM_POP_OFFSET + CUSTOM_NEXT_OFFSET;

    /// @notice Returns true if the path contains two or more pools
    /// @param path The encoded swap path
    /// @return True if path contains two or more pools, otherwise false
    function hasMultiplePools(bytes memory path) internal pure returns (bool) {
        return path.length >= MULTIPLE_POOLS_MIN_LENGTH;
    }

    /// @notice Returns the number of pools in the path
    /// @param path The encoded swap path
    /// @return The number of pools in the path
    function numPools(bytes memory path) internal pure returns (uint256) {
        // Ignore the first token address. From then on every token offset indicates a pool.
        return ((path.length - ADDR_SIZE) / NEXT_OFFSET);
    }

    /// @notice Returns true if the custom path contains two or more pools
    /// @param path The encoded custom swap path
    /// @return True if path contains two or more pools, otherwise false
    function hasMultipleCustomPools(bytes memory path) internal pure returns (bool) {
        return path.length >= CUSTOM_MULTIPLE_POOLS_MIN_LENGTH;
    }

    /// @notice Returns the number of pools in the custom path
    /// @param path The encoded custom swap path
    /// @return The number of pools in the path
    function numCustomPools(bytes memory path) internal pure returns (uint256) {
        return ((path.length - ADDR_SIZE) / CUSTOM_NEXT_OFFSET);
    }

    /// @notice Decodes the first pool in path
    /// @param path The bytes encoded swap path
    /// @return tokenA The first token of the given pool
    /// @return tokenB The second token of the given pool
    function decodeFirstPool(bytes memory path) internal pure returns (address tokenA, address tokenB) {
        tokenA = path.toAddress(0);
        tokenB = path.toAddress(NEXT_OFFSET);
    }

    /// @notice Decodes the first custom pool in path
    /// @param path The bytes encoded custom swap path
    /// @return tokenA The first token of the given pool
    /// @return deployer The custom pool deployer address
    /// @return tokenB The second token of the given pool
    function decodeFirstCustomPool(bytes memory path) internal pure returns (address tokenA, address deployer, address tokenB) {
        tokenA = path.toAddress(0);
        deployer = path.toAddress(CUSTOM_DEPLOYER_OFFSET);
        tokenB = path.toAddress(CUSTOM_NEXT_OFFSET);
    }

    /// @notice Gets the segment corresponding to the first pool in the path
    /// @param path The bytes encoded swap path
    /// @return The segment containing all data necessary to target the first pool in the path
    function getFirstPool(bytes memory path) internal pure returns (bytes memory) {
        return path.slice(0, POP_OFFSET);
    }

    /// @notice Gets the segment corresponding to the first custom pool in the path
    /// @param path The bytes encoded custom swap path
    /// @return The segment containing all data necessary to target the first custom pool in the path
    function getFirstCustomPool(bytes memory path) internal pure returns (bytes memory) {
        return path.slice(0, CUSTOM_POP_OFFSET);
    }

    /// @notice Skips a token element from the buffer and returns the remainder
    /// @param path The swap path
    /// @return The remaining token elements in the path
    function skipToken(bytes memory path) internal pure returns (bytes memory) {
        return path.slice(NEXT_OFFSET, path.length - NEXT_OFFSET);
    }

    /// @notice Skips a token and deployer element from the custom path and returns the remainder
    /// @param path The custom swap path
    /// @return The remaining token/deployer elements in the path
    function skipTokenAndDeployer(bytes memory path) internal pure returns (bytes memory) {
        return path.slice(CUSTOM_NEXT_OFFSET, path.length - CUSTOM_NEXT_OFFSET);
    }
}
