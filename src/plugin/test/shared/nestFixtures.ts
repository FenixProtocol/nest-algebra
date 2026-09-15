import { ethers } from 'hardhat';
import { setCode } from '@nomicfoundation/hardhat-network-helpers';

import { MockFactory, MockPool } from '../../typechain';

export const SPOT_PRECOMPILE = '0x0000000000000000000000000000000000000808';
export const SQRT_PRICE_1 = 79228162514264337593543950336n;
export const TEST_START_TIME = 1_601_906_400;

export type NestProduct = 'TWAP' | 'MEV';

export async function nestPluginFixture(product: NestProduct, warm = true) {
  const mockFactory = (await (await ethers.getContractFactory('MockFactory')).deploy()) as any as MockFactory;
  const entryPointPlaceholder = await (await ethers.getContractFactory('MockHyperCoreSpotOracle')).deploy();
  const implementationName = product === 'TWAP' ? 'MockTimeNestTWAPFeePlugin' : 'MockTimeNestMEVFeePlugin';
  const factoryName = product === 'TWAP' ? 'NestTWAPFeePluginFactory' : 'NestMEVFeePluginFactory';
  const implementation = await (await ethers.getContractFactory(implementationName)).deploy();
  const pluginFactory: any = await (
    await ethers.getContractFactory(factoryName)
  ).deploy(await mockFactory.getAddress(), await entryPointPlaceholder.getAddress(), await implementation.getAddress());
  const pool = (await (await ethers.getContractFactory('MockPool')).deploy()) as any as MockPool;

  await mockFactory.createPlugin(await pluginFactory.getAddress(), await pool.getAddress());
  const pluginAddress = await pluginFactory.pluginByPool(await pool.getAddress());
  const plugin: any = await ethers.getContractAt(implementationName, pluginAddress);
  await plugin.advanceTime(TEST_START_TIME);
  await pool.setPlugin(pluginAddress);
  await pool.initialize(SQRT_PRICE_1);
  if (warm) {
    await plugin.advanceTime(700);
    await pool.swapToTick(0);
  }
  return { mockFactory, pool, pluginFactory, plugin, implementation };
}

export async function installSpotOracle(mode = 0, price = 10n ** 18n) {
  const source = await (await ethers.getContractFactory('MockHyperCoreSpotOracle')).deploy();
  await source.waitForDeployment();
  await setCode(SPOT_PRECOMPILE, await ethers.provider.getCode(await source.getAddress()));
  const oracle = await ethers.getContractAt('MockHyperCoreSpotOracle', SPOT_PRECOMPILE);
  await oracle.configure(mode, price);
  return oracle;
}
