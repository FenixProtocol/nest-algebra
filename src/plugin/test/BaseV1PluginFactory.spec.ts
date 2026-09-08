import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { abi as POOL_ABI, bytecode as POOL_BYTECODE } from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPool.sol/AlgebraPool.json';
import { AlgebraPool } from '@cryptoalgebra/integral-core/typechain';
import { AlgebraBasePluginV1, BaseV1PluginFactory } from '../typechain';
import { expect } from './shared/expect';
import snapshotGasCost from './shared/snapshotGasCost';
import { customPoolEnvironmentFixture, sortAddresses, TEST_ADDRESSES } from './shared/customPoolFixtures';

describe('BaseV1PluginFactory', () => {
  let wallet: Wallet, other: Wallet;

  async function fixture() {
    const { factory, poolDeployer, entryPoint } = await customPoolEnvironmentFixture();

    const pluginImplementationFactory = await ethers.getContractFactory('AlgebraBasePluginV1');
    const pluginImplementation = (await pluginImplementationFactory.deploy()) as any as AlgebraBasePluginV1;

    const baseV1Factory = (await (
      await ethers.getContractFactory('BaseV1PluginFactory')
    ).deploy(await factory.getAddress(), await entryPoint.getAddress(), await pluginImplementation.getAddress())) as any as BaseV1PluginFactory;
    await entryPoint.setCustomPoolDeployer(await baseV1Factory.getAddress(), true);

    return { factory, poolDeployer, entryPoint, pluginImplementation, baseV1Factory };
  }

  before('create fixture loader', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  it('rejects invalid constructor dependencies', async () => {
    const { factory, entryPoint } = await customPoolEnvironmentFixture();
    const pluginImplementation = await (await ethers.getContractFactory('AlgebraBasePluginV1')).deploy();
    const baseV1Factory = await ethers.getContractFactory('BaseV1PluginFactory');

    await expect(baseV1Factory.deploy(ZeroAddress, entryPoint, pluginImplementation)).to.be.revertedWith('Invalid Algebra factory');
    await expect(baseV1Factory.deploy(factory, ZeroAddress, pluginImplementation)).to.be.revertedWith('Invalid custom pool entry point');
    await expect(baseV1Factory.deploy(factory, entryPoint, ZeroAddress))
      .to.be.revertedWithCustomError(baseV1Factory, 'BeaconInvalidImplementation')
      .withArgs(ZeroAddress);
  });

  it('initializes owner, roles, dependencies, beacon implementation, and default fee config', async () => {
    const { factory, entryPoint, pluginImplementation, baseV1Factory } = await loadFixture(fixture);

    expect(await baseV1Factory.owner()).to.eq(wallet.address);
    expect(await baseV1Factory.hasRole(await baseV1Factory.DEFAULT_ADMIN_ROLE(), wallet.address)).to.be.true;
    expect(await baseV1Factory.hasRole(await baseV1Factory.CUSTOM_POOL_DEPLOYER(), wallet.address)).to.be.true;
    expect(await baseV1Factory.algebraFactory()).to.eq(await factory.getAddress());
    expect(await baseV1Factory.algebraCustomPoolEntryPoint()).to.eq(await entryPoint.getAddress());
    expect(await baseV1Factory.implementation()).to.eq(await pluginImplementation.getAddress());
    expect(await baseV1Factory.defaultFeeConfiguration()).to.deep.eq([2900n, 12000n, 360n, 60000n, 59n, 8500n, 100n]);
  });

  it('manages token whitelist in batches', async () => {
    const { baseV1Factory } = await loadFixture(fixture);

    await baseV1Factory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], true);
    expect(await baseV1Factory.isWhitelistedToken(TEST_ADDRESSES[0])).to.be.true;
    expect(await baseV1Factory.isWhitelistedToken(TEST_ADDRESSES[1])).to.be.true;

    await baseV1Factory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], false);
    expect(await baseV1Factory.isWhitelistedToken(TEST_ADDRESSES[0])).to.be.false;
    expect(await baseV1Factory.isWhitelistedToken(TEST_ADDRESSES[1])).to.be.false;

    await expect(baseV1Factory.connect(other).setTokenWhitelistBatch([TEST_ADDRESSES[2]], true)).to.be.revertedWith(
      `Ownable: caller is not the owner`
    );
    await expect(baseV1Factory.setTokenWhitelistBatch([ZeroAddress], true)).to.be.revertedWith('Zero token');
  });

  it('reverts custom pool deployment when caller lacks deployer role in private mode', async () => {
    const { baseV1Factory } = await loadFixture(fixture);
    await baseV1Factory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], true);

    await expect(baseV1Factory.connect(other).deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x')).to.be.revertedWith(
      `AccessControl: account ${other.address.toLowerCase()} is missing role ${await baseV1Factory.CUSTOM_POOL_DEPLOYER()}`
    );
  });

  it('reverts custom pool deployment for non-whitelisted tokens', async () => {
    const { baseV1Factory } = await loadFixture(fixture);
    await baseV1Factory.setTokenWhitelist(TEST_ADDRESSES[0], true);

    await expect(baseV1Factory.deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x')).to.be.revertedWith('TokenB not whitelisted');
  });

  it('deploys custom pool and plugin through the custom pool entry point', async () => {
    const { factory, baseV1Factory } = await loadFixture(fixture);
    const [token0, token1] = sortAddresses(TEST_ADDRESSES[1], TEST_ADDRESSES[0]);
    await baseV1Factory.setTokenWhitelistBatch([token0, token1], true);

    const expectedPool = await factory.computeCustomPoolAddress(await baseV1Factory.getAddress(), token0, token1);
    expect(await baseV1Factory.deployCustomPool.staticCall(TEST_ADDRESSES[1], TEST_ADDRESSES[0], '0x1234')).to.eq(expectedPool);

    await expect(baseV1Factory.deployCustomPool(TEST_ADDRESSES[1], TEST_ADDRESSES[0], '0x1234')).to.emit(factory, 'CustomPool');

    expect(await baseV1Factory.isCustomPool(expectedPool)).to.be.true;
    const pluginAddress = await baseV1Factory.pluginByPool(expectedPool);
    expect(pluginAddress).to.not.eq(ZeroAddress);

    const poolFactory = await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE);
    const pool = poolFactory.attach(expectedPool) as any as AlgebraPool;
    expect(await pool.plugin()).to.eq(pluginAddress);

    const plugin = (await ethers.getContractAt('AlgebraBasePluginV1', pluginAddress)) as any as AlgebraBasePluginV1;
    expect(await plugin.pool()).to.eq(expectedPool);
    expect(await plugin.feeConfig()).to.deep.eq([2900n, 12000n, 360n, 60000n, 59n, 8500n, 100n]);
  });

  it('creates and initializes a plugin for a standard pool', async () => {
    const { factory, baseV1Factory } = await loadFixture(fixture);
    await factory.setDefaultPluginFactory(await baseV1Factory.getAddress());
    const expectedPool = await factory.computePoolAddress(TEST_ADDRESSES[0], TEST_ADDRESSES[1]);

    await factory.createPool(TEST_ADDRESSES[1], TEST_ADDRESSES[0]);

    const pool = (await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE)).attach(expectedPool) as any as AlgebraPool;
    const pluginAddress = await baseV1Factory.pluginByPool(expectedPool);
    expect(pluginAddress).to.not.eq(ZeroAddress);
    expect(await pool.plugin()).to.eq(pluginAddress);
    expect(await (await ethers.getContractAt('AlgebraBasePluginV1', pluginAddress)).feeConfig()).to.deep.eq([
      2900n,
      12000n,
      360n,
      60000n,
      59n,
      8500n,
      100n,
    ]);
  });

  it('creates one plugin for an existing standard pool', async () => {
    const { factory, baseV1Factory } = await loadFixture(fixture);
    const poolAddress = await factory.createPool.staticCall(TEST_ADDRESSES[0], TEST_ADDRESSES[1]);
    await factory.createPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1]);

    const pluginAddress = await baseV1Factory.createPluginForExistingPool.staticCall(TEST_ADDRESSES[1], TEST_ADDRESSES[0]);
    await baseV1Factory.createPluginForExistingPool(TEST_ADDRESSES[1], TEST_ADDRESSES[0]);
    expect(await baseV1Factory.pluginByPool(poolAddress)).to.eq(pluginAddress);
    await expect(baseV1Factory.createPluginForExistingPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1])).to.be.revertedWith('Already created');
  });

  it('allows public custom pool deployment without deployer role', async () => {
    const { factory, baseV1Factory } = await loadFixture(fixture);
    await baseV1Factory.setPublicPoolCreationMode(true);
    await baseV1Factory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[2]], true);

    const [token0, token1] = sortAddresses(TEST_ADDRESSES[0], TEST_ADDRESSES[2]);
    const expectedPool = await factory.computeCustomPoolAddress(await baseV1Factory.getAddress(), token0, token1);

    await baseV1Factory.connect(other).deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[2], '0x');
    expect(await baseV1Factory.isCustomPool(expectedPool)).to.be.true;
  });

  it('restricts hooks to the custom pool entry point', async () => {
    const { baseV1Factory } = await loadFixture(fixture);

    await expect(baseV1Factory.createPlugin(TEST_ADDRESSES[0], TEST_ADDRESSES[1], TEST_ADDRESSES[2])).to.be.revertedWith('Only Algebra factory');
    await expect(
      baseV1Factory.beforeCreatePoolHook(
        TEST_ADDRESSES[0],
        wallet.address,
        await baseV1Factory.getAddress(),
        TEST_ADDRESSES[1],
        TEST_ADDRESSES[2],
        '0x'
      )
    ).to.be.revertedWith('Only entry point');
    await expect(baseV1Factory.afterCreatePoolHook(TEST_ADDRESSES[0], TEST_ADDRESSES[1], await baseV1Factory.getAddress())).to.be.revertedWith(
      'Only entry point'
    );
  });

  it('allows an Algebra factory administrator to update fee config and beacon implementation', async () => {
    const { baseV1Factory } = await loadFixture(fixture);
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

    await baseV1Factory.setDefaultFeeConfiguration(newFeeConfig);
    expect(await baseV1Factory.defaultFeeConfiguration()).to.deep.eq([1n, 2n, 3n, 4n, 5n, 6n, 7n]);

    await expect(baseV1Factory.setDefaultFeeConfiguration({ ...newFeeConfig, gamma1: 0 })).to.be.revertedWith('Gammas must be > 0');
    await expect(baseV1Factory.connect(other).setDefaultFeeConfiguration(newFeeConfig)).to.be.revertedWith('Only administrator');

    await baseV1Factory.upgradeTo(newPluginImplementation);
    expect(await baseV1Factory.implementation()).to.eq(await newPluginImplementation.getAddress());

    await expect(baseV1Factory.upgradeTo(ZeroAddress))
      .to.be.revertedWithCustomError(baseV1Factory, 'BeaconInvalidImplementation')
      .withArgs(ZeroAddress);
    await expect(baseV1Factory.connect(other).upgradeTo(newPluginImplementation)).to.be.revertedWith('Only administrator');
  });

  it('allows owner to manage created custom pool settings through entry point', async () => {
    const { baseV1Factory } = await loadFixture(fixture);
    await baseV1Factory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], true);

    const poolAddress = await baseV1Factory.deployCustomPool.staticCall(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x');
    await baseV1Factory.deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x');

    const poolFactory = await ethers.getContractFactory(POOL_ABI, POOL_BYTECODE);
    const pool = poolFactory.attach(poolAddress) as any as AlgebraPool;
    await baseV1Factory.setTickSpacing(poolAddress, 100);
    expect(await pool.tickSpacing()).to.eq(100);

    await baseV1Factory.setPluginConfig(poolAddress, 0);
    await baseV1Factory.setFee(poolAddress, 500);
    const globalState = await pool.globalState();
    expect(globalState[2]).to.eq(500);

    await expect(baseV1Factory.connect(other).setFee(poolAddress, 501)).to.be.revertedWith('Ownable: caller is not the owner');
    await expect(baseV1Factory.setFee(TEST_ADDRESSES[2], 500)).to.be.revertedWith('Unknown custom pool');
  });

  describe('#gas snapshots [ @skip-on-coverage ]', () => {
    it('setTokenWhitelistBatch', async () => {
      const { baseV1Factory } = await loadFixture(fixture);
      await snapshotGasCost(baseV1Factory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], true));
    });

    it('deployCustomPool', async () => {
      const { baseV1Factory } = await loadFixture(fixture);
      await baseV1Factory.setTokenWhitelistBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], true);
      await snapshotGasCost(baseV1Factory.deployCustomPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x'));
    });

    it('setPublicPoolCreationMode', async () => {
      const { baseV1Factory } = await loadFixture(fixture);
      await snapshotGasCost(baseV1Factory.setPublicPoolCreationMode(true));
    });

    it('setDefaultFeeConfiguration', async () => {
      const { baseV1Factory } = await loadFixture(fixture);
      await snapshotGasCost(
        baseV1Factory.setDefaultFeeConfiguration({
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
