import { ethers, network } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import { expect } from './shared/expect';
import { installSpotOracle, nestPluginFixture } from './shared/nestFixtures';

const BASE = 1_000;
const CAP = 10_000;
const SANDWICH_SLOPE = 100_000_000;
const FALLBACK_SLOPE = 40_000_000;
const KLVR = 50_000_000;
const DEADBAND = 20;
const LONG_TWAP = 600;
const SHORT_TWAP = 60;
const SPOT_INDEX = 107;
const PRICE_EXP = 18;
const CONFIG_GAP = 200;
const MIN_SANDWICH_SLOPE = 1_000_000;
const MAX_SANDWICH_SLOPE = 100_000_000;
const MAX_UINT64 = (1n << 64n) - 1n;

type ArmOptions = {
  baseFee?: number;
  feeCap?: number;
  slope?: number;
  fallbackSlope?: number;
  klvr?: number;
  deadband?: number;
  longTwap?: number;
  shortTwap?: number;
};

async function fixture() {
  const deployed = await nestPluginFixture('MEV');
  const oracle = await installSpotOracle();
  return { ...deployed, oracle };
}

async function arm(plugin: any, options: ArmOptions = {}) {
  const {
    baseFee = BASE,
    feeCap = CAP,
    slope = SANDWICH_SLOPE,
    fallbackSlope = FALLBACK_SLOPE,
    klvr = KLVR,
    deadband = DEADBAND,
    longTwap = LONG_TWAP,
    shortTwap = SHORT_TWAP,
  } = options;
  await plugin.setFallbackScalingFactor(fallbackSlope);
  await plugin.setDeviationFeeConfig(baseFee, feeCap, slope, longTwap);
  await plugin.setOracleConfig(klvr, deadband, shortTwap, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP);
}

async function alignOracleWithPool(pool: any, oracle: any) {
  const sqrtPrice = BigInt((await pool.globalState())[0]);
  const price = (sqrtPrice * sqrtPrice * 10n ** 18n) / (1n << 192n);
  await oracle.configure(0, price);
}

