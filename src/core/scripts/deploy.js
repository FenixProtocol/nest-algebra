const hre = require('hardhat');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../../../scripts/networksConfig');

async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();

  const Config = getConfig(chainId);

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error('No deployer configured for this network');

  const ProxyAdminFactory = await hre.ethers.getContractFactory('ProxyAdmin');
  const proxyAdmin = await ProxyAdminFactory.deploy();
  await proxyAdmin.waitForDeployment();

  const AlgebraFactory = await hre.ethers.getContractFactory('AlgebraFactoryUpgradeable');
  const algebraFactoryImplementation = await AlgebraFactory.deploy();
  await algebraFactoryImplementation.waitForDeployment();

  // precompute
  const poolDeployerAddress = hre.ethers.getCreateAddress({
    from: deployer.address,
    nonce: (await hre.ethers.provider.getTransactionCount(deployer.address)) + 1,
  });

  const initializeData = AlgebraFactory.interface.encodeFunctionData('initialize', [poolDeployerAddress, deployer.address]);
  const proxyFactory = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
  const proxy = await proxyFactory.deploy(algebraFactoryImplementation.target, proxyAdmin.target, initializeData); // +1
  await proxy.waitForDeployment();

  const factory = AlgebraFactory.attach(proxy.target);

  const PoolDeployerFactory = await hre.ethers.getContractFactory('AlgebraPoolDeployer');
  const poolDeployer = await PoolDeployerFactory.deploy(factory.target);

  await poolDeployer.waitForDeployment();

  if (hre.ethers.getAddress(poolDeployerAddress) !== hre.ethers.getAddress(poolDeployer.target)) {
    throw new Error(`Unexpected pool deployer address: expected ${poolDeployerAddress}, deployed ${poolDeployer.target}`);
  }

  console.log('Expected poolDeployer:', poolDeployerAddress, ', actual:', poolDeployer.target);
  console.log('AlgebraPoolDeployer to:', poolDeployer.target);
  console.log('AlgebraFactory deployed to:', factory.target);
  console.log('AlgebraFactoryImplementation deployed to:', algebraFactoryImplementation.target);
  console.log('ProxyAdmin deployed to:', proxyAdmin.target);

  const vaultFactory = await hre.ethers.getContractFactory('AlgebraCommunityVault');
  const vault = await vaultFactory.deploy(factory, deployer.address);

  await vault.waitForDeployment();

  console.log('AlgebraCommunityVault deployed to:', vault.target);

  const vaultFactoryStubFactory = await hre.ethers.getContractFactory('AlgebraVaultFactoryStub');
  const vaultFactoryStub = await vaultFactoryStubFactory.deploy(vault);

  await vaultFactoryStub.waitForDeployment();

  console.log('AlgebraVaultFactoryStub deployed to:', vaultFactoryStub.target);

  const setVaultFactoryTx = await factory.setVaultFactory(vaultFactoryStub);
  await setVaultFactoryTx.wait();

  const deployDataPath = path.resolve(__dirname, '../../../' + Config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));
  deploysData.poolDeployer = poolDeployer.target;
  deploysData.factory = factory.target;
  deploysData.algebraFactoryImplementation = algebraFactoryImplementation.target;
  deploysData.proxyAdmin = proxyAdmin.target;
  deploysData.vault = vault.target;
  deploysData.vaultFactory = vaultFactoryStub.target;
  fs.writeFileSync(deployDataPath, `${JSON.stringify(deploysData, null, 2)}\n`, 'utf-8');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
