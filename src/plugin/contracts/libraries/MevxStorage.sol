// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev MEVX state of a plugin, in namespaced storage so it never collides with the base plugin layout
library MevxStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:nest.storage.mevx")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0x843e3c4466312978eca3a5f2423cff5ccf6625961ef4e78eb23002656a49f300;

  uint256 internal constant MAX_CALL_GAS_BUDGET = 5_000_000;

  struct Layout {
    // One slot, read on every swap
    address mevxExecutor;
    uint16 savedFee;
    bool feeSaved;
    // Hard mode: revert the swap when it left the arbitrage without enough gas
    bool hardMode;
    address mevxRouter;
    address mevxProfitDistributor;
    bytes32 mevxConfigId;
    uint256 callGasBudget;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }

  function callGasBudget(Layout storage l) internal view returns (uint256 budget) {
    budget = l.callGasBudget;
    if (budget == 0) budget = MAX_CALL_GAS_BUDGET;
  }
}
