// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.20;

import '../interfaces/IAlgebraCustomPoolEntryPoint.sol';

contract MockCustomPoolDeployer {
    function createPlugin(address, address, address) external pure returns (address) {
        return address(0);
    }

    function beforeCreatePoolHook(
        address,
        address,
        address,
        address,
        address,
        bytes calldata
    ) external pure returns (address) {
        return address(0);
    }

    function afterCreatePoolHook(address, address, address) external pure {}

    function createCustomPool(
        IAlgebraCustomPoolEntryPoint entryPoint,
        address creator,
        address tokenA,
        address tokenB,
        bytes calldata data
    ) external returns (address pool) {
        return entryPoint.createCustomPool(address(this), creator, tokenA, tokenB, data);
    }

    function setTickSpacing(IAlgebraCustomPoolEntryPoint entryPoint, address pool, int24 newTickSpacing) external {
        entryPoint.setTickSpacing(pool, newTickSpacing);
    }

    function setPlugin(IAlgebraCustomPoolEntryPoint entryPoint, address pool, address newPluginAddress) external {
        entryPoint.setPlugin(pool, newPluginAddress);
    }

    function setPluginConfig(IAlgebraCustomPoolEntryPoint entryPoint, address pool, uint8 newConfig) external {
        entryPoint.setPluginConfig(pool, newConfig);
    }

    function setFee(IAlgebraCustomPoolEntryPoint entryPoint, address pool, uint16 newFee) external {
        entryPoint.setFee(pool, newFee);
    }
}
