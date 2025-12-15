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
  let uFART = "0x3B4575E689DEd21CAAD31d64C4df1f10F3B2CedF";
  let uSOL = "0x068f321Fa8Fb9f0D135f290Ef6a3e2813e1c8A29";

  const AlgebraFactory = await hre.ethers.getContractAt('AlgebraFactoryUpgradeable', deploysData.factory);

  const pairs = [
    ['uFART-WHYPE', uFART, WHYPE, "9042931036988395701207425102072594", 5n],
    ['uSOL-WHYPE', uSOL, WHYPE, "5435062781999081203701142377217079", 5n],
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
          alpha1: 800,
          alpha2: 900,
          beta1: 50,
          beta2: 5500,
          gamma1: 25,
          gamma2: 1200,
          baseFee: 1000,
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
