const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../../../scripts/networksConfig');
async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  let Config = getConfig(chainId);

  const deployDataPath = path.resolve(__dirname, '../../../' + Config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  let WHYPE = "0x5555555555555555555555555555555555555555";
  let USDT0 = "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb";
  let UETH = "0xBe6727B535545C67d5cAa73dEa54865B92CF7907";
  let UBTC = "0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463";
  let kHYPE = "0xfD739d4e423301CE9385c1fb8850539D657C296D";
  let UPUMP = "0x27eC642013bcB3D80CA3706599D3cdA04F6f4452"
  let USDH = "0x111111a1a0667d36bD57c0A9f569b98057111111";
  let USDC = "0xb88339CB7199b77E23DB6E890353E22632Ba630f";

  const AlgebraFactory = await hre.ethers.getContractAt('AlgebraFactoryUpgradeable', deploysData.factory);
  
  
  const pairs = [
    ['WHYPE-USDT0', WHYPE, USDT0],
    ['WHYPE-UETH',  WHYPE, UETH],
    ['WHYPE-UBTC',  WHYPE, UBTC],
    ['WHYPE-UPUMP', WHYPE, UPUMP],
    ['kHYPE-USDH',  kHYPE, USDH],
    ['kHYPE-WHYPE', kHYPE, WHYPE],
    ['WHYPE-USDH',  WHYPE, USDH],
    ['USDH-USDT0',  USDH,  USDT0],
    ['USDH-USDC',   USDH,  USDC],
  ];

  for (const [label, token0, token1] of pairs) {
    const poolCurrentAddr = await AlgebraFactory.poolByPair(token0, token1);

    if (poolCurrentAddr === hre.ethers.ZeroAddress) {
      console.log(`[${label}] Pool does not exist yet. Creating...`);

      const tx = await AlgebraFactory.createPool(token0, token1);
      console.log(`[${label}] createPool tx sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(
        `[${label}] Pool created in block ${receipt.blockNumber} (gas used: ${receipt.gasUsed.toString()})`
      );
    } else {
      console.log(
        `[${label}] Pool already exists at ${poolCurrentAddr}, skipping createPool`
      );
    }

    const pool = await AlgebraFactory.poolByPair(token0, token1);
    console.log(`[${label}] Final pool address: ${pool}`);
    console.log('--------------------------------------------------');
  }

}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
