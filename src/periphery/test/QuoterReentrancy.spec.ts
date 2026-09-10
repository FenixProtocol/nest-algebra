import { MaxUint256, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import completeFixture from './shared/completeFixture';
import { FeeAmount, TICK_SPACINGS } from './shared/constants';
import { encodePriceSqrt } from './shared/encodePriceSqrt';
import { expect } from './shared/expect';
import { getMaxTick, getMinTick } from './shared/ticks';

describe('Quoter exact-output reentrancy', function () {
  this.timeout(40_000);

  async function createFullRangePool(nft: any, owner: string, tokenA: string, tokenB: string) {
    const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];

    await nft.createAndInitializePoolIfNecessary(token0, token1, encodePriceSqrt(1, 1));
    await nft.mint({
      token0,
      token1,
      deployer: ZeroAddress,
      tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
      tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
      amount0Desired: 1_000_000,
      amount1Desired: 1_000_000,
      amount0Min: 0,
      amount1Min: 0,
      recipient: owner,
      deadline: 1,
    });
  }

  async function reentrantQuoteFixture() {
    const [owner] = await ethers.getSigners();
    const { factory, wnative, nft } = await loadFixture(completeFixture);
    const tokenFactory = await ethers.getContractFactory('TestERC20');
    const reentrantTokenFactory = await ethers.getContractFactory('ReentrantQuoteToken');
    const quoterFactory = await ethers.getContractFactory('Quoter');
    const quoterV2Factory = await ethers.getContractFactory('QuoterV2');

    const tokenIn = await tokenFactory.deploy(MaxUint256 / 2n);
    const nestedTokenOut = await tokenFactory.deploy(MaxUint256 / 2n);
    const maliciousTokenOut = await reentrantTokenFactory.deploy(MaxUint256 / 2n);
    const quoter = await quoterFactory.deploy(factory, wnative, await factory.poolDeployer());
    const quoterV2 = await quoterV2Factory.deploy(factory, wnative, await factory.poolDeployer());

    for (const token of [tokenIn, nestedTokenOut, maliciousTokenOut]) {
      await token.approve(await nft.getAddress(), MaxUint256);
    }

    const tokenInAddress = await tokenIn.getAddress();
    const nestedTokenOutAddress = await nestedTokenOut.getAddress();
    const maliciousTokenOutAddress = await maliciousTokenOut.getAddress();

    await createFullRangePool(nft, owner.address, tokenInAddress, maliciousTokenOutAddress);
    await createFullRangePool(nft, owner.address, tokenInAddress, nestedTokenOutAddress);

    return {
      tokenInAddress,
      nestedTokenOutAddress,
      maliciousTokenOutAddress,
      maliciousTokenOut,
      quoter,
      quoterV2,
    };
  }

  it('preserves the Quoter full-output check across a nested quote', async () => {
    const { tokenInAddress, nestedTokenOutAddress, maliciousTokenOutAddress, maliciousTokenOut, quoter } =
      await loadFixture(reentrantQuoteFixture);
    const requestedOut = 10_000_000n;

    await expect(
      quoter.quoteExactOutputSingle.staticCall(tokenInAddress, maliciousTokenOutAddress, ZeroAddress, requestedOut, 0)
    ).to.be.revertedWith('Not received full amountOut');

    const quoterAddress = await quoter.getAddress();
    await maliciousTokenOut.configureReentry(
      quoterAddress,
      quoter.interface.encodeFunctionData('quoteExactOutputSingle', [
        tokenInAddress,
        nestedTokenOutAddress,
        ZeroAddress,
        1,
        0,
      ]),
      true
    );

    await expect(
      quoter.quoteExactOutputSingle.staticCall(tokenInAddress, maliciousTokenOutAddress, ZeroAddress, requestedOut, 0)
    ).to.be.revertedWith('Not received full amountOut');
  });

  it('preserves the QuoterV2 full-output check across a nested quote', async () => {
    const { tokenInAddress, nestedTokenOutAddress, maliciousTokenOutAddress, maliciousTokenOut, quoterV2 } =
      await loadFixture(reentrantQuoteFixture);
    const requestedOut = 10_000_000n;
    const outerQuote = {
      tokenIn: tokenInAddress,
      tokenOut: maliciousTokenOutAddress,
      deployer: ZeroAddress,
      amount: requestedOut,
      limitSqrtPrice: 0,
    };

    await expect(quoterV2.quoteExactOutputSingle.staticCall(outerQuote)).to.be.revertedWith(
      'Not received full amountOut'
    );

    const quoterV2Address = await quoterV2.getAddress();
    await maliciousTokenOut.configureReentry(
      quoterV2Address,
      quoterV2.interface.encodeFunctionData('quoteExactOutputSingle', [
        {
          tokenIn: tokenInAddress,
          tokenOut: nestedTokenOutAddress,
          deployer: ZeroAddress,
          amount: 1,
          limitSqrtPrice: 0,
        },
      ]),
      true
    );

    await expect(quoterV2.quoteExactOutputSingle.staticCall(outerQuote)).to.be.revertedWith(
      'Not received full amountOut'
    );
  });
});
