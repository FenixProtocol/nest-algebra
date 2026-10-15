const { execFileSync } = require('child_process');
const path = require('path');

const network = process.argv[2];

if (!network) {
  throw new Error('Network name is required: node scripts/verifyAll.js <network>');
}

const packageNames = ['core', 'plugin', 'periphery', 'farming'];
const packagesToVerify = network === 'elysium_testnet' ? packageNames.filter((packageName) => packageName !== 'farming') : packageNames;

for (const packageName of packagesToVerify) {
  execFileSync('npx', ['hardhat', 'run', '--network', network, 'scripts/verify.js'], {
    cwd: path.resolve(__dirname, `../src/${packageName}`),
    stdio: 'inherit',
  });
}
