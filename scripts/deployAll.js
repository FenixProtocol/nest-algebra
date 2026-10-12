const { execFileSync } = require('child_process');
const path = require('path');

const network = process.argv[2];

if (!network) {
  throw new Error('Network name is required: node scripts/deployAll.js <network>');
}

const packageNames = ['core', 'plugin', 'periphery', 'farming'];
const packagesToDeploy = network === 'elysium_testnet' ? packageNames.filter((packageName) => packageName !== 'farming') : packageNames;

for (const packageName of packagesToDeploy) {
  execFileSync('npx', ['hardhat', 'run', '--network', network, 'scripts/deploy.js'], {
    cwd: path.resolve(__dirname, `../src/${packageName}`),
    stdio: 'inherit',
  });
}
