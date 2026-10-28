import { AbiCoder, MaxUint256, ZeroAddress, toBeHex } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import completeFixture from './shared/completeFixture';
import { FeeAmount, MaxUint128, TICK_SPACINGS } from './shared/constants';
import { encodePriceSqrt } from './shared/encodePriceSqrt';
import { expect } from './shared/expect';
import { getMaxTick, getMinTick } from './shared/ticks';

describe('Periphery reentrancy protection', function () {
  this.timeout(40_000);

  async function expectGuardRevert(result: string) {
    expect(result.slice(0, 10)).to.equal('0x08c379a0');
    const [reason] = AbiCoder.defaultAbiCoder().decode(['string'], `0x${result.slice(10)}`);
    expect(reason).to.equal('ReentrancyGuard: reentrant call');
  }

  async function prepareMaliciousInputPool(outputKind: 'erc20' | 'wnative') {
    const [owner, trader, recipient, thief] = await ethers.getSigners();
    const { factory, nft, router, tokens, wnative } = await loadFixture(completeFixture);
    const ReentrantToken = await ethers.getContractFactory('ReentrantExactOutputToken');
    const inputToken = await ReentrantToken.deploy(MaxUint256 / 4n);
    const inputTokenAddress = await inputToken.getAddress();
    const outputToken = outputKind === 'wnative' ? wnative : tokens[0];
    const outputTokenAddress = await outputToken.getAddress();
    const nftAddress = await nft.getAddress();

    const [token0, token1] =
      inputTokenAddress.toLowerCase() < outputTokenAddress.toLowerCase()
        ? [inputTokenAddress, outputTokenAddress]
        : [outputTokenAddress, inputTokenAddress];

    await nft.createAndInitializePoolIfNecessary(token0, token1, encodePriceSqrt(1, 1));
    await inputToken.approve(nftAddress, MaxUint256);

    if (outputKind === 'wnative') {
      await wnative.deposit({ value: 1_000_000n });
      await wnative.approve(nftAddress, MaxUint256);
    } else {
      await outputToken.approve(nftAddress, MaxUint256);
    }

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
      recipient: owner.address,
      deadline: 1,
    });

    await inputToken.transfer(trader.address, 10_000n);
    await inputToken.connect(trader).approve(router, MaxUint256);

    return {
      inputToken,
      inputTokenAddress,
      outputToken,
      outputTokenAddress,
      owner,
      trader,
      recipient,
      thief,
      factory,
      nft,
      router,
      tokens,
      wnative,
    };
  }

  async function prepareNativePositionPool() {
    const [owner, victim, attacker] = await ethers.getSigners();
    const { nft, tokens, wnative } = await loadFixture(completeFixture);
    const token = tokens[0];
    const tokenAddress = await token.getAddress();
    const wnativeAddress = await wnative.getAddress();
    const wnativeIsToken0 = wnativeAddress.toLowerCase() < tokenAddress.toLowerCase();
    const [token0, token1] = wnativeIsToken0 ? [wnativeAddress, tokenAddress] : [tokenAddress, wnativeAddress];
    const nativeAmount = 100_000n;
    const tickLower = wnativeIsToken0 ? 60 : -120;
    const tickUpper = wnativeIsToken0 ? 120 : -60;

    await nft.createAndInitializePoolIfNecessary(token0, token1, encodePriceSqrt(1, 1));
    await token.approve(await nft.getAddress(), MaxUint256);
    await wnative.deposit({ value: nativeAmount * 10n });
    await wnative.approve(await nft.getAddress(), MaxUint256);
    await nft.mint({
      token0,
      token1,
      deployer: ZeroAddress,
      tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
      tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
      amount0Desired: nativeAmount,
      amount1Desired: nativeAmount,
      amount0Min: 0,
      amount1Min: 0,
      recipient: owner.address,
      deadline: 1,
    });

    const nativeOnlyMint = (recipient: string) => ({
      token0,
      token1,
      deployer: ZeroAddress,
      tickLower,
      tickUpper,
      amount0Desired: wnativeIsToken0 ? nativeAmount : 0,
      amount1Desired: wnativeIsToken0 ? 0 : nativeAmount,
      amount0Min: 0,
      amount1Min: 0,
      recipient,
      deadline: 1,
    });

    return { attacker, nativeAmount, nativeOnlyMint, nft, token, victim, wnative, wnativeIsToken0 };
  }

  for (const settlement of ['sweepToken', 'sweepTokenWithFee'] as const) {
    it(`blocks ${settlement} while exact-input output is custodied by the router`, async () => {
      const { inputToken, inputTokenAddress, outputToken, outputTokenAddress, trader, thief, router } =
        await prepareMaliciousInputPool('erc20');
      const routerAddress = await router.getAddress();
      const attackData =
        settlement === 'sweepToken'
          ? router.interface.encodeFunctionData(settlement, [outputTokenAddress, 0, thief.address])
          : router.interface.encodeFunctionData(settlement, [outputTokenAddress, 0, thief.address, 1, thief.address]);

      await inputToken.configureAttack(routerAddress, attackData, false);
      const swapData = router.interface.encodeFunctionData('exactInputSingle', [
        {
          tokenIn: inputTokenAddress,
          tokenOut: outputTokenAddress,
          deployer: ZeroAddress,
          limitSqrtPrice: 0,
          recipient: ZeroAddress,
          deadline: 1,
          amountIn: 1_000,
          amountOutMinimum: 1,
        },
      ]);
      const settleData = router.interface.encodeFunctionData('sweepToken', [outputTokenAddress, 1, trader.address]);
      const traderBefore = await outputToken.balanceOf(trader.address);
      const thiefBefore = await outputToken.balanceOf(thief.address);

      await router.connect(trader).multicall([swapData, settleData]);

      expect(await inputToken.attackSucceeded()).to.equal(false);
      await expectGuardRevert(await inputToken.attackResult());
      expect(await outputToken.balanceOf(thief.address)).to.equal(thiefBefore);
      expect(await outputToken.balanceOf(trader.address)).to.be.gt(traderBefore);
      expect(await outputToken.balanceOf(routerAddress)).to.equal(0n);
    });
  }

  for (const settlement of ['unwrapWNativeToken', 'unwrapWNativeTokenWithFee'] as const) {
    it(`blocks ${settlement} while wrapped-native output is custodied by the router`, async () => {
      const {
        inputToken,
        inputTokenAddress,
        outputTokenAddress: wnativeAddress,
        trader,
        recipient,
        thief,
        router,
        wnative,
      } = await prepareMaliciousInputPool('wnative');
      const routerAddress = await router.getAddress();
      const attackData =
        settlement === 'unwrapWNativeToken'
          ? router.interface.encodeFunctionData(settlement, [0, thief.address])
          : router.interface.encodeFunctionData(settlement, [0, thief.address, 1, thief.address]);

      await inputToken.configureAttack(routerAddress, attackData, false);
      const swapData = router.interface.encodeFunctionData('exactInputSingle', [
        {
          tokenIn: inputTokenAddress,
          tokenOut: wnativeAddress,
          deployer: ZeroAddress,
          limitSqrtPrice: 0,
          recipient: ZeroAddress,
          deadline: 1,
          amountIn: 1_000,
          amountOutMinimum: 1,
        },
      ]);
      const settleData = router.interface.encodeFunctionData('unwrapWNativeToken', [1, recipient.address]);
      const recipientBefore = await ethers.provider.getBalance(recipient.address);
      const thiefBefore = await ethers.provider.getBalance(thief.address);

      await router.connect(trader).multicall([swapData, settleData]);

      expect(await inputToken.attackSucceeded()).to.equal(false);
      await expectGuardRevert(await inputToken.attackResult());
      expect(await ethers.provider.getBalance(thief.address)).to.equal(thiefBefore);
      expect(await ethers.provider.getBalance(recipient.address)).to.be.gt(recipientBefore);
      expect(await wnative.balanceOf(routerAddress)).to.equal(0n);
      expect(await ethers.provider.getBalance(routerAddress)).to.equal(0n);
    });
  }

  it('blocks native refunds during a swap and permits the intended later multicall refund', async () => {
    const { inputToken, inputTokenAddress, outputTokenAddress, trader, router } = await prepareMaliciousInputPool(
      'erc20'
    );
    const routerAddress = await router.getAddress();

    await inputToken.configureAttack(routerAddress, router.interface.encodeFunctionData('refundNativeToken'), false);
    const swapData = router.interface.encodeFunctionData('exactInputSingle', [
      {
        tokenIn: inputTokenAddress,
        tokenOut: outputTokenAddress,
        deployer: ZeroAddress,
        limitSqrtPrice: 0,
        recipient: trader.address,
        deadline: 1,
        amountIn: 1_000,
        amountOutMinimum: 1,
      },
    ]);
    const refundData = router.interface.encodeFunctionData('refundNativeToken');

    await router.connect(trader).multicall([swapData, refundData], { value: ethers.parseEther('1') });

    expect(await inputToken.attackSucceeded()).to.equal(false);
    await expectGuardRevert(await inputToken.attackResult());
    expect(await ethers.provider.getBalance(routerAddress)).to.equal(0n);
  });

  for (const permitFunction of [
    'selfPermit',
    'selfPermitIfNecessary',
    'selfPermitAllowed',
    'selfPermitAllowedIfNecessary',
  ] as const) {
    it(`blocks refund reentrancy from ${permitFunction} and continues the multicall`, async () => {
      const [, trader] = await ethers.getSigners();
      const { router } = await loadFixture(completeFixture);
      const routerAddress = await router.getAddress();
      const MaliciousPermitToken = await ethers.getContractFactory('MaliciousPermitReentrantToken');
      const maliciousToken = await MaliciousPermitToken.deploy(routerAddress);
      const maliciousTokenAddress = await maliciousToken.getAddress();
      const args = permitFunction.includes('Allowed')
        ? [maliciousTokenAddress, 0, 0, 0, ethers.ZeroHash, ethers.ZeroHash]
        : [maliciousTokenAddress, 1, 0, 0, ethers.ZeroHash, ethers.ZeroHash];
      const permitData = router.interface.encodeFunctionData(permitFunction, args);
      const refundData = router.interface.encodeFunctionData('refundNativeToken');

      await router.connect(trader).multicall([permitData, refundData], { value: ethers.parseEther('1') });

      expect(await maliciousToken.permitCalls()).to.equal(1n);
      expect(await maliciousToken.attackSucceeded()).to.equal(false);
      await expectGuardRevert(await maliciousToken.attackResult());
      expect(await ethers.provider.getBalance(maliciousTokenAddress)).to.equal(0n);
      expect(await ethers.provider.getBalance(routerAddress)).to.equal(0n);
    });
  }

  it('shares the permit and payment lock in the position manager', async () => {
    const [, trader] = await ethers.getSigners();
    const { nft } = await loadFixture(completeFixture);
    const nftAddress = await nft.getAddress();
    const MaliciousPermitToken = await ethers.getContractFactory('MaliciousPermitReentrantToken');
    const maliciousToken = await MaliciousPermitToken.deploy(nftAddress);
    const maliciousTokenAddress = await maliciousToken.getAddress();
    const permitData = nft.interface.encodeFunctionData('selfPermit', [
      maliciousTokenAddress,
      1,
      0,
      0,
      ethers.ZeroHash,
      ethers.ZeroHash,
    ]);
    const refundData = nft.interface.encodeFunctionData('refundNativeToken');

    await nft.connect(trader).multicall([permitData, refundData], { value: ethers.parseEther('1') });

    expect(await maliciousToken.attackSucceeded()).to.equal(false);
    await expectGuardRevert(await maliciousToken.attackResult());
    expect(await ethers.provider.getBalance(maliciousTokenAddress)).to.equal(0n);
    expect(await ethers.provider.getBalance(nftAddress)).to.equal(0n);
  });

  it('blocks a permit callback from minting an attacker-owned native-funded position', async () => {
    const { attacker, nativeAmount, nativeOnlyMint, nft, token, victim, wnative } = await prepareNativePositionPool();
    const nftAddress = await nft.getAddress();
    const MaliciousPermitToken = await ethers.getContractFactory('MaliciousPermitReentrantToken');
    const maliciousToken = await MaliciousPermitToken.deploy(nftAddress);
    const maliciousTokenAddress = await maliciousToken.getAddress();
    const attackData = nft.interface.encodeFunctionData('mint', [nativeOnlyMint(attacker.address)]);
    const permitData = nft.interface.encodeFunctionData('selfPermit', [
      maliciousTokenAddress,
      1,
      0,
      0,
      ethers.ZeroHash,
      ethers.ZeroHash,
    ]);
    const victimMintData = nft.interface.encodeFunctionData('mint', [nativeOnlyMint(victim.address)]);
    const refundData = nft.interface.encodeFunctionData('refundNativeToken');
    const attackerNativeBefore = await ethers.provider.getBalance(attacker.address);
    const attackerTokenBefore = await token.balanceOf(attacker.address);

    await maliciousToken.configureAttack(attackData);
    await nft.connect(victim).multicall([permitData, victimMintData, refundData], { value: nativeAmount });

    expect(await maliciousToken.attackSucceeded()).to.equal(false);
    await expectGuardRevert(await maliciousToken.attackResult());
    expect(await nft.balanceOf(attacker.address)).to.equal(0n);
    expect(await nft.ownerOf(2)).to.equal(victim.address);
    expect(await ethers.provider.getBalance(attacker.address)).to.equal(attackerNativeBefore);
    expect(await token.balanceOf(attacker.address)).to.equal(attackerTokenBefore);
    expect(await ethers.provider.getBalance(nftAddress)).to.equal(0n);
    expect(await wnative.balanceOf(nftAddress)).to.equal(0n);
  });

  it('blocks a permit callback from increasing an attacker-owned native-funded position', async () => {
    const { attacker, nativeAmount, nativeOnlyMint, nft, token, victim, wnative, wnativeIsToken0 } =
      await prepareNativePositionPool();
    const nftAddress = await nft.getAddress();

    await nft.multicall(
      [
        nft.interface.encodeFunctionData('mint', [nativeOnlyMint(attacker.address)]),
        nft.interface.encodeFunctionData('refundNativeToken'),
      ],
      { value: nativeAmount }
    );

    const MaliciousPermitToken = await ethers.getContractFactory('MaliciousPermitReentrantToken');
    const maliciousToken = await MaliciousPermitToken.deploy(nftAddress);
    const maliciousTokenAddress = await maliciousToken.getAddress();
    const attackData = nft.interface.encodeFunctionData('increaseLiquidity', [
      {
        tokenId: 2,
        amount0Desired: wnativeIsToken0 ? nativeAmount : 0,
        amount1Desired: wnativeIsToken0 ? 0 : nativeAmount,
        amount0Min: 0,
        amount1Min: 0,
        deadline: 1,
      },
    ]);
    const permitData = nft.interface.encodeFunctionData('selfPermit', [
      maliciousTokenAddress,
      1,
      0,
      0,
      ethers.ZeroHash,
      ethers.ZeroHash,
    ]);
    const victimMintData = nft.interface.encodeFunctionData('mint', [nativeOnlyMint(victim.address)]);
    const refundData = nft.interface.encodeFunctionData('refundNativeToken');
    const attackerLiquidityBefore = (await nft.positions(2)).liquidity;
    const attackerNativeBefore = await ethers.provider.getBalance(attacker.address);
    const attackerTokenBefore = await token.balanceOf(attacker.address);

    await maliciousToken.configureAttack(attackData);
    await nft.connect(victim).multicall([permitData, victimMintData, refundData], { value: nativeAmount });

    expect(await maliciousToken.attackSucceeded()).to.equal(false);
    await expectGuardRevert(await maliciousToken.attackResult());
    expect((await nft.positions(2)).liquidity).to.equal(attackerLiquidityBefore);
    expect(await nft.ownerOf(3)).to.equal(victim.address);
    expect(await ethers.provider.getBalance(attacker.address)).to.equal(attackerNativeBefore);
    expect(await token.balanceOf(attacker.address)).to.equal(attackerTokenBefore);
    expect(await ethers.provider.getBalance(nftAddress)).to.equal(0n);
    expect(await wnative.balanceOf(nftAddress)).to.equal(0n);
  });

  it('does not let a permit callback bypass the manager lock through nested multicall', async () => {
    const { attacker, nativeAmount, nativeOnlyMint, nft, victim } = await prepareNativePositionPool();
    const nftAddress = await nft.getAddress();
    const MaliciousPermitToken = await ethers.getContractFactory('MaliciousPermitReentrantToken');
    const maliciousToken = await MaliciousPermitToken.deploy(nftAddress);
    const maliciousTokenAddress = await maliciousToken.getAddress();
    const nestedMintData = nft.interface.encodeFunctionData('mint', [nativeOnlyMint(attacker.address)]);
    const attackData = nft.interface.encodeFunctionData('multicall', [[nestedMintData]]);
    const permitData = nft.interface.encodeFunctionData('selfPermit', [
      maliciousTokenAddress,
      1,
      0,
      0,
      ethers.ZeroHash,
      ethers.ZeroHash,
    ]);
    const victimMintData = nft.interface.encodeFunctionData('mint', [nativeOnlyMint(victim.address)]);
    const refundData = nft.interface.encodeFunctionData('refundNativeToken');

    await maliciousToken.configureAttack(attackData);
    await nft.connect(victim).multicall([permitData, victimMintData, refundData], { value: nativeAmount });

    expect(await maliciousToken.attackSucceeded()).to.equal(false);
    await expectGuardRevert(await maliciousToken.attackResult());
    expect(await nft.balanceOf(attacker.address)).to.equal(0n);
    expect(await nft.ownerOf(2)).to.equal(victim.address);
  });

  it('blocks a malicious collected token from sweeping assets held by the manager', async () => {
    const [owner, recipient, thief] = await ethers.getSigners();
    const { nft, tokens } = await loadFixture(completeFixture);
    const ReentrantCollectToken = await ethers.getContractFactory('ReentrantCollectToken');
    const reentrantToken = await ReentrantCollectToken.deploy(MaxUint256 / 4n);
    const safeToken = tokens[0];
    const reentrantTokenAddress = await reentrantToken.getAddress();
    const safeTokenAddress = await safeToken.getAddress();
    const [token0, token1] =
      reentrantTokenAddress.toLowerCase() < safeTokenAddress.toLowerCase()
        ? [reentrantTokenAddress, safeTokenAddress]
        : [safeTokenAddress, reentrantTokenAddress];
    const safeTokenIsToken0 = token0 === safeTokenAddress;
    const tickLower = getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]);
    const tickUpper = getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]);
    const nftAddress = await nft.getAddress();

    await nft.createAndInitializePoolIfNecessary(token0, token1, encodePriceSqrt(1, 1));
    await reentrantToken.approve(nftAddress, MaxUint256);
    await safeToken.approve(nftAddress, MaxUint256);

    const mintParams = {
      token0,
      token1,
      deployer: ZeroAddress,
      tickLower,
      tickUpper,
      amount0Desired: 1_000_000,
      amount1Desired: 1_000_000,
      amount0Min: 0,
      amount1Min: 0,
      recipient: owner.address,
      deadline: 1,
    };
    await nft.mint(mintParams);
    await nft.mint(mintParams);

    const firstPosition = await nft.positions(1);
    const secondPosition = await nft.positions(2);
    await nft.decreaseLiquidity({
      tokenId: 1,
      liquidity: firstPosition.liquidity,
      amount0Min: 0,
      amount1Min: 0,
      deadline: 1,
    });
    await nft.decreaseLiquidity({
      tokenId: 2,
      liquidity: secondPosition.liquidity,
      amount0Min: 0,
      amount1Min: 0,
      deadline: 1,
    });

    const totalSafeTokensOwed =
      (safeTokenIsToken0 ? (await nft.positions(1)).tokensOwed0 : (await nft.positions(1)).tokensOwed1) +
      (safeTokenIsToken0 ? (await nft.positions(2)).tokensOwed0 : (await nft.positions(2)).tokensOwed1);
    const sweepData = nft.interface.encodeFunctionData('sweepToken', [safeTokenAddress, 0, thief.address]);
    // The first collection is intentionally benign. The callback occurs during the second collection,
    // while the manager is holding assets collected by the first multicall element.
    await reentrantToken.configureAttack(nftAddress, sweepData, 1);

    const collectParams = (tokenId: bigint) => ({
      tokenId,
      recipient: ZeroAddress,
      amount0Max: MaxUint128,
      amount1Max: MaxUint128,
    });
    const recipientBefore = await safeToken.balanceOf(recipient.address);
    const thiefBefore = await safeToken.balanceOf(thief.address);
    await nft.multicall([
      nft.interface.encodeFunctionData('collect', [collectParams(1n)]),
      nft.interface.encodeFunctionData('collect', [collectParams(2n)]),
      nft.interface.encodeFunctionData('sweepToken', [safeTokenAddress, totalSafeTokensOwed, recipient.address]),
    ]);

    expect(await reentrantToken.attackSucceeded()).to.equal(false);
    await expectGuardRevert(await reentrantToken.attackResult());
    expect(await safeToken.balanceOf(thief.address)).to.equal(thiefBefore);
    expect(await safeToken.balanceOf(recipient.address)).to.equal(recipientBefore + totalSafeTokensOwed);
    expect(await safeToken.balanceOf(nftAddress)).to.equal(0n);
  });

  it('blocks a plugin hook from decreasing liquidity during an increase', async () => {
    const [owner] = await ethers.getSigners();
    const { factory, nft, tokens } = await loadFixture(completeFixture);
    const [token0, token1] = [await tokens[0].getAddress(), await tokens[1].getAddress()];
    const tickLower = getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]);
    const tickUpper = getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]);
    const nftAddress = await nft.getAddress();

    await nft.createAndInitializePoolIfNecessary(token0, token1, encodePriceSqrt(1, 1));
    await tokens[0].approve(nftAddress, MaxUint256);
    await tokens[1].approve(nftAddress, MaxUint256);
    await nft.mint({
      token0,
      token1,
      deployer: ZeroAddress,
      tickLower,
      tickUpper,
      amount0Desired: 1_000_000,
      amount1Desired: 1_000_000,
      amount0Min: 0,
      amount1Min: 0,
      recipient: owner.address,
      deadline: 1,
    });

    const ReentrantPositionPlugin = await ethers.getContractFactory('ReentrantPositionPlugin');
    const plugin = await ReentrantPositionPlugin.deploy(nftAddress);
    const poolAddress = await factory.poolByPair(token0, token1);
    const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
    await pool.setPlugin(await plugin.getAddress());
    await pool.setPluginConfig(4); // BEFORE_POSITION_MODIFY_FLAG
    await nft.approve(await plugin.getAddress(), 1);

    const positionBefore = await nft.positions(1);
    const nestedDecrease = nft.interface.encodeFunctionData('decreaseLiquidity', [
      { tokenId: 1, liquidity: positionBefore.liquidity, amount0Min: 0, amount1Min: 0, deadline: 1 },
    ]);
    await plugin.configureAttack(nestedDecrease);

    await nft.increaseLiquidity({
      tokenId: 1,
      amount0Desired: 1_000_000,
      amount1Desired: 1_000_000,
      amount0Min: 0,
      amount1Min: 0,
      deadline: 1,
    });

    const positionAfter = await nft.positions(1);
    const poolPositionKey = toBeHex(
      (BigInt(nftAddress) << 48n) |
        (BigInt.asUintN(24, BigInt(tickLower)) << 24n) |
        BigInt.asUintN(24, BigInt(tickUpper)),
      32
    );
    const poolPosition = await pool.positions(poolPositionKey);

    expect(await plugin.attackSucceeded()).to.equal(false);
    await expectGuardRevert(await plugin.attackResult());
    expect(positionAfter.liquidity).to.equal(positionBefore.liquidity * 2n);
    expect(positionAfter.liquidity).to.equal(poolPosition.liquidity);
    expect(positionAfter.tokensOwed0).to.equal(0n);
    expect(positionAfter.tokensOwed1).to.equal(0n);
  });
});
