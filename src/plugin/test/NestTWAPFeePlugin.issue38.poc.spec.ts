import { MaxUint256 } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';

import { abi as POOL_ABI, bytecode as POOL_BYTECODE } from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPool.sol/AlgebraPool.json';
import {
  abi as TEST_CALLEE_ABI,
  bytecode as TEST_CALLEE_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/test/TestAlgebraCallee.sol/TestAlgebraCallee.json';
import { AlgebraPool, TestAlgebraCallee } from '@cryptoalgebra/integral-core/typechain';

import { expect } from './shared/expect';
import { customPoolEnvironmentFixture } from './shared/customPoolFixtures';
import { tokensFixture } from './shared/externalFixtures';
import { MAX_SQRT_RATIO, MIN_SQRT_RATIO } from './shared/utilities';

const SQRT_PRICE_1 = 79228162514264337593543950336n;
const LOWER_TICK = -600;
const UPPER_TICK = 600;
const LIQUIDITY = 10n ** 18n;
const EXIT_AMOUNT = 10n ** 20n;

/**
 * This test is intended to be run with a caller-supplied, pinned HyperEVM
 * Hardhat fork. It deploys an isolated production custom-pool stack
 * into that fork; no live pool state or deployed protocol contracts are used.
 */
async function issue38Fixture() {
  const [trader] = await ethers.getSigners();
  const { factory, entryPoint } = await customPoolEnvironmentFixture();
  const { token0, token1 } = await tokensFixture();

  const implementation = await (await ethers.getContractFactory('NestTWAPFeePlugin')).deploy();
  const pluginFactory = await (
    await ethers.getContractFactory('NestTWAPFeePluginFactory')
  ).deploy(await factory.getAddress(), await entryPoint.getAddress(), await implementation.getAddress());
  await entryPoint.setCustomPoolDeployer(await pluginFactory.getAddress(), true);

  const poolAddress = await pluginFactory.deployCustomPool.staticCall(await token0.getAddress(), await token1.getAddress(), SQRT_PRICE_1);
  await pluginFactory.deployCustomPool(await token0.getAddress(), await token1.getAddress(), SQRT_PRICE_1);

  const pool = (await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE)).attach(poolAddress) as any as AlgebraPool;
  const plugin = await ethers.getContractAt('NestTWAPFeePlugin', await pluginFactory.pluginByPool(poolAddress));
  const callee = (await (await ethers.getContractFactory(TEST_CALLEE_ABI, TEST_CALLEE_BYTECODE)).deploy()) as any as TestAlgebraCallee;

  await token0.approve(await callee.getAddress(), MaxUint256);
  await token1.approve(await callee.getAddress(), MaxUint256);
  await callee.mint(poolAddress, trader.address, LOWER_TICK, UPPER_TICK, LIQUIDITY);

  expect(await pool.plugin()).to.eq(await plugin.getAddress());
  expect(await plugin.isInitialized()).to.be.true;
  expect(await pool.liquidity()).to.eq(LIQUIDITY);

  return { callee, plugin, pool, trader };
}

async function latestRecordedTick(plugin: any): Promise<bigint> {
  const index = await plugin.timepointIndex();
  return (await plugin.timepoints(index)).tick;
}

describe('NestTWAPFeePlugin Issue_38 HyperEVM fork regression', () => {
  it('records the upper liquid edge after a one-to-zero swap exits the range', async () => {
    const { callee, plugin, pool, trader } = await loadFixture(issue38Fixture);
    const poolAddress = await pool.getAddress();

    await callee.swapExact1For0(poolAddress, EXIT_AMOUNT, trader.address, MAX_SQRT_RATIO - 1n);
    expect(await pool.liquidity()).to.eq(0);
    expect((await pool.globalState()).tick).to.be.gt(UPPER_TICK);

    await time.increase(1);
    await callee.swapExact0For1(poolAddress, 1n, trader.address, MIN_SQRT_RATIO + 1n);

    const recordedTick = await latestRecordedTick(plugin);
    expect(recordedTick).to.eq(BigInt(UPPER_TICK - 1));
    expect(recordedTick).to.be.gte(LOWER_TICK);
    expect(recordedTick).to.be.lte(UPPER_TICK);
  });

  it('records the lower liquid edge after a zero-to-one swap exits the range', async () => {
    const { callee, plugin, pool, trader } = await loadFixture(issue38Fixture);
    const poolAddress = await pool.getAddress();

    await callee.swapExact0For1(poolAddress, EXIT_AMOUNT, trader.address, MIN_SQRT_RATIO + 1n);
    expect(await pool.liquidity()).to.eq(0);
    expect((await pool.globalState()).tick).to.be.lt(LOWER_TICK);

    await time.increase(1);
    await callee.swapExact1For0(poolAddress, 1n, trader.address, MAX_SQRT_RATIO - 1n);

    const recordedTick = await latestRecordedTick(plugin);
    expect(recordedTick).to.eq(BigInt(LOWER_TICK));
    expect(recordedTick).to.be.gte(LOWER_TICK);
    expect(recordedTick).to.be.lte(UPPER_TICK);
  });
});
