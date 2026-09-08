import { ethers } from 'hardhat';
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

async function fixture() {
  const deployed = await nestPluginFixture('MEV');
  const oracle = await installSpotOracle();
  return { ...deployed, oracle };
}

async function arm(plugin: any) {
  await plugin.setFallbackScalingFactor(FALLBACK_SLOPE);
  await plugin.setDeviationFeeConfig(BASE, CAP, SANDWICH_SLOPE, LONG_TWAP);
  await plugin.setOracleConfig(KLVR, DEADBAND, SHORT_TWAP, SPOT_INDEX, PRICE_EXP, false, CONFIG_GAP);
}

describe('NestMEVFeePlugin', () => {
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
