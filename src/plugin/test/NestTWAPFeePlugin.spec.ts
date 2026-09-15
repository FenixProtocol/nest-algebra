import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import { expect } from './shared/expect';
import { nestPluginFixture } from './shared/nestFixtures';
import { PLUGIN_FLAGS } from './shared/utilities';

const BASE = 1_000;
const CAP = 10_000;
const SLOPE = 50_000_000;
const WINDOW = 600;

const fixture = () => nestPluginFixture('TWAP');

describe('NestTWAPFeePlugin', () => {
  it('initializes its recorder and applies a linear, capped, decaying TWAP fee', async () => {
    const { pool, plugin } = await loadFixture(fixture);
    expect(await plugin.isInitialized()).to.be.true;
    expect(await plugin.isTwapReady(WINDOW)).to.be.true;
    await plugin.setDeviationFeeConfig(BASE, CAP, SLOPE, WINDOW);

    await pool.swapToTick(100);
    expect((await pool.globalState())[2]).to.eq(BASE);
    expect(await plugin.getCurrentFee()).to.eq(6_000);
    await pool.swapToTick(100);
    expect((await pool.globalState())[2]).to.eq(6_000);

    await pool.swapToTick(10_000);
    await pool.swapToTick(10_000);
    expect((await pool.globalState())[2]).to.eq(CAP);
    await plugin.advanceTime(WINDOW + 1);
    await pool.swapToTick(10_000);
    expect((await pool.globalState())[2]).to.eq(BASE);
  });

  it('keeps the base fee flat when the dynamic slope is disabled', async () => {
    const { pool, plugin } = await loadFixture(fixture);
    await plugin.setDeviationFeeConfig(BASE, CAP, 0, WINDOW);
    await pool.swapToTick(10_000);
    await pool.swapToTick(10_000);
    expect(await plugin.getCurrentFee()).to.eq(BASE);
  });

  it('enforces fee-manager authorization, bounds, and TWAP readiness', async () => {
    const [, outsider] = await ethers.getSigners();
    const { mockFactory, plugin } = await loadFixture(fixture);
    await expect(plugin.connect(outsider).setDeviationFeeConfig(BASE, CAP, SLOPE, WINDOW)).to.be.revertedWith('Not fee manager');
    await mockFactory.grantRole(await plugin.DEVIATION_FEE_MANAGER(), outsider.address);
    await expect(plugin.connect(outsider).setDeviationFeeConfig(1_200, CAP, SLOPE, WINDOW))
      .to.emit(plugin, 'DeviationFeeConfigChanged')
      .withArgs(1_200, CAP, SLOPE, WINDOW);

    await expect(plugin.setDeviationFeeConfig(30_001, CAP, 0, WINDOW)).to.be.revertedWith('Base fee too high');
    await expect(plugin.setDeviationFeeConfig(BASE, BASE - 1, 0, WINDOW)).to.be.revertedWith('Invalid fee cap');
    await expect(plugin.setDeviationFeeConfig(BASE, CAP, 999_999, WINDOW)).to.be.revertedWith('Scaling factor too low');
    await expect(plugin.setDeviationFeeConfig(BASE, CAP, 100_000_001, WINDOW)).to.be.revertedWith('Scaling factor too high');
    await expect(plugin.setDeviationFeeConfig(BASE, CAP, 0, 59)).to.be.revertedWith('Invalid TWAP window');

    const cold = await nestPluginFixture('TWAP', false);
    await expect(cold.plugin.setDeviationFeeConfig(BASE, CAP, SLOPE, WINDOW)).to.be.revertedWith('TWAP not ready');
  });

  it('makes detached recorders inactive and restores them on reattachment', async () => {
    const { pool, plugin } = await loadFixture(fixture);
    await pool.setPlugin(ethers.ZeroAddress);
    expect(await plugin.isTwapReady(WINDOW)).to.be.false;
    await expect(plugin.getCurrentFee()).to.be.revertedWith('Plugin inactive');
    await expect(plugin.getTwapTick()).to.be.revertedWith('Recorder inactive');

    await pool.setPlugin(await plugin.getAddress());
    await pool.setPluginConfig(await plugin.defaultPluginConfig());
    expect(await plugin.isTwapReady(WINDOW)).to.be.true;
  });

  it('retains the inherited farming hook while keeping it dormant by default', async () => {
    const { pool, pluginFactory, plugin } = await loadFixture(fixture);
    const incentive = await (await ethers.getContractFactory('MockTimeVirtualPool')).deploy();
    expect(await plugin.incentive()).to.eq(ethers.ZeroAddress);
    await pluginFactory.setFarmingAddress((await ethers.getSigners())[0].address);
    await plugin.setIncentive(await incentive.getAddress());
    expect(await plugin.isIncentiveConnected(await incentive.getAddress())).to.be.true;
    expect(Number((await pool.globalState())[3]) & PLUGIN_FLAGS.AFTER_SWAP_FLAG).to.eq(PLUGIN_FLAGS.AFTER_SWAP_FLAG);
    await pool.swapToTick(7);
    expect(await incentive.currentTick()).to.eq(7);
    await plugin.setIncentive(ethers.ZeroAddress);
    expect(await plugin.isIncentiveConnected(await incentive.getAddress())).to.be.false;
  });

  it('rejects hook calls from addresses other than its pool', async () => {
    const { plugin } = await loadFixture(fixture);
    await expect(plugin.beforeSwap(ethers.ZeroAddress, ethers.ZeroAddress, true, 0, 0, false, '0x')).to.be.revertedWith('Only pool can call this');
    await expect(plugin.beforeFlash(ethers.ZeroAddress, ethers.ZeroAddress, 0, 0, '0x')).to.be.revertedWith('Only pool can call this');
  });
});
