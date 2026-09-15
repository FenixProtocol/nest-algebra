// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract ReentrantQuoteToken is ERC20 {
    address public reentryTarget;
    bytes public reentryData;
    bool public reentryEnabled;

    constructor(uint256 amountToMint) ERC20('Reentrant Quote Token', 'REENTRANT-QUOTE') {
        _mint(msg.sender, amountToMint);
    }

    function configureReentry(address target, bytes calldata data, bool enabled) external {
        reentryTarget = target;
        reentryData = data;
        reentryEnabled = enabled;
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        if (reentryEnabled) {
            reentryEnabled = false;
            (bool success, bytes memory result) = reentryTarget.call(reentryData);
            if (!success) {
                assembly ('memory-safe') {
                    revert(add(result, 32), mload(result))
                }
            }
        }

        super._transfer(from, to, amount);
    }
}
