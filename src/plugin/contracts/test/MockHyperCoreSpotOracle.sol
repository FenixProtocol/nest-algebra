// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

/// @dev Runtime installed at HyperCore's 0x0808 precompile address in local tests.
contract MockHyperCoreSpotOracle {
  enum Mode {
    Valid,
    RevertCall,
    Empty,
    Short,
    GasBurn
  }

  Mode public mode;
  uint256 public price;

  function configure(Mode newMode, uint256 newPrice) external {
    mode = newMode;
    price = newPrice;
  }

  fallback() external {
    Mode currentMode = mode;
    if (currentMode == Mode.RevertCall) revert('unavailable');
    if (currentMode == Mode.GasBurn) {
      assembly ('memory-safe') {
        for {

        } 1 {

        } {

        }
      }
    }
    if (currentMode == Mode.Empty) {
      assembly ('memory-safe') {
        return(0, 0)
      }
    }

    uint256 currentPrice = price;
    assembly ('memory-safe') {
      mstore(0, currentPrice)
      switch eq(currentMode, 3)
      case 1 {
        return(1, 31)
      }
      default {
        return(0, 32)
      }
    }
  }
}
