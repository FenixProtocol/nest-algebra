import { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import {
  abi as MOCK_PLUGIN_FACTORY_ABI,
  bytecode as MOCK_PLUGIN_FACTORY_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/test/MockDefaultPluginFactory.sol/MockDefaultPluginFactory.json';
import { IAlgebraFactory, MockTimeNonfungiblePositionManager } from '../../typechain';
import { FeeAmount, TICK_SPACINGS } from './constants';
import { encodePriceSqrt } from './encodePriceSqrt';
import poolAtAddress from './poolAtAddress';
import { getMaxTick, getMinTick } from './ticks';

export async function createInitializedCustomPool({
  nft,
  factory,
  wallet,
  tokenAddressA,
  tokenAddressB,
  liquidityAmount = 1000000,
}: {
  nft: MockTimeNonfungiblePositionManager;
  factory: IAlgebraFactory;
  wallet: Wallet;
  tokenAddressA: string;
  tokenAddressB: string;
  liquidityAmount?: number;
}): Promise<{ customDeployer: string; poolAddress: string }> {
  if (tokenAddressA.toLowerCase() > tokenAddressB.toLowerCase())
    [tokenAddressA, tokenAddressB] = [tokenAddressB, tokenAddressA];

  const entryPoint = await (await ethers.getContractFactory('AlgebraCustomPoolEntryPoint')).deploy(factory);
  const pluginFactory = await (
    await ethers.getContractFactory(MOCK_PLUGIN_FACTORY_ABI, MOCK_PLUGIN_FACTORY_BYTECODE)
  ).deploy();

  await factory.grantRole(await factory.CUSTOM_POOL_DEPLOYER(), await entryPoint.getAddress());

  const customDeployer = await pluginFactory.getAddress();
  await entryPoint.setCustomPoolDeployer(customDeployer, true);
  await pluginFactory.createCustomPool(
    await entryPoint.getAddress(),
    wallet.address,
    tokenAddressA,
    tokenAddressB,
    '0x'
  );

  const poolAddress = await factory.customPoolByPair(customDeployer, tokenAddressA, tokenAddressB);
  await poolAtAddress(poolAddress, wallet).initialize(encodePriceSqrt(1, 1));

  await nft.mint({
    token0: tokenAddressA,
    token1: tokenAddressB,
    deployer: customDeployer,
    tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    recipient: wallet.address,
    amount0Desired: liquidityAmount,
    amount1Desired: liquidityAmount,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 1,
  });

  return { customDeployer, poolAddress };
}
