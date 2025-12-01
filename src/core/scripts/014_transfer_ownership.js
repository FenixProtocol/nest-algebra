const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../../../scripts/networksConfig');
const PLUGIN_FACTORY_ARTIFACT = require('./BasePluginV1Factory.sol/BasePluginV1Factory.json');
const NEW_PLUGIN_ARTIFACT = require('./AlgebraDefaultPlugin.sol/AlgebraDefaultPlugin.json');
const OLD_PLUGIN_ARTIFACT = require('./AlgebraBasePluginV1.sol/AlgebraBasePluginV1.json');


async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  let Config = getConfig(chainId);
  const deployDataPath = path.resolve(__dirname, '../../../' + Config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  let TARGET_OWNERSHIP = "0x6652173b0Cb3d96d8f0198bc49670440Dec69e79";
  let OLD_OWNERSHIP = "0x5339E2BB6d07bc0E82D56E99FA669256c9596A4F";

  const ProxyAdmin = await hre.ethers.getContractAt("ProxyAdmin", deploysData.proxyAdmin)
  const AlgebraFactory = await hre.ethers.getContractAt('AlgebraFactoryUpgradeable', deploysData.factory);
  
  let tx = await ProxyAdmin.transferOwnership(TARGET_OWNERSHIP);
  await tx.wait();

  tx = await AlgebraFactory.grantRole(await AlgebraFactory.POOLS_ADMINISTRATOR_ROLE(), OLD_OWNERSHIP);
  await tx.wait();

  tx = await AlgebraFactory.grantRole(hre.ethers.id("ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR"), OLD_OWNERSHIP);
  await tx.wait();

  tx = await AlgebraFactory.grantRole(hre.ethers.id("ALGEBRA_BASE_PLUGIN_MANAGER"), OLD_OWNERSHIP);
  await tx.wait();
  
  tx = await AlgebraFactory.grantRole(hre.ethers.id("ALGEBRA_BASE_PLUGIN_MANAGER"), OLD_OWNERSHIP);
  await tx.wait();

  tx =  await AlgebraFactory.transferOwnership(TARGET_OWNERSHIP);
  await tx.wait();

  let ROLES = [
    ["DEFAULT_ADMIN_ROLE", hre.ethers.ZeroHash],
    ["GUARD", hre.ethers.id("GUARD")],
    ["ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR", hre.ethers.id("ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR")],
    ["ALGEBRA_BASE_PLUGIN_MANAGER", hre.ethers.id("ALGEBRA_BASE_PLUGIN_MANAGER")],
    ["POOLS_ADMINISTRATOR_ROLE", hre.ethers.id("POOLS_ADMINISTRATOR")],
    ["POOLS_CREATOR_ROLE", "0xa7106ea771a74f2d048c62cace8c00d3e120b24b61327e6415035f60d47ce888"],
  ]

  for await (const [roleName, roleHash] of ROLES) {
    console.log(`${roleName}: ${await AlgebraFactory.hasRole(roleHash, OLD_OWNERSHIP)}`)
  }
}  


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
