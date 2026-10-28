// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

/// @dev ERC-20 test double which attempts a configured call while a pool is
/// transferring collected funds. It records a failed call rather than bubbling
/// it so the surrounding collect operation can complete.
contract ReentrantCollectToken is ERC20 {
    address public attackTarget;
    bytes public attackData;
    uint256 public transfersBeforeAttack;
    uint256 public transferCount;
    bool public attackEnabled;
    bool public attackSucceeded;
    bytes public attackResult;

    constructor(uint256 amountToMint) ERC20('Reentrant Collect Token', 'REENTRANT_COLLECT') {
        _mint(msg.sender, amountToMint);
    }

    function configureAttack(address target, bytes calldata data, uint256 _transfersBeforeAttack) external {
        attackTarget = target;
        attackData = data;
        transfersBeforeAttack = _transfersBeforeAttack;
        transferCount = 0;
        attackEnabled = true;
        attackSucceeded = false;
        delete attackResult;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _attemptAttack();
        return super.transfer(to, amount);
    }

    function _attemptAttack() private {
        if (!attackEnabled) return;

        if (transferCount++ < transfersBeforeAttack) return;

        attackEnabled = false;
        (attackSucceeded, attackResult) = attackTarget.call(attackData);
    }
}
