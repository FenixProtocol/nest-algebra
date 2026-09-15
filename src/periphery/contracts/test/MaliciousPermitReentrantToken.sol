// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

contract MaliciousPermitReentrantToken {
    address public immutable target;

    uint256 public permitCalls;
    bool public attackSucceeded;
    bytes public attackResult;
    bytes public attackData;

    constructor(address _target) {
        target = _target;
        attackData = abi.encodeWithSignature('refundNativeToken()');
    }

    receive() external payable {}

    function allowance(address, address) external pure returns (uint256) {
        return 0;
    }

    function permit(address, address, uint256, uint256, uint8, bytes32, bytes32) external {
        _attack();
    }

    function permit(address, address, uint256, uint256, bool, uint8, bytes32, bytes32) external {
        _attack();
    }

    function configureAttack(bytes calldata data) external {
        attackData = data;
        attackSucceeded = false;
        delete attackResult;
    }

    function _attack() private {
        permitCalls++;
        (attackSucceeded, attackResult) = target.call(attackData);
    }
}
