// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPluginFactory.sol';

/// @title An interface for a contract that deploys and manages Algebra custom pools
interface IAlgebraCustomPoolEntryPoint is IAlgebraPluginFactory {
    /// @notice Returns the address of the corresponding AlgebraFactory contract
    /// @return factory The address of AlgebraFactory
    function factory() external view returns (address factory);

    /// @notice Creates a custom pool
    /// @param deployer The plugin deployer, also used for custom pool address calculation
    /// @param creator The initiator of custom pool creation
    /// @param tokenA One of the two tokens in the desired pool
    /// @param tokenB The other of the two tokens in the desired pool
    /// @param data Additional data for plugin creation
    /// @return customPool The newly created custom pool
    function createCustomPool(
        address deployer,
        address creator,
        address tokenA,
        address tokenB,
        bytes calldata data
    ) external returns (address customPool);

    /// @notice Changes the tick spacing value in a custom pool
    function setTickSpacing(address pool, int24 newTickSpacing) external;

    /// @notice Changes the plugin address in a custom pool
    function setPlugin(address pool, address newPluginAddress) external;

    /// @notice Changes the plugin configuration in a custom pool
    function setPluginConfig(address pool, uint8 newConfig) external;

    /// @notice Changes the fee value in a custom pool
    function setFee(address pool, uint16 newFee) external;
}
