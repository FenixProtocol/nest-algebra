import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { abi as POOL_ABI, bytecode as POOL_BYTECODE } from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPool.sol/AlgebraPool.json';
import { AlgebraPool } from '@cryptoalgebra/integral-core/typechain';
import { AlgebraBasePluginV1, CustomPoolPluginFactory } from '../typechain';
import { expect } from './shared/expect';
import snapshotGasCost from './shared/snapshotGasCost';
import { createEmptyCustomPoolPluginFactoryProxy, customPoolEnvironmentFixture, sortAddresses, TEST_ADDRESSES } from './shared/customPoolFixtures';

describe('CustomPoolPluginFactory', () => {
  let wallet: Wallet, other: Wallet;

  async function fixture() {
    const { factory, poolDeployer, entryPoint } = await customPoolEnvironmentFixture();

    const pluginImplementationFactory = await ethers.getContractFactory('AlgebraBasePluginV1');
    const pluginImplementation = (await pluginImplementationFactory.deploy()) as any as AlgebraBasePluginV1;

    const customFactory = await createEmptyCustomPoolPluginFactoryProxy();
    await customFactory.initialize(factory, entryPoint, pluginImplementation);
    await entryPoint.setCustomPoolDeployer(await customFactory.getAddress(), true);

    return { factory, poolDeployer, entryPoint, pluginImplementation, customFactory };
  }

  before('create fixture loader', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  it('fail if try initialize on implementation', async () => {
    const { factory, entryPoint } = await customPoolEnvironmentFixture();
    const pluginImplementation = await (await ethers.getContractFactory('AlgebraBasePluginV1')).deploy();
    const customFactoryImplementation = await (await ethers.getContractFactory('CustomPoolPluginFactory')).deploy();

    await expect(customFactoryImplementation.initialize(factory, entryPoint, pluginImplementation)).to.be.revertedWith(
      'Initializable: contract is already initialized'
    );
  });

  it('initializes owner, roles, dependencies, beacon implementation, and default fee config', async () => {
    const { factory, entryPoint, pluginImplementation, customFactory } = await loadFixture(fixture);

    expect(await customFactory.owner()).to.eq(wallet.address);
    expect(await customFactory.hasRole(await customFactory.DEFAULT_ADMIN_ROLE(), wallet.address)).to.be.true;
    expect(await customFactory.hasRole(await customFactory.CUSTOM_POOL_DEPLOYER(), wallet.address)).to.be.true;
    expect(await customFactory.factory()).to.eq(await factory.getAddress());
    expect(await customFactory.algebraCustomPoolEntryPoint()).to.eq(await entryPoint.getAddress());
    expect(await customFactory.implementation()).to.eq(await pluginImplementation.getAddress());
    expect(await customFactory.defaultFeeConfiguration()).to.deep.eq([2900n, 12000n, 360n, 60000n, 59n, 8500n, 100n]);
  });

  it('manages token whitelist in batches', async () => {
    const { customFactory } = await loadFixture(fixture);

    await customFactory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], true);
    expect(await customFactory.isWhitelistedToken(TEST_ADDRESSES[0])).to.be.true;
    expect(await customFactory.isWhitelistedToken(TEST_ADDRESSES[1])).to.be.true;

    await customFactory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], false);
    expect(await customFactory.isWhitelistedToken(TEST_ADDRESSES[0])).to.be.false;
    expect(await customFactory.isWhitelistedToken(TEST_ADDRESSES[1])).to.be.false;

    await expect(customFactory.connect(other).setTokenWhitelistBatch([TEST_ADDRESSES[2]], true)).to.be.revertedWith(
      `Ownable: caller is not the owner`
    );
    await expect(customFactory.setTokenWhitelistBatch([ZeroAddress], true)).to.be.revertedWithoutReason;
  });

  it('reverts custom pool deployment when caller lacks deployer role in private mode', async () => {
    const { customFactory } = await loadFixture(fixture);
    await customFactory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], true);

    await expect(customFactory.connect(other).deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x')).to.be.revertedWith(
      `AccessControl: account ${other.address.toLowerCase()} is missing role ${await customFactory.CUSTOM_POOL_DEPLOYER()}`
    );
  });

  it('reverts custom pool deployment for non-whitelisted tokens', async () => {
    const { customFactory } = await loadFixture(fixture);
    await customFactory.setTokenWhitelist(TEST_ADDRESSES[0], true);

    await expect(customFactory.deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x')).to.be.revertedWith('TokenB not whitelisted');
  });

  it('deploys custom pool and plugin through the custom pool entry point', async () => {
    const { factory, customFactory } = await loadFixture(fixture);
    const [token0, token1] = sortAddresses(TEST_ADDRESSES[1], TEST_ADDRESSES[0]);
    await customFactory.setTokenWhitelistBatch([token0, token1], true);

    const expectedPool = await factory.computeCustomPoolAddress(await customFactory.getAddress(), token0, token1);
    expect(await customFactory.deployCustomPool.staticCall(TEST_ADDRESSES[1], TEST_ADDRESSES[0], '0x1234')).to.eq(expectedPool);

    await expect(customFactory.deployCustomPool(TEST_ADDRESSES[1], TEST_ADDRESSES[0], '0x1234')).to.emit(factory, 'CustomPool');

    expect(await customFactory.isCustomPool(expectedPool)).to.be.true;
    const pluginAddress = await customFactory.pluginByPool(expectedPool);
    expect(pluginAddress).to.not.eq(ZeroAddress);

    const poolFactory = await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE);
    const pool = poolFactory.attach(expectedPool) as any as AlgebraPool;
    expect(await pool.plugin()).to.eq(pluginAddress);

    const plugin = (await ethers.getContractAt('AlgebraBasePluginV1', pluginAddress)) as any as AlgebraBasePluginV1;
    expect(await plugin.pool()).to.eq(expectedPool);
    expect(await plugin.feeConfig()).to.deep.eq([2900n, 12000n, 360n, 60000n, 59n, 8500n, 100n]);
  });

  it('allows public custom pool deployment without deployer role', async () => {
    const { factory, customFactory } = await loadFixture(fixture);
    await customFactory.setPublicPoolCreationMode(true);
    await customFactory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[2]], true);

    const [token0, token1] = sortAddresses(TEST_ADDRESSES[0], TEST_ADDRESSES[2]);
    const expectedPool = await factory.computeCustomPoolAddress(await customFactory.getAddress(), token0, token1);

    await customFactory.connect(other).deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[2], '0x');
    expect(await customFactory.isCustomPool(expectedPool)).to.be.true;
  });

  it('restricts hooks to the custom pool entry point and deprecates createPlugin', async () => {
    const { customFactory } = await loadFixture(fixture);

    await expect(customFactory.createPlugin(TEST_ADDRESSES[0], TEST_ADDRESSES[1], TEST_ADDRESSES[2])).to.be.revertedWith('Deprecated');
    await expect(
      customFactory.beforeCreatePoolHook(
        TEST_ADDRESSES[0],
        wallet.address,
        await customFactory.getAddress(),
        TEST_ADDRESSES[1],
        TEST_ADDRESSES[2],
        '0x'
      )
    ).to.be.revertedWith('Only entry point');
    await expect(customFactory.afterCreatePoolHook(TEST_ADDRESSES[0], TEST_ADDRESSES[1], await customFactory.getAddress())).to.be.revertedWith(
      'Only entry point'
    );
  });

  it('allows owner to update fee config and beacon implementation', async () => {
    const { customFactory } = await loadFixture(fixture);
    const newPluginImplementation = await (await ethers.getContractFactory('AlgebraBasePluginV1')).deploy();
    const newFeeConfig = {
      alpha1: 1,
      alpha2: 2,
      beta1: 3,
      beta2: 4,
      gamma1: 5,
      gamma2: 6,
      baseFee: 7,
    };

    await customFactory.setDefaultFeeConfiguration(newFeeConfig);
    expect(await customFactory.defaultFeeConfiguration()).to.deep.eq([1n, 2n, 3n, 4n, 5n, 6n, 7n]);

    await expect(customFactory.setDefaultFeeConfiguration({ ...newFeeConfig, gamma1: 0 })).to.be.revertedWith('Gammas must be > 0');
    await expect(customFactory.connect(other).setDefaultFeeConfiguration(newFeeConfig)).to.be.revertedWith('Ownable: caller is not the owner');

    await customFactory.upgradeTo(newPluginImplementation);
    expect(await customFactory.implementation()).to.eq(await newPluginImplementation.getAddress());

    await expect(customFactory.upgradeTo(ZeroAddress))
      .to.be.revertedWithCustomError(customFactory, 'BeaconInvalidImplementation')
      .withArgs(ZeroAddress);
    await expect(customFactory.connect(other).upgradeTo(newPluginImplementation)).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it('allows owner to manage created custom pool settings through entry point', async () => {
    const { customFactory } = await loadFixture(fixture);
    await customFactory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], true);

    const poolAddress = await customFactory.deployCustomPool.staticCall(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x');
    await customFactory.deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x');

    const poolFactory = await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE);
    const pool = poolFactory.attach(poolAddress) as any as AlgebraPool;
    await customFactory.setTickSpacing(poolAddress, 100);
    expect(await pool.tickSpacing()).to.eq(100);

    await customFactory.setPluginConfig(poolAddress, 0);
    await customFactory.setFee(poolAddress, 500);
    const globalState = await pool.globalState();
    expect(globalState[2]).to.eq(500);

    await expect(customFactory.connect(other).setFee(poolAddress, 501)).to.be.revertedWith('Ownable: caller is not the owner');
    await expect(customFactory.setFee(TEST_ADDRESSES[2], 500)).to.be.revertedWith('Unknown custom pool');
  });

  describe('#gas snapshots [ @skip-on-coverage ]', () => {
    it('setTokenWhitelistBatch', async () => {
      const { customFactory } = await loadFixture(fixture);
      await snapshotGasCost(customFactory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], true));
    });

    it('deployCustomPool', async () => {
      const { customFactory } = await loadFixture(fixture);
      await customFactory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], true);
      await snapshotGasCost(customFactory.deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x'));
    });

    it('setPublicPoolCreationMode', async () => {
      const { customFactory } = await loadFixture(fixture);
      await snapshotGasCost(customFactory.setPublicPoolCreationMode(true));
    });

    it('setDefaultFeeConfiguration', async () => {
      const { customFactory } = await loadFixture(fixture);
      await snapshotGasCost(
        customFactory.setDefaultFeeConfiguration({
          alpha1: 1,
          alpha2: 2,
          beta1: 3,
          beta2: 4,
          gamma1: 5,
          gamma2: 6,
          baseFee: 7,
        })
      );
    });
  });
});
