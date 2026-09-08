import { MaxUint256 } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import { abi as POOL_ABI, bytecode as POOL_BYTECODE } from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPool.sol/AlgebraPool.json';
import {
  abi as TEST_CALLEE_ABI,
  bytecode as TEST_CALLEE_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/test/TestAlgebraCallee.sol/TestAlgebraCallee.json';
import { AlgebraPool, TestAlgebraCallee } from '@cryptoalgebra/integral-core/typechain';
import { expect } from './shared/expect';
import { customPoolEnvironmentFixture } from './shared/customPoolFixtures';
import { tokensFixture } from './shared/externalFixtures';
import { SQRT_PRICE_1 } from './shared/nestFixtures';
import { MAX_SQRT_RATIO, MIN_SQRT_RATIO } from './shared/utilities';

type Product = 'TWAP' | 'MEV';

async function deployCustomPoolWithLiquidity(product: Product) {
  const { factory, entryPoint } = await customPoolEnvironmentFixture();
  const { token0, token1 } = await tokensFixture();
  const implementationName = product === 'TWAP' ? 'NestTWAPFeePlugin' : 'NestMEVFeePlugin';
  const factoryName = product === 'TWAP' ? 'NestTWAPFeePluginFactory' : 'NestMEVFeePluginFactory';
  const implementation = await (await ethers.getContractFactory(implementationName)).deploy();
  const nestFactory = await (
    await ethers.getContractFactory(factoryName)
  ).deploy(await factory.getAddress(), await entryPoint.getAddress(), await implementation.getAddress());
  await entryPoint.setCustomPoolDeployer(await nestFactory.getAddress(), true);

  const token0Address = await token0.getAddress();
  const token1Address = await token1.getAddress();
  const poolAddress = await nestFactory.deployCustomPool.staticCall(token0Address, token1Address, '0x');
  await nestFactory.deployCustomPool(token0Address, token1Address, '0x');
  const pool = (await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE)).attach(poolAddress) as any as AlgebraPool;
  const plugin = await ethers.getContractAt(implementationName, await nestFactory.pluginByPool(poolAddress));

  const callee = (await (await ethers.getContractFactory(TEST_CALLEE_ABI, TEST_CALLEE_BYTECODE)).deploy()) as any as TestAlgebraCallee;
  await token0.approve(await callee.getAddress(), MaxUint256);
  await token1.approve(await callee.getAddress(), MaxUint256);
  await pool.initialize(SQRT_PRICE_1);
  await callee.mint(poolAddress, (await ethers.getSigners())[0].address, -600, 600, 10n ** 18n);
  return { pool, plugin, callee, token0, token1 };
}

const twapFixture = () => deployCustomPoolWithLiquidity('TWAP');
const mevFixture = () => deployCustomPoolWithLiquidity('MEV');

for (const [product, fixture] of [
  ['TWAP', twapFixture],
  ['MEV', mevFixture],
] as const) {
  describe(`Nest ${product} custom-pool integration`, () => {
    it('initializes the recorder and completes real swaps in both directions', async () => {
      const { pool, plugin, callee } = await loadFixture(fixture);
      expect(await plugin.isInitialized()).to.be.true;
      expect(await pool.plugin()).to.eq(await plugin.getAddress());
      expect(await pool.liquidity()).to.be.gt(0);

      const reservesBefore = await pool.getReserves();
      await callee.swapExact0For1(await pool.getAddress(), 10n ** 10n, (await ethers.getSigners())[0].address, MIN_SQRT_RATIO + 1n);
      await callee.swapExact1For0(await pool.getAddress(), 10n ** 10n, (await ethers.getSigners())[0].address, MAX_SQRT_RATIO - 1n);
      const reservesAfter = await pool.getReserves();

      expect(reservesAfter).to.not.deep.eq(reservesBefore);
      expect((await pool.globalState())[2]).to.eq(500);
    });
  });
}
