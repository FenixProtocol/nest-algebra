import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import {
  abi as MOCK_PLUGIN_FACTORY_ABI,
  bytecode as MOCK_PLUGIN_FACTORY_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/test/MockDefaultPluginFactory.sol/MockDefaultPluginFactory.json';
import { IAlgebraFactory, MockTimeNonfungiblePositionManager } from '../../typechain';
import { FeeAmount, TICK_SPACINGS } from './constants';
import { encodePriceSqrt } from './encodePriceSqrt';
import { getMaxTick, getMinTick } from './ticks';

export async function createPool(
  nft: MockTimeNonfungiblePositionManager,
  wallet: Wallet,
  tokenAddressA: string,
  tokenAddressB: string
) {
  if (tokenAddressA.toLowerCase() > tokenAddressB.toLowerCase())
    [tokenAddressA, tokenAddressB] = [tokenAddressB, tokenAddressA];

  await nft.createAndInitializePoolIfNecessary(tokenAddressA, tokenAddressB, encodePriceSqrt(1, 1));

  const liquidityParams = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    deployer: ZeroAddress,
    tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    recipient: wallet.address,
    amount0Desired: 1000000,
    amount1Desired: 1000000,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 1,
  };

  return nft.mint(liquidityParams);
}

export async function createPoolWithMultiplePositions(
  nft: MockTimeNonfungiblePositionManager,
  wallet: Wallet,
  tokenAddressA: string,
  tokenAddressB: string
) {
  if (tokenAddressA.toLowerCase() > tokenAddressB.toLowerCase())
    [tokenAddressA, tokenAddressB] = [tokenAddressB, tokenAddressA];

  await nft.createAndInitializePoolIfNecessary(tokenAddressA, tokenAddressB, encodePriceSqrt(1, 1));

  const liquidityParams = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    deployer: ZeroAddress,
    tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    recipient: wallet.address,
    amount0Desired: 1000000,
    amount1Desired: 1000000,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 1,
  };

  await nft.mint(liquidityParams);

  const liquidityParams2 = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    deployer: ZeroAddress,
    tickLower: -60,
    tickUpper: 60,
    recipient: wallet.address,
    amount0Desired: 100,
    amount1Desired: 100,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 1,
  };

  await nft.mint(liquidityParams2);

  const liquidityParams3 = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    deployer: ZeroAddress,
    tickLower: -120,
    tickUpper: 120,
    recipient: wallet.address,
    amount0Desired: 100,
    amount1Desired: 100,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 1,
  };

  return nft.mint(liquidityParams3);
}

export async function createPoolWithZeroTickInitialized(
  nft: MockTimeNonfungiblePositionManager,
  wallet: Wallet,
  tokenAddressA: string,
  tokenAddressB: string
) {
  if (tokenAddressA.toLowerCase() > tokenAddressB.toLowerCase())
    [tokenAddressA, tokenAddressB] = [tokenAddressB, tokenAddressA];

  await nft.createAndInitializePoolIfNecessary(tokenAddressA, tokenAddressB, encodePriceSqrt(1, 1));

  const liquidityParams = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    deployer: ZeroAddress,
    tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    recipient: wallet.address,
    amount0Desired: 1000000,
    amount1Desired: 1000000,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 1,
  };

  await nft.mint(liquidityParams);

  const liquidityParams2 = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    deployer: ZeroAddress,
    tickLower: 0,
    tickUpper: 60,
    recipient: wallet.address,
    amount0Desired: 100,
    amount1Desired: 100,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 1,
  };

  await nft.mint(liquidityParams2);

  const liquidityParams3 = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    deployer: ZeroAddress,
    tickLower: -120,
    tickUpper: 0,
    recipient: wallet.address,
    amount0Desired: 100,
    amount1Desired: 100,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 1,
  };

  return nft.mint(liquidityParams3);
}

export async function createCustomPool(
  nft: MockTimeNonfungiblePositionManager,
  factory: IAlgebraFactory,
  wallet: Wallet,
  tokenAddressA: string,
  tokenAddressB: string
): Promise<string> {
  if (tokenAddressA.toLowerCase() > tokenAddressB.toLowerCase())
    [tokenAddressA, tokenAddressB] = [tokenAddressB, tokenAddressA];

  const entryPoint = await (await ethers.getContractFactory('AlgebraCustomPoolEntryPoint')).deploy(factory);
  const pluginFactory = await (
    await ethers.getContractFactory(MOCK_PLUGIN_FACTORY_ABI, MOCK_PLUGIN_FACTORY_BYTECODE)
  ).deploy();
  await factory.grantRole(await factory.CUSTOM_POOL_DEPLOYER(), await entryPoint.getAddress());

  const customDeployer = await pluginFactory.getAddress();
  await pluginFactory.createCustomPool(await entryPoint.getAddress(), wallet.address, tokenAddressA, tokenAddressB, '0x');
  await nft.initializeCustomPoolIfNecessary(customDeployer, tokenAddressA, tokenAddressB, encodePriceSqrt(1, 1));

  const liquidityParams = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    deployer: customDeployer,
    tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    recipient: wallet.address,
    amount0Desired: 1000000,
    amount1Desired: 1000000,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 1,
  };

  await nft.mint(liquidityParams);
  return customDeployer;
}
