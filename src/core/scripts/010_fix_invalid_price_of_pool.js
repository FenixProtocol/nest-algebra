const hre = require('hardhat');
const fs = require('fs');
const path = require('path');
const NonfungiblePositionManagerAr = require('./NonfungiblePositionManager.sol/NonfungiblePositionManager.json');

const { getConfig } = require('../../../scripts/networksConfig');
const { type } = require('os');
async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  let Config = getConfig(chainId);

  const deployDataPath = path.resolve(__dirname, '../../../' + Config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  let WHYPE = "0x5555555555555555555555555555555555555555";
  let kHYPE = "0xfD739d4e423301CE9385c1fb8850539D657C296D";
  let USDH = "0x111111a1a0667d36bD57c0A9f569b98057111111";
  let KNTQ = "0x000000000000780555bD0BCA3791f89f9542c2d6";

  const NonfungiblePositionManager = await hre.ethers.getContractAtFromArtifact(NonfungiblePositionManagerAr, "0xEAF58788a405F3253814b4559391a22bE8616250");

  await NonfungiblePositionManager.mint({
        token0: KNTQ,
        token1: WHYPE,
        tickLower: -52650,
        tickUpper: -52600,
        amount0Desired: hre.ethers.parseEther('20'),
        amount1Desired: hre.ethers.parseEther('0.15'),
        amount0Min: 0,
        amount1Min: 1,
        recipient: "0x5339E2BB6d07bc0E82D56E99FA669256c9596A4F",
        deadline: 1784248389
  }, {value: hre.ethers.parseEther('0.15')});
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
