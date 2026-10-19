// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/callback/IAlgebraSwapCallback.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract ForkSwapper is IAlgebraSwapCallback {
  function swapToPrice(address pool, bool zeroToOne, int256 amountIn, uint160 limitSqrtPrice) external {
    IAlgebraPool(pool).swap(address(this), zeroToOne, amountIn, limitSqrtPrice, abi.encode(pool));
  }

  function algebraSwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external override {
    address pool = abi.decode(data, (address));
    require(msg.sender == pool, 'not pool');
    if (amount0Delta > 0) IERC20(IAlgebraPool(pool).token0()).transfer(pool, uint256(amount0Delta));
    if (amount1Delta > 0) IERC20(IAlgebraPool(pool).token1()).transfer(pool, uint256(amount1Delta));
  }
}
