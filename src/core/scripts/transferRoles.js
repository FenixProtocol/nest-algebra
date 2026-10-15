const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../../../scripts/networksConfig');

// Wallet that receives every applicable role and the AlgebraFactory ownership.
const ROLE_RECEIVER = '0x4F44dAdBA9AB92374DED8afEE140ebf7EB16766F';

const ACCESS_CONTROL_ABI = [
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function owner() view returns (address)',
  'function pendingOwner() view returns (address)',
  'function transferOwnership(address newOwner)',
];

const ELYSIUM_ROLES = [
  {
    name: 'DEFAULT_ADMIN_ROLE',
    value: hre.ethers.ZeroHash,
    requiredDeployment: 'factory',
  },
  {
    name: 'POOLS_ADMINISTRATOR_ROLE',
    value: hre.ethers.id('POOLS_ADMINISTRATOR'),
    requiredDeployment: 'factory',
  },
  {
    name: 'POOLS_CREATOR_ROLE',
    value: hre.ethers.id('POOLS_CREATOR'),
    requiredDeployment: 'factory',
  },
  {
    name: 'COMMUNITY_FEE_WITHDRAWER_ROLE',
    value: hre.ethers.id('COMMUNITY_FEE_WITHDRAWER'),
    requiredDeployment: 'vault',
  },
  {
    name: 'COMMUNITY_FEE_VAULT_ADMINISTRATOR',
    value: hre.ethers.id('COMMUNITY_FEE_VAULT_ADMINISTRATOR'),
    requiredDeployment: 'vault',
  },
  {
    name: 'ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR',
    value: hre.ethers.id('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR'),
    requiredDeployment: 'BasePluginV1Factory',
  },
  {
    name: 'ALGEBRA_BASE_PLUGIN_MANAGER',
    value: hre.ethers.id('ALGEBRA_BASE_PLUGIN_MANAGER'),
    requiredDeployment: 'AlgebraBasePluginV1',
  },
  {
    name: 'NONFUNGIBLE_POSITION_MANAGER_ADMINISTRATOR_ROLE',
    value: hre.ethers.id('NONFUNGIBLE_POSITION_MANAGER_ADMINISTRATOR_ROLE'),
    requiredDeployment: 'nonfungiblePositionManager',
  },
];

async function getDeployedContracts(deploysData) {
  const keys = new Set(['factory', 'proxyAdmin', ...ELYSIUM_ROLES.map(({ requiredDeployment }) => requiredDeployment)]);
  const deployedContracts = new Map();

  for (const key of keys) {
    const address = deploysData[key];
    if (!address) continue;
    if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
      throw new Error(`Invalid ${key} address in deployment file: ${address}`);
    }

    if ((await hre.ethers.provider.getCode(address)) === '0x') {
      console.log(`Skipping ${key}: no contract at ${address}`);
      continue;
    }

    deployedContracts.set(key, hre.ethers.getAddress(address));
  }

  return deployedContracts;
}

async function main() {
  const receiver = hre.ethers.getAddress(ROLE_RECEIVER);
  const { chainId } = await hre.ethers.provider.getNetwork();
  const config = getConfig(chainId);
  const deployDataPath = path.resolve(__dirname, '../../../', config.FILE);

  if (!fs.existsSync(deployDataPath)) {
    console.log(`No deployment file found for chain ${chainId}: ${deployDataPath}`);
    return;
  }

  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));
  const deployedContracts = await getDeployedContracts(deploysData);
  const factoryAddress = deployedContracts.get('factory');

  if (!factoryAddress) {
    console.log(`No deployed AlgebraFactory found on chain ${chainId}; nothing to do`);
    return;
  }

  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error(`No signer configured for chain ${chainId}`);

  const factory = new hre.ethers.Contract(factoryAddress, ACCESS_CONTROL_ABI, signer);
  const applicableRoles = ELYSIUM_ROLES.filter(({ requiredDeployment }) => deployedContracts.has(requiredDeployment));
  const missingRoles = [];

  for (const role of applicableRoles) {
    if (await factory.hasRole(role.value, receiver)) {
      console.log(`${role.name} is already granted to ${receiver}`);
    } else {
      missingRoles.push(role);
    }
  }

  if (missingRoles.length > 0 && !(await factory.hasRole(hre.ethers.ZeroHash, signer.address))) {
    throw new Error(`Configured signer ${signer.address} does not hold DEFAULT_ADMIN_ROLE on AlgebraFactory ${factoryAddress}`);
  }

  const currentOwner = hre.ethers.getAddress(await factory.owner());
  const pendingOwner = hre.ethers.getAddress(await factory.pendingOwner());
  const ownershipTransferRequired = currentOwner !== receiver && pendingOwner !== receiver;

  if (ownershipTransferRequired && currentOwner !== hre.ethers.getAddress(signer.address)) {
    throw new Error(`Configured signer ${signer.address} is not the AlgebraFactory owner ${currentOwner}`);
  }

  for (const role of missingRoles) {
    const transaction = await factory.grantRole(role.value, receiver);
    await transaction.wait();
    console.log(`Granted ${role.name} to ${receiver}`);
  }

  if (currentOwner === receiver) {
    console.log(`AlgebraFactory ownership already belongs to ${receiver}`);
  } else if (pendingOwner === receiver) {
    console.log(`AlgebraFactory ownership is already pending acceptance by ${receiver}`);
  } else {
    const transaction = await factory.transferOwnership(receiver);
    await transaction.wait();
    console.log(`AlgebraFactory ownership transfer initiated; ${receiver} must call acceptOwnership()`);
  }

  const proxyAdminAddress = deployedContracts.get('proxyAdmin');
  if (proxyAdminAddress) {
    console.log(`ProxyAdmin ownership was not transferred: ${proxyAdminAddress}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
