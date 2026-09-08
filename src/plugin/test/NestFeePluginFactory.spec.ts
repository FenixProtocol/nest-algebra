import { ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import { abi as POOL_ABI, bytecode as POOL_BYTECODE } from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPool.sol/AlgebraPool.json';
import { AlgebraPool } from '@cryptoalgebra/integral-core/typechain';
import { expect } from './shared/expect';
import { customPoolEnvironmentFixture, sortAddresses, TEST_ADDRESSES } from './shared/customPoolFixtures';

const SQRT_PRICE_1 = 79228162514264337593543950336n;

type Product = 'TWAP' | 'MEV';

async function deployFactoryFixture(product: Product) {
  const { factory, entryPoint } = await customPoolEnvironmentFixture();
  const implementationName = product === 'TWAP' ? 'NestTWAPFeePlugin' : 'NestMEVFeePlugin';
  const factoryName = product === 'TWAP' ? 'NestTWAPFeePluginFactory' : 'NestMEVFeePluginFactory';
  const implementation = await (await ethers.getContractFactory(implementationName)).deploy();
  const nestFactory: any = await (
    await ethers.getContractFactory(factoryName)
  ).deploy(await factory.getAddress(), await entryPoint.getAddress(), await implementation.getAddress());
  await entryPoint.setCustomPoolDeployer(await nestFactory.getAddress(), true);
  return { factory, entryPoint, implementation, nestFactory, implementationName };
}

const twapFixture = () => deployFactoryFixture('TWAP');
const mevFixture = () => deployFactoryFixture('MEV');

for (const [product, fixture] of [
  ['TWAP', twapFixture],
  ['MEV', mevFixture],
] as const) {
  describe(`Nest${product}FeePluginFactory`, () => {
    it('initializes beacon, governance, and inert defaults', async () => {
      const [owner] = await ethers.getSigners();
      const { factory, entryPoint, implementation, nestFactory } = await loadFixture(fixture);

      expect(await nestFactory.algebraFactory()).to.eq(await factory.getAddress());
      expect(await nestFactory.algebraCustomPoolEntryPoint()).to.eq(await entryPoint.getAddress());
      expect(await nestFactory.implementation()).to.eq(await implementation.getAddress());
      expect(await nestFactory.owner()).to.eq(owner.address);
      expect(await nestFactory.hasRole(await nestFactory.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
      expect(await nestFactory.hasRole(await nestFactory.CUSTOM_POOL_DEPLOYER(), owner.address)).to.be.true;
      expect(await nestFactory.defaultDeviationFeeConfiguration()).to.deep.eq([500n, 10_000n, 0n, 600n]);
    });

    it('creates and initializes a plugin for a standard pool', async () => {
      const { factory, nestFactory, implementationName } = await loadFixture(fixture);
      await factory.setDefaultPluginFactory(await nestFactory.getAddress());
      const expectedPool = await factory.computePoolAddress(TEST_ADDRESSES[0], TEST_ADDRESSES[1]);
      await factory.createPool(TEST_ADDRESSES[1], TEST_ADDRESSES[0]);

      const pool = (await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE)).attach(expectedPool) as any as AlgebraPool;
      const pluginAddress = await nestFactory.pluginByPool(expectedPool);
      expect(pluginAddress).to.not.eq(ZeroAddress);
      expect(await pool.plugin()).to.eq(pluginAddress);

      const plugin = await ethers.getContractAt(implementationName, pluginAddress);
      expect(await plugin.pool()).to.eq(expectedPool);
      expect(await plugin.isInitialized()).to.be.false;
      await pool.initialize(SQRT_PRICE_1);
      expect(await plugin.isInitialized()).to.be.true;
      expect(await plugin.deviationFeeConfig()).to.deep.eq([500n, 10_000n, 0n, 600n]);
    });

    it('creates one plugin for an existing standard pool', async () => {
      const { factory, nestFactory } = await loadFixture(fixture);
      const poolAddress = await factory.createPool.staticCall(TEST_ADDRESSES[0], TEST_ADDRESSES[1]);
      await factory.createPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1]);

      const pluginAddress = await nestFactory.createPluginForExistingPool.staticCall(TEST_ADDRESSES[1], TEST_ADDRESSES[0]);
      await nestFactory.createPluginForExistingPool(TEST_ADDRESSES[1], TEST_ADDRESSES[0]);
      expect(await nestFactory.pluginByPool(poolAddress)).to.eq(pluginAddress);
      await expect(nestFactory.createPluginForExistingPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1])).to.be.revertedWith('Already created');
    });

    it('creates a guarded custom pool and plugin through the entry point', async () => {
      const { factory, nestFactory, implementationName } = await loadFixture(fixture);
      const [token0, token1] = sortAddresses(TEST_ADDRESSES[0], TEST_ADDRESSES[1]);
      await nestFactory.setTokenWhitelistBatch([token0, token1], true);
      const expectedPool = await factory.computeCustomPoolAddress(await nestFactory.getAddress(), token0, token1);

      expect(await nestFactory.deployCustomPool.staticCall(token1, token0, '0x1234')).to.eq(expectedPool);
      await expect(nestFactory.deployCustomPool(token1, token0, '0x1234')).to.emit(factory, 'CustomPool');

      expect(await nestFactory.isCustomPool(expectedPool)).to.be.true;
      const pluginAddress = await nestFactory.pluginByPool(expectedPool);
      const pool = (await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE)).attach(expectedPool) as any as AlgebraPool;
      expect(await pool.plugin()).to.eq(pluginAddress);
      expect(await (await ethers.getContractAt(implementationName, pluginAddress)).pool()).to.eq(expectedPool);
    });

    it('enforces custom deployer and token whitelist controls', async () => {
      const [, other] = await ethers.getSigners();
      const { nestFactory } = await loadFixture(fixture);
      await nestFactory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], true);

      await expect(nestFactory.connect(other).deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x')).to.be.revertedWith(
        `AccessControl: account ${other.address.toLowerCase()} is missing role ${await nestFactory.CUSTOM_POOL_DEPLOYER()}`
      );

      await nestFactory.setPublicPoolCreationMode(true);
      await nestFactory.connect(other).deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x');
      await expect(nestFactory.setTokenWhitelist(ZeroAddress, true)).to.be.revertedWith('Zero token');
    });

    it('restricts custom hooks and manages only its own custom pools', async () => {
      const [, other] = await ethers.getSigners();
      const { factory, nestFactory } = await loadFixture(fixture);
      await expect(
        nestFactory.beforeCreatePoolHook(TEST_ADDRESSES[0], other.address, await nestFactory.getAddress(), TEST_ADDRESSES[1], TEST_ADDRESSES[2], '0x')
      ).to.be.revertedWith('Only entry point');

      await nestFactory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], true);
      const poolAddress = await nestFactory.deployCustomPool.staticCall(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x');
      await nestFactory.deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x');
      const pool = (await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE)).attach(poolAddress) as any as AlgebraPool;

      await nestFactory.setTickSpacing(poolAddress, 100);
      expect(await pool.tickSpacing()).to.eq(100);
      await nestFactory.setPlugin(poolAddress, ZeroAddress);
      expect(await pool.plugin()).to.eq(ZeroAddress);
      await expect(nestFactory.connect(other).setPlugin(poolAddress, ZeroAddress)).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(nestFactory.setFee(await factory.getAddress(), 500)).to.be.revertedWith('Unknown custom pool');
    });

    it('keeps defaults and beacon upgrades under Algebra factory administration', async () => {
      const [, other] = await ethers.getSigners();
      const { nestFactory, implementationName } = await loadFixture(fixture);
      await nestFactory.setDefaultDeviationFeeConfiguration(777, 12_000, 0, 900);
      expect(await nestFactory.defaultDeviationFeeConfiguration()).to.deep.eq([777n, 12_000n, 0n, 900n]);
      await expect(nestFactory.setDefaultDeviationFeeConfiguration(500, 10_000, 1_000_000, 600)).to.be.revertedWith('Default must be inert');
      await expect(nestFactory.connect(other).setFarmingAddress(other.address)).to.be.revertedWith('Only administrator');

      const nextImplementation = await (await ethers.getContractFactory(implementationName)).deploy();
      await nestFactory.upgradeTo(await nextImplementation.getAddress());
      expect(await nestFactory.implementation()).to.eq(await nextImplementation.getAddress());
      await expect(nestFactory.upgradeTo(ZeroAddress))
        .to.be.revertedWithCustomError(nestFactory, 'BeaconInvalidImplementation')
        .withArgs(ZeroAddress);
    });
  });
}
