import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { ethers } from 'hardhat';

import { expect } from './shared/expect';
import { installSpotOracle } from './shared/nestFixtures';

async function fixture() {
  const harness = await (await ethers.getContractFactory('HyperCoreSpotOracleHarness')).deploy();
  const oracle = await installSpotOracle();
  return { harness, oracle };
}

describe('HyperCoreSpotOracle', () => {
  it('converts a normalized price to the zero tick', async () => {
    const { harness } = await loadFixture(fixture);
    expect(await harness.convertPrice(10n ** 18n, 18, false)).to.deep.eq([0n, true]);
    expect(await harness.convertPrice(10n ** 18n, 18, true)).to.deep.eq([0n, true]);
  });

  it('rejects invalid price words and exponents without reverting', async () => {
    const { harness } = await loadFixture(fixture);
    expect(await harness.convertPrice(0, 18, false)).to.deep.eq([0n, false]);
    expect(await harness.convertPrice(10n ** 30n + 1n, 18, false)).to.deep.eq([0n, false]);
    expect(await harness.convertPrice(1, 61, false)).to.deep.eq([0n, false]);
    expect(await harness.convertPrice(1, 60, false)).to.deep.eq([0n, false]);
  });

  it('accepts exactly one word and rejects reverting, empty, short, and gas-burning responses', async () => {
    const { harness, oracle } = await loadFixture(fixture);
    expect(await harness.getOracleTick(107, 18, false)).to.deep.eq([0n, true]);

    for (const mode of [1, 2, 3, 4]) {
      await oracle.configure(mode, 10n ** 18n);
      expect(await harness.getOracleTick(107, 18, false)).to.deep.eq([0n, false]);
    }
  });
});
