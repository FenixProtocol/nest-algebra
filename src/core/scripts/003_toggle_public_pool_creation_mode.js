const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../../../scripts/networksConfig');
async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  let Config = getConfig(chainId);

  const deployDataPath = path.resolve(__dirname, '../../../' + Config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  const AlgebraFactory = await hre.ethers.getContractAt('AlgebraFactoryUpgradeable', deploysData.factory);
  await AlgebraFactory.setIsPublicPoolCreationMode(true);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
