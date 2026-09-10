// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract ReentrantExactOutputToken is ERC20 {
    address public attackTarget;
    bytes public attackData;
    bool public attackEnabled;
    bool public bubbleFailure;
    bool public attackAttempted;
    bool public attackSucceeded;
    bytes public attackResult;

    constructor(uint256 amountToMint) ERC20('Reentrant Exact Output Token', 'REENTRANT') {
        _mint(msg.sender, amountToMint);
    }

    function configureAttack(address target, bytes calldata data, bool shouldBubbleFailure) external {
        attackTarget = target;
        attackData = data;
        attackEnabled = true;
        bubbleFailure = shouldBubbleFailure;
        attackAttempted = false;
        attackSucceeded = false;
        delete attackResult;

        _approve(address(this), target, type(uint256).max);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (attackEnabled) {
            attackEnabled = false;
            attackAttempted = true;

            (bool success, bytes memory result) = attackTarget.call(attackData);
            attackSucceeded = success;
            attackResult = result;

            if (!success && bubbleFailure) {
                assembly ('memory-safe') {
                    revert(add(result, 32), mload(result))
                }
            }
        }

        return super.transferFrom(from, to, amount);
    }
}
