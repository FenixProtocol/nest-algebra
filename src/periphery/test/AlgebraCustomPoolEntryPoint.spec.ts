import { Wallet, getCreateAddress, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import {
  abi as MOCK_PLUGIN_FACTORY_ABI,
  bytecode as MOCK_PLUGIN_FACTORY_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/test/MockDefaultPluginFactory.sol/MockDefaultPluginFactory.json';
import {
  abi as POOL_DEPLOYER_ABI,
  bytecode as POOL_DEPLOYER_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPoolDeployer.sol/AlgebraPoolDeployer.json';
import { expect } from './shared/expect';
import { createEmptyFactoryProxy } from './shared/externalFixtures';

const TEST_ADDRESSES: [string, string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000',
  '0x3000000000000000000000000000000000000000',
];

describe('AlgebraCustomPoolEntryPoint', () => {
  let wallet: Wallet, other: Wallet;

  async function fixture() {
    const [deployer] = await ethers.getSigners();
    const poolDeployerAddress = getCreateAddress({
      from: deployer.address,
      nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 4,
    });

    const factory = await createEmptyFactoryProxy();
    await factory.initialize(poolDeployerAddress);

    const poolDeployerFactory = await ethers.getContractFactory(POOL_DEPLOYER_ABI, POOL_DEPLOYER_BYTECODE);
    const poolDeployer = await poolDeployerFactory.deploy(factory);

    const entryPoint = (await (await ethers.getContractFactory('AlgebraCustomPoolEntryPoint')).deploy(factory)) as any;
    await factory.grantRole(await factory.CUSTOM_POOL_DEPLOYER(), await entryPoint.getAddress());

    const pluginFactory = await (
      await ethers.getContractFactory(MOCK_PLUGIN_FACTORY_ABI, MOCK_PLUGIN_FACTORY_BYTECODE)
    ).deploy();
    const customDeployer = await pluginFactory.getAddress();

    return { factory, poolDeployer, entryPoint, pluginFactory, customDeployer };
  }

  before('create fixture loader', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  function sortTokens(tokenA: string, tokenB: string): [string, string] {
    return BigInt(tokenA) < BigInt(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
  }

  it('initializes owner and factory through constructor', async () => {
    const { factory, entryPoint } = await loadFixture(fixture);

    expect(await entryPoint.owner()).to.eq(wallet.address);
    expect(await entryPoint.factory()).to.eq(await factory.getAddress());
    expect(await entryPoint.isPublicPoolCreationMode()).to.be.false;
  });

  it('reverts if constructed with zero factory', async () => {
    await expect((await ethers.getContractFactory('AlgebraCustomPoolEntryPoint')).deploy(ZeroAddress)).to.be
      .revertedWithoutReason;
  });

  it('allows owner to manage custom pool deployers in one batch', async () => {
    const { entryPoint } = await loadFixture(fixture);

    await expect(entryPoint.setCustomPoolDeployer(TEST_ADDRESSES[0], true))
      .to.emit(entryPoint, 'CustomPoolDeployer')
      .withArgs(TEST_ADDRESSES[0], true);
    expect(await entryPoint.isCustomPoolDeployer(TEST_ADDRESSES[0])).to.be.true;

    await entryPoint.setCustomPoolDeployerBatch([TEST_ADDRESSES[1], TEST_ADDRESSES[2]], true);
    expect(await entryPoint.isCustomPoolDeployer(TEST_ADDRESSES[1])).to.be.true;
    expect(await entryPoint.isCustomPoolDeployer(TEST_ADDRESSES[2])).to.be.true;

    await entryPoint.setCustomPoolDeployerBatch([TEST_ADDRESSES[0], TEST_ADDRESSES[1]], false);
    expect(await entryPoint.isCustomPoolDeployer(TEST_ADDRESSES[0])).to.be.false;
    expect(await entryPoint.isCustomPoolDeployer(TEST_ADDRESSES[1])).to.be.false;
    expect(await entryPoint.isCustomPoolDeployer(TEST_ADDRESSES[2])).to.be.true;
  });

  it('restricts custom pool deployer and public mode management to owner', async () => {
    const { entryPoint } = await loadFixture(fixture);

    await expect(entryPoint.connect(other).setCustomPoolDeployer(TEST_ADDRESSES[0], true)).to.be.revertedWith(
      'Ownable: caller is not the owner'
    );
    await expect(entryPoint.connect(other).setCustomPoolDeployerBatch([TEST_ADDRESSES[0]], true)).to.be.revertedWith(
      'Ownable: caller is not the owner'
    );
    await expect(entryPoint.connect(other).setPublicPoolCreationMode(true)).to.be.revertedWith(
      'Ownable: caller is not the owner'
    );
    await expect(entryPoint.setCustomPoolDeployer(ZeroAddress, true)).to.be.revertedWithoutReason;
    await expect(entryPoint.setCustomPoolDeployerBatch([TEST_ADDRESSES[0], ZeroAddress], true)).to.be
      .revertedWithoutReason;
  });

  it('allows owner to set public custom pool creation mode', async () => {
    const { entryPoint } = await loadFixture(fixture);

    await expect(entryPoint.setPublicPoolCreationMode(true))
      .to.emit(entryPoint, 'PublicPoolCreationMode')
      .withArgs(true);
    expect(await entryPoint.isPublicPoolCreationMode()).to.be.true;
  });

  it('reverts custom pool creation by non-whitelisted deployer in private mode', async () => {
    const { entryPoint, pluginFactory } = await loadFixture(fixture);

    await expect(
      pluginFactory.createCustomPool(
        await entryPoint.getAddress(),
        wallet.address,
        TEST_ADDRESSES[0],
        TEST_ADDRESSES[1],
        '0x'
      )
    ).to.be.revertedWithoutReason;
  });

  it('allows custom pool creation by whitelisted deployer in private mode', async () => {
    const { factory, entryPoint, pluginFactory, customDeployer } = await loadFixture(fixture);
    const [token0, token1] = sortTokens(TEST_ADDRESSES[0], TEST_ADDRESSES[1]);

    await entryPoint.setCustomPoolDeployer(customDeployer, true);
    await pluginFactory.createCustomPool(
      await entryPoint.getAddress(),
      wallet.address,
      TEST_ADDRESSES[0],
      TEST_ADDRESSES[1],
      '0x'
    );

    expect(await factory.customPoolByPair(customDeployer, token0, token1)).to.eq(
      await factory.computeCustomPoolAddress(customDeployer, token0, token1)
    );
  });

  it('allows non-whitelisted deployer in public mode', async () => {
    const { factory, entryPoint, pluginFactory, customDeployer } = await loadFixture(fixture);
    const [token0, token1] = sortTokens(TEST_ADDRESSES[1], TEST_ADDRESSES[2]);

    await entryPoint.setPublicPoolCreationMode(true);
    await pluginFactory.createCustomPool(
      await entryPoint.getAddress(),
      wallet.address,
      TEST_ADDRESSES[1],
      TEST_ADDRESSES[2],
      '0x'
    );

    expect(await factory.customPoolByPair(customDeployer, token0, token1)).to.eq(
      await factory.computeCustomPoolAddress(customDeployer, token0, token1)
    );
  });

  it('keeps deployer sender check in public mode', async () => {
    const { entryPoint, customDeployer } = await loadFixture(fixture);

    await entryPoint.setPublicPoolCreationMode(true);
    await expect(
      entryPoint.createCustomPool(customDeployer, wallet.address, TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x')
    ).to.be.revertedWith('Only deployer');
  });
});
