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
import { installSpotOracle, SQRT_PRICE_1 } from './shared/nestFixtures';
import { MAX_SQRT_RATIO, MIN_SQRT_RATIO } from './shared/utilities';

type Product = 'TWAP' | 'MEV';
type SwapMode = 'exact0For1' | 'exact1For0' | 'zeroForExact1' | 'oneForExact0' | 'prepaid0For1' | 'prepaid1For0';

const BASE = 1_000;
const CAP = 10_000;
const FALLBACK_SLOPE = 40_000_000;
const KLVR = 50_000_000;
const DEADBAND = 20;
const LONG_TWAP = 600;
const SHORT_TWAP = 60;
const SPOT_INDEX = 107;
const PRICE_EXP = 18;
const CONFIG_GAP = 200;

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

async function alignOracleWithPool(pool: AlgebraPool, oracle: any) {
  const sqrtPrice = BigInt((await pool.globalState())[0]);
  const price = (sqrtPrice * sqrtPrice * 10n ** 18n) / (1n << 192n);
  await oracle.configure(0, price);
}

async function configurableMevFixture() {
  const deployed = await deployCustomPoolWithLiquidity('MEV');
  const oracle = await installSpotOracle();
  await time.increase(700);
  await deployed.plugin.setFallbackScalingFactor(FALLBACK_SLOPE);
  await deployed.plugin.setDeviationFeeConfig(BASE, CAP, 100_000_000, LONG_TWAP);
  await deployed.plugin.setOracleConfig(KLVR, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP);
  await deployed.callee.swapExact0For1(await deployed.pool.getAddress(), 10n ** 15n, (await ethers.getSigners())[0].address, MIN_SQRT_RATIO + 1n);
  await alignOracleWithPool(deployed.pool, oracle);
  return { ...deployed, oracle };
}

async function executeSwap(mode: SwapMode, pool: AlgebraPool, callee: TestAlgebraCallee) {
  const poolAddress = await pool.getAddress();
  const recipient = (await ethers.getSigners())[0].address;
  const amount = 10n ** 10n;
  if (mode === 'exact0For1') return callee.swapExact0For1(poolAddress, amount, recipient, MIN_SQRT_RATIO + 1n);
  if (mode === 'exact1For0') return callee.swapExact1For0(poolAddress, amount, recipient, MAX_SQRT_RATIO - 1n);
  if (mode === 'zeroForExact1') return callee.swap0ForExact1(poolAddress, amount, recipient, MIN_SQRT_RATIO + 1n);
  if (mode === 'oneForExact0') return callee.swap1ForExact0(poolAddress, amount, recipient, MAX_SQRT_RATIO - 1n);
  if (mode === 'prepaid0For1') return callee.swapExact0For1SupportingFee(poolAddress, amount, recipient, MIN_SQRT_RATIO + 1n);
  return callee.swapExact1For0SupportingFee(poolAddress, amount, recipient, MAX_SQRT_RATIO - 1n);
}

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

describe('Nest MEV configurable-slope integration', () => {
  for (const [mode, slope] of [
    ['exact0For1', 1_000_000],
    ['exact1For0', 20_000_000],
    ['zeroForExact1', 40_000_000],
    ['oneForExact0', 100_000_000],
    ['prepaid0For1', 1_000_000],
    ['prepaid1For0', 100_000_000],
  ] as const) {
    it(`applies the quoted slope fee for ${mode}`, async () => {
      const { pool, plugin, callee } = await loadFixture(configurableMevFixture);
      await plugin.setDeviationFeeConfig(BASE, CAP, slope, LONG_TWAP);
      const quote = await plugin.getCurrentFee({ blockTag: 'pending' });
      expect(quote).to.be.gt(BASE);

      await executeSwap(mode, pool, callee);
      expect((await pool.globalState())[2]).to.eq(quote);
      expect(await pool.fee()).to.eq(await plugin.getCurrentFee());
    });
  }

  it('keeps the selected live slope through real-pool fallback and recovery', async () => {
    const { pool, plugin, callee, oracle } = await loadFixture(configurableMevFixture);

    for (const slope of [1_000_000, 20_000_000, 40_000_000, 100_000_000]) {
      await plugin.setDeviationFeeConfig(BASE, CAP, slope, LONG_TWAP);
      await oracle.configure(1, 0);
      const failedQuote = await plugin.getCurrentFee({ blockTag: 'pending' });
      await executeSwap('exact1For0', pool, callee);
      expect((await pool.globalState())[2]).to.eq(failedQuote);

      await alignOracleWithPool(pool, oracle);
      const recoveredQuote = await plugin.getCurrentFee({ blockTag: 'pending' });
      await executeSwap('exact0For1', pool, callee);
      expect((await pool.globalState())[2]).to.eq(recoveredQuote);
      expect((await plugin.deviationFeeConfig())[2]).to.eq(slope);
      expect(await plugin.fallbackScalingFactor()).to.eq(FALLBACK_SLOPE);
    }
  });
});