describe('NestMEVFeePlugin', () => {
  for (const slope of [MIN_SANDWICH_SLOPE, 1_000_001, 20_000_000, 40_000_000, 99_999_999, MAX_SANDWICH_SLOPE]) {
    it(`accepts live slope ${slope} during activation and armed retuning`, async () => {
      const { plugin } = await loadFixture(fixture);
      await arm(plugin, { slope });
      expect((await plugin.deviationFeeConfig())[2]).to.eq(slope);
      expect(await plugin.getCurrentFee()).to.eq(BASE);

      const retunedSlope = slope === MIN_SANDWICH_SLOPE ? MAX_SANDWICH_SLOPE : MIN_SANDWICH_SLOPE;
      await plugin.setDeviationFeeConfig(BASE, CAP, retunedSlope, LONG_TWAP);
      expect((await plugin.deviationFeeConfig())[2]).to.eq(retunedSlope);
    });
  }

  it('exposes the new live-slope floor and still rejects zero during activation', async () => {
    const { plugin } = await loadFixture(fixture);
    expect(await plugin.MIN_ORACLE_LIVE_SCALING()).to.eq(MIN_SANDWICH_SLOPE);
    await plugin.setFallbackScalingFactor(FALLBACK_SLOPE);
    await plugin.setDeviationFeeConfig(BASE, CAP, 0, LONG_TWAP);
    await expect(plugin.setOracleConfig(KLVR, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP)).to.be.revertedWith(
      'Sandwich slope below floor'
    );
  });

  it('rejects out-of-range armed retunes atomically', async () => {
    const { plugin } = await loadFixture(fixture);
    await arm(plugin);

    for (const [slope, reason] of [
      [0, 'Sandwich slope below floor'],
      [999_999, 'Sandwich slope below floor'],
      [100_000_001, 'Scaling factor too high'],
      [MAX_UINT64, 'Scaling factor too high'],
    ] as const) {
      await expect(plugin.setDeviationFeeConfig(BASE, CAP, slope, LONG_TWAP)).to.be.revertedWith(reason);
      expect(await plugin.deviationFeeConfig()).to.deep.eq([BigInt(BASE), BigInt(CAP), BigInt(SANDWICH_SLOPE), BigInt(LONG_TWAP)]);
      expect(await plugin.fallbackScalingFactor()).to.eq(FALLBACK_SLOPE);
    }
  });

  it('rejects an unauthorized armed slope retune', async () => {
    const [, outsider] = await ethers.getSigners();
    const { plugin } = await loadFixture(fixture);
    await arm(plugin);
    await expect(plugin.connect(outsider).setDeviationFeeConfig(BASE, CAP, 40_000_000, LONG_TWAP)).to.be.revertedWith('Not fee manager');
  });

  for (const [slope, tick] of [
    [MIN_SANDWICH_SLOPE, -50],
    [20_000_000, 50],
    [40_000_000, -50],
    [MAX_SANDWICH_SLOPE, 50],
  ] as const) {
    it(`applies the exact short-TWAP fee for slope ${slope} at tick ${tick}`, async () => {
      const { pool, plugin } = await loadFixture(fixture);
      await arm(plugin, { feeCap: 50_000, slope, klvr: 1_000_000, deadband: 100 });
      await pool.swapToTick(tick);

      const expected = BigInt(BASE) + (BigInt(Math.abs(tick)) * BigInt(slope)) / 1_000_000n;
      expect(await plugin.getCurrentFee()).to.eq(expected);
      await pool.swapToTick(tick);
      expect((await pool.globalState())[2]).to.eq(expected);
    });
  }

  it('cannot increase the same-state fee when the live slope is lowered', async () => {
    const { pool, plugin } = await loadFixture(fixture);
    await arm(plugin, { feeCap: 50_000, slope: MAX_SANDWICH_SLOPE, klvr: 1_000_000, deadband: 100 });
    await pool.swapToTick(50);

    await plugin.setDeviationFeeConfig(BASE, 50_000, MAX_SANDWICH_SLOPE, LONG_TWAP);
    const higher = await plugin.getCurrentFee();
    await plugin.setDeviationFeeConfig(BASE, 50_000, 20_000_000, LONG_TWAP);
    const lower = await plugin.getCurrentFee();
    expect(lower).to.be.lte(higher);
    expect(lower).to.be.gte(BASE);
    expect(lower).to.be.lte(50_000);
  });

  it('continues to apply the total fee cap at configurable slopes', async () => {
    const { pool, plugin } = await loadFixture(fixture);
    const feeCap = 1_500;
    await arm(plugin, { feeCap, slope: 20_000_000, klvr: 1_000_000, deadband: 100 });
    await pool.swapToTick(200);
    expect(await plugin.getCurrentFee()).to.eq(feeCap);
  });

  it('preserves spot dominance and the same-block pool-tick anchor after lowering the slope', async () => {
    const { pool, plugin, oracle } = await loadFixture(fixture);
    await pool.swapToTick(150);
    const sqrtPrice = BigInt((await pool.globalState())[0]);
    const oraclePrice = (sqrtPrice * sqrtPrice * 10n ** 18n) / (1n << 192n);
    await pool.swapToTick(0);
    await oracle.configure(0, oraclePrice);
    await arm(plugin);

    const spotFee = await plugin.getCurrentFee();
    await plugin.setDeviationFeeConfig(BASE, CAP, MIN_SANDWICH_SLOPE, LONG_TWAP);
    expect(await plugin.getCurrentFee()).to.eq(spotFee);

    await network.provider.send('evm_setAutomine', [false]);
    try {
      const [sender] = await ethers.getSigners();
      const transaction = {
        from: sender.address,
        to: await pool.getAddress(),
        data: pool.interface.encodeFunctionData('swapToTick', [100]),
        gas: '0x989680',
      };
      await network.provider.send('eth_sendTransaction', [transaction]);
      await network.provider.send('eth_sendTransaction', [transaction]);
      await network.provider.send('evm_mine');
      expect((await pool.globalState())[2]).to.eq(spotFee);
    } finally {
      await network.provider.send('evm_setAutomine', [true]);
    }

    await network.provider.send('evm_mine');
    expect(await plugin.getCurrentFee()).to.be.lt(spotFee);
  });

  it('keeps fallback pricing independent and recovers with the selected live slope', async () => {
    const { pool, plugin, oracle } = await loadFixture(fixture);
    await arm(plugin, { slope: 20_000_000 });
    await pool.swapToTick(50);
    await alignOracleWithPool(pool, oracle);
    expect(await plugin.getCurrentFee()).to.eq(2_000);

    await oracle.configure(1, 0);
    const fallbackFee = await plugin.getCurrentFee();
    expect(fallbackFee).to.eq(3_000);
    await plugin.setDeviationFeeConfig(BASE, CAP, MIN_SANDWICH_SLOPE, LONG_TWAP);
    expect(await plugin.getCurrentFee()).to.eq(fallbackFee);
    await plugin.setDeviationFeeConfig(BASE, CAP, MAX_SANDWICH_SLOPE, LONG_TWAP);
    expect(await plugin.getCurrentFee()).to.eq(fallbackFee);

    await plugin.setDeviationFeeConfig(BASE, CAP, 20_000_000, LONG_TWAP);
    await alignOracleWithPool(pool, oracle);
    expect(await plugin.getCurrentFee()).to.eq(2_000);
  });

  it('uses the shared selected slope after disarm and preserves it on rearm', async () => {
    const { pool, plugin, oracle } = await loadFixture(fixture);
    await arm(plugin, { slope: 20_000_000 });
    await pool.swapToTick(50);
    await plugin.setOracleConfig(0, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP);
    await oracle.configure(1, 0);
    expect(await plugin.getCurrentFee()).to.eq(2_000);

    await alignOracleWithPool(pool, oracle);
    await plugin.setOracleConfig(KLVR, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP);
    expect((await plugin.deviationFeeConfig())[2]).to.eq(20_000_000);
  });

  it('prices the research slopes exactly and decays over the unchanged short window', async () => {
    const { pool, plugin, oracle } = await loadFixture(fixture);
    await arm(plugin);
    await pool.swapToTick(50);
    await alignOracleWithPool(pool, oracle);

    for (const [slope, fee] of [
      [MIN_SANDWICH_SLOPE, 1_050],
      [20_000_000, 2_000],
      [40_000_000, 3_000],
      [MAX_SANDWICH_SLOPE, 6_000],
    ] as const) {
      await plugin.setDeviationFeeConfig(BASE, CAP, slope, LONG_TWAP);
      expect(await plugin.getCurrentFee()).to.eq(fee);
    }

    await plugin.setDeviationFeeConfig(BASE, CAP, 40_000_000, LONG_TWAP);
    await pool.swapToTick(50);
    await plugin.advanceTime(30);
    await pool.swapToTick(50);
    expect(await plugin.getCurrentFee()).to.eq(2_000);
    await plugin.advanceTime(30);
    await pool.swapToTick(50);
    expect(await plugin.getCurrentFee()).to.eq(BASE);
  });

  it('does not let a low live slope bypass the remaining activation rails', async () => {
    const { plugin, oracle } = await loadFixture(fixture);
    await plugin.setDeviationFeeConfig(BASE, CAP, 20_000_000, LONG_TWAP);
    await expect(plugin.setOracleConfig(KLVR, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP)).to.be.revertedWith(
      'Set fallback slope first'
    );

    await plugin.setFallbackScalingFactor(FALLBACK_SLOPE);
    await expect(plugin.setOracleConfig(KLVR, DEADBAND, 59, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP)).to.be.revertedWith(
      'Invalid short TWAP window'
    );
    await expect(plugin.setOracleConfig(KLVR, 11, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP)).to.be.revertedWith('Insufficient LVR edge');
    await oracle.configure(1, 0);
    await expect(plugin.setOracleConfig(KLVR, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP)).to.be.revertedWith(
      'Oracle read failed'
    );
  });

  it('still requires independent short-TWAP readiness at a low live slope', async () => {
    const coldFixture = async () => {
      const deployed = await nestPluginFixture('MEV', false);
      const oracle = await installSpotOracle();
      return { ...deployed, oracle };
    };
    const { pool, plugin } = await loadFixture(coldFixture);
    await plugin.advanceTime(61);
    await pool.swapToTick(0);
    await plugin.setFallbackScalingFactor(FALLBACK_SLOPE);
    await plugin.setDeviationFeeConfig(BASE, CAP, 20_000_000, 60);
    await expect(plugin.setOracleConfig(KLVR, DEADBAND, LONG_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP)).to.be.revertedWith(
      'Short TWAP not ready'
    );
  });

  it('is equivalent to TWAP mode while the oracle term is disabled', async () => {
    const { pool, plugin, oracle } = await loadFixture(fixture);
    await plugin.setDeviationFeeConfig(BASE, CAP, 50_000_000, LONG_TWAP);
    await plugin.setOracleConfig(0, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP);
    await oracle.configure(1, 0);

    await pool.swapToTick(100);
    expect(await plugin.getCurrentFee()).to.eq(6_000);
  });

  it('uses the live spot gap with deadband and cap after the short TWAP catches up', async () => {
    const { pool, plugin } = await loadFixture(fixture);
    await arm(plugin);
    await pool.swapToTick(50);
    await plugin.advanceTime(SHORT_TWAP + 1);
    await pool.swapToTick(50);

    expect(await plugin.getCurrentFee()).to.eq(BASE + (50 - DEADBAND) * 50);
    await pool.swapToTick(10_001);
    await plugin.advanceTime(SHORT_TWAP + 1);
    await pool.swapToTick(10_001);
    expect(await plugin.getCurrentFee()).to.eq(CAP);
  });

  it('falls back on structural oracle failure and emits only availability transitions', async () => {
    const { pool, plugin, oracle } = await loadFixture(fixture);
    await arm(plugin);
    await pool.swapToTick(100);
    await oracle.configure(1, 0);

    await expect(pool.swapToTick(100)).to.emit(plugin, 'OracleFallback').withArgs(true);
    const fallbackFee = (await pool.globalState())[2];
    expect(fallbackFee).to.be.gte(BASE);
    expect(fallbackFee).to.be.lte(CAP);
    await expect(pool.swapToTick(100)).to.not.emit(plugin, 'OracleFallback');

    await oracle.configure(0, 10n ** 18n);
    await expect(pool.swapToTick(100)).to.emit(plugin, 'OracleFallback').withArgs(false);
  });

  it('cannot be blocked by an oracle that exhausts its stipend', async () => {
    const { pool, plugin, oracle } = await loadFixture(fixture);
    await arm(plugin);
    await oracle.configure(4, 0);
    await expect(pool.swapToTick(0)).to.emit(plugin, 'OracleFallback').withArgs(true);
  });

  it('enforces oracle authorization and activation safety rails', async () => {
    const [, outsider] = await ethers.getSigners();
    const { mockFactory, plugin } = await loadFixture(fixture);
    await expect(plugin.connect(outsider).setOracleConfig(KLVR, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP)).to.be.revertedWith(
      'Not fee manager'
    );
    await expect(plugin.connect(outsider).setFallbackScalingFactor(FALLBACK_SLOPE)).to.be.revertedWith('Not fee manager');

    await expect(plugin.setOracleConfig(100_000_001, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP)).to.be.revertedWith(
      'Klvr too high'
    );
    await expect(plugin.setOracleConfig(KLVR, 101, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP)).to.be.revertedWith('Deadband too high');
    await expect(plugin.setOracleConfig(KLVR, DEADBAND, SHORT_TWAP, SPOT_INDEX, 61, false, CONFIG_GAP)).to.be.revertedWith('Price exp too high');
    await expect(plugin.setOracleConfig(KLVR, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, 2_001)).to.be.revertedWith('Gap bound too high');

    await plugin.setDeviationFeeConfig(BASE, CAP, SANDWICH_SLOPE, LONG_TWAP);
    await expect(plugin.setOracleConfig(KLVR, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP)).to.be.revertedWith(
      'Set fallback slope first'
    );
    await mockFactory.grantRole(await plugin.DEVIATION_FEE_MANAGER(), outsider.address);
    await plugin.connect(outsider).setFallbackScalingFactor(FALLBACK_SLOPE);
  });

  it('stores and emits exact MEV configuration values', async () => {
    const { plugin } = await loadFixture(fixture);
    await plugin.setFallbackScalingFactor(FALLBACK_SLOPE);
    await plugin.setDeviationFeeConfig(BASE, CAP, SANDWICH_SLOPE, LONG_TWAP);
    await expect(plugin.setOracleConfig(KLVR, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP))
      .to.emit(plugin, 'OracleConfigChanged')
      .withArgs(KLVR, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP);
    expect(await plugin.mevFeeConfig()).to.deep.eq([
      BigInt(KLVR),
      BigInt(DEADBAND),
      BigInt(SHORT_TWAP),
      BigInt(SPOT_INDEX),
      BigInt(PRICE_EXP),
      false,
      BigInt(CONFIG_GAP),
    ]);
    expect(await plugin.fallbackScalingFactor()).to.eq(FALLBACK_SLOPE);
  });
});
