const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../../../scripts/networksConfig');

const CONTRACT_NAME = 'NonfungibleTokenPositionDescriptor';
const DEPLOY_FILE = 'hyper_evm_deploy.json';
const W_NATIVE_TOKEN_ADDRESS = '0x5555555555555555555555555555555555555555';
const NATIVE_CURRENCY_SYMBOL = 'WHYPE';
const TOKEN_RATIO_SORT_DATA = [];

async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  const Config = getConfig(chainId);

  if (Config.FILE !== DEPLOY_FILE) {
    throw new Error('This script is intended for ' + DEPLOY_FILE + ', got ' + Config.FILE);
  }

  const deployDataPath = path.resolve(__dirname, '../../../' + Config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  if (!deploysData.NFTDescriptor) {
    throw new Error('NFTDescriptor address is required in ' + Config.FILE + ' to link ' + CONTRACT_NAME);
  }

  const constructorArguments = [W_NATIVE_TOKEN_ADDRESS, NATIVE_CURRENCY_SYMBOL, TOKEN_RATIO_SORT_DATA];
  const NonfungibleTokenPositionDescriptorFactory = await hre.ethers.getContractFactory(CONTRACT_NAME, {
    libraries: {
      NFTDescriptor: deploysData.NFTDescriptor,
    },
  });

  const NonfungibleTokenPositionDescriptor = await NonfungibleTokenPositionDescriptorFactory.deploy(
    ...constructorArguments
  );
  await NonfungibleTokenPositionDescriptor.waitForDeployment();

  deploysData.NonfungibleTokenPositionDescriptor = NonfungibleTokenPositionDescriptor.target;
  fs.writeFileSync(deployDataPath, JSON.stringify(deploysData, null, 2), 'utf-8');

  console.log(CONTRACT_NAME + ' deployed to:', NonfungibleTokenPositionDescriptor.target);
  console.log('Saved address to:', deployDataPath);

  await hre.run('verify:verify', {
    address: NonfungibleTokenPositionDescriptor.target,
    constructorArguments,
    contract: 'contracts/NonfungibleTokenPositionDescriptor.sol:NonfungibleTokenPositionDescriptor',
    libraries: {
      NFTDescriptor: deploysData.NFTDescriptor,
    },
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
