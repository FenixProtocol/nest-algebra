const hre = require('hardhat');
const fs = require('fs');
const path = require('path');
const PLUGIN_ARTIFACT = require('./AlgebraBasePluginV1.sol/AlgebraBasePluginV1.json');
const bn = require('bignumber.js');
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

const { getConfig } = require('../../../scripts/networksConfig');
const { type } = require('os');
async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  let Config = getConfig(chainId);

  const deployDataPath = path.resolve(__dirname, '../../../' + Config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  let WHYPE = "0x5555555555555555555555555555555555555555";
  let USDC = "0xb88339CB7199b77E23DB6E890353E22632Ba630f";

  const AlgebraFactory = await hre.ethers.getContractAt('AlgebraFactoryUpgradeable', deploysData.factory);

  const pairs = [
    ['WHYPE-USDC', WHYPE, USDC, "427327323148733472195414", 10n],
  ];

  for (const [label, token0, token1, initialPrice, tickSpacing] of pairs) {
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
    let typedPool = await hre.ethers.getContractAt("AlgebraPool", pool);

    let state = await typedPool.globalState();
    if(state.price == 0n) {
        console.log(
          `[${label}] \t call initialize pools initialPrice:${initialPrice} ...`
        )
        let tx =  await typedPool.initialize(initialPrice);
        await tx.wait();
    } else {
        console.log(
          `[${label}] \tPool already initialized, current price: ${state.price}`
        )
    }

    if(await typedPool.tickSpacing() != tickSpacing) {
        console.log(
          `[${label}] \t Tick spacing try setup tickSpacing:${tickSpacing}`
        )
        let tx =  await typedPool.setTickSpacing(tickSpacing);
        await tx.wait();
    } else {
        console.log(
          `[${label}] \ Tick spacing already setuped to: ${tickSpacing}`
        )
    }

    let plugin = await typedPool.plugin();
    let pluginTyped = await hre.ethers.getContractAt(PLUGIN_ARTIFACT.abi, plugin);

    let tx = await pluginTyped.changeFeeConfiguration({
          alpha1: 400,
          alpha2: 600,
          beta1: 200,
          beta2: 5000,
          gamma1: 80,
          gamma2: 1000,
          baseFee: 800,
    });
    await tx.wait();
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
