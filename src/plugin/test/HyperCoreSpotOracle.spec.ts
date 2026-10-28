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

  it('converts negative exponents for 6, 8, and 18 decimal token orientations', async () => {
    const { harness } = await loadFixture(fixture);

    // HyperCore scale E=6 and a unit human price. token0 has 6 decimals and token1 has 18,
    // so the Algebra raw-unit ratio is 1e12.
    expect(await harness.convertPrice(10n ** 6n, -6, false)).to.deep.eq([276_324n, true]);

    // Reversing the pool tokens requires the reciprocal 1e-12 raw-unit ratio.
    expect(await harness.convertPrice(10n ** 6n, -6, true)).to.deep.eq([-276_325n, true]);

    // An 8-decimal token against an 18-decimal token needs 1e10 or its reciprocal.
    expect(await harness.convertPrice(10n ** 6n, -4, false)).to.deep.eq([230_270n, true]);
    expect(await harness.convertPrice(10n ** 6n, -4, true)).to.deep.eq([-230_271n, true]);
  });

  it('keeps inverted negative-exponent ratios non-zero when division rounds down', async () => {
    const { harness } = await loadFixture(fixture);
    const q192 = 1n << 192n;

    for (const { priceRaw, priceExp } of [
      { priceRaw: 3n, priceExp: -1 },
      { priceRaw: 123_456_789n, priceExp: -6 },
      { priceRaw: (1n << 64n) - 1n, priceExp: -19 },
    ]) {
      // These inputs all leave a remainder in at least one division, so this exercises the
      // floor(floor(Q192 / priceRaw) / scale) production path rather than exact division.
      const scale = 10n ** BigInt(-priceExp);
      const ratioX192 = q192 / priceRaw / scale;
      expect(q192 % priceRaw !== 0n || (q192 / priceRaw) % scale !== 0n).to.eq(true);
      expect(ratioX192).to.be.greaterThan(0n);

      const [tick, available] = await harness.convertPrice(priceRaw, priceExp, true);
      expect(available).to.eq(true);
    }
  });

  it('rejects an inverted negative-exponent ratio only after it leaves the supported tick range', async () => {
    const { harness } = await loadFixture(fixture);
    const priceRaw = (1n << 64n) - 1n;
    const q192 = 1n << 192n;

    // At -19 the floored Q192 ratio is still above MIN_SQRT_RATIO^2.
    const lastSupportedRatioX192 = q192 / priceRaw / 10n ** 19n;
    expect(lastSupportedRatioX192).to.be.greaterThan(4_295_128_739n ** 2n);
    const [, lastSupportedAvailable] = await harness.convertPrice(priceRaw, -19, true);
    expect(lastSupportedAvailable).to.eq(true);

    // At -20 the quotient is still non-zero; it is rejected because its square root is below
    // TickMath.MIN_SQRT_RATIO, not because integer division rounded ratioX192 down to zero.
    const firstUnsupportedRatioX192 = q192 / priceRaw / 10n ** 20n;
    expect(firstUnsupportedRatioX192).to.be.greaterThan(0n);
    expect(firstUnsupportedRatioX192).to.be.lessThan(4_295_128_739n ** 2n);
    expect(await harness.convertPrice(priceRaw, -20, true)).to.deep.eq([0n, false]);
  });

  it('uses full-precision multiplication for valid inverted exponents above 19', async () => {
    const { harness } = await loadFixture(fixture);
    expect(await harness.convertPrice(10n ** 18n, 20, true)).to.deep.eq([46_054n, true]);
  });

  it('rejects invalid price words and exponents without reverting', async () => {
    const { harness } = await loadFixture(fixture);
    expect(await harness.convertPrice(0, 18, false)).to.deep.eq([0n, false]);
    expect(await harness.convertPrice(1n << 64n, 18, false)).to.deep.eq([0n, false]);
    expect(await harness.convertPrice(1, -61, false)).to.deep.eq([0n, false]);
    expect(await harness.convertPrice(1, 61, false)).to.deep.eq([0n, false]);
    expect(await harness.convertPrice(1, -60, false)).to.deep.eq([0n, false]);
    expect(await harness.convertPrice(1, 60, false)).to.deep.eq([0n, false]);
  });

  it('accepts the maximum HyperCore uint64 price when the normalized ratio is valid', async () => {
    const { harness } = await loadFixture(fixture);
    expect(await harness.convertPrice((1n << 64n) - 1n, 19, false)).to.deep.eq([6_123n, true]);
  });

  it('accepts exactly one word and rejects reverting, empty, short, and gas-burning responses', async () => {
    const { harness, oracle } = await loadFixture(fixture);
    expect(await harness.getOracleTick(107, 18, false)).to.deep.eq([0n, true]);

    for (const mode of [1, 2, 3, 4]) {
      await oracle.configure(mode, 10n ** 18n);
      expect(await harness.getOracleTick(107, 18, false)).to.deep.eq([0n, false]);
    }
  });

  it('applies a negative exponent to a live precompile response', async () => {
    const { harness, oracle } = await loadFixture(fixture);
    await oracle.configure(0, 10n ** 6n);
    expect(await harness.getOracleTick(107, -6, false)).to.deep.eq([276_324n, true]);
    expect(await harness.getOracleTick(107, -6, true)).to.deep.eq([-276_325n, true]);
  });
});
