const hre = require('hardhat');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../../../scripts/networksConfig');

async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  const [deployer] = await hre.ethers.getSigners();
  let Config = getConfig(chainId);

  const deployDataPath = path.resolve(__dirname, '../../../' + Config.FILE);
  let deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));
  const AlgebraFactory = await hre.ethers.getContractFactory('AlgebraFactoryUpgradeable');
  const initializeData = AlgebraFactory.interface.encodeFunctionData('initialize', [deploysData.poolDeployer, deployer.address]);

  await hre.run('verify:verify', {
    address: deploysData.algebraFactoryImplementation,
    constructorArguments: [],
  });

  await hre.run('verify:verify', {
    address: deploysData.proxyAdmin,
    constructorArguments: [],
  });

  await hre.run('verify:verify', {
    address: deploysData.factory,
    constructorArguments: [deploysData.algebraFactoryImplementation, deploysData.proxyAdmin, initializeData],
  });

  await hre.run('verify:verify', {
    address: deploysData.poolDeployer,
    constructorArguments: [deploysData.factory],
  });

  await hre.run('verify:verify', {
    address: deploysData.vault,
    constructorArguments: [deploysData.factory, deployer.address],
  });

  await hre.run('verify:verify', {
    address: deploysData.vaultFactory,
    contract: 'contracts/AlgebraVaultFactoryStub.sol:AlgebraVaultFactoryStub',
    constructorArguments: [deploysData.vault],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
