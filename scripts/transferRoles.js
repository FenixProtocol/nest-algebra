const { execFileSync } = require('child_process');
const path = require('path');

const network = process.argv[2];

if (!network) {
  throw new Error('Network name is required: node scripts/transferRoles.js <network>');
}

execFileSync('npx', ['hardhat', 'run', '--network', network, 'scripts/transferRoles.js'], {
  cwd: path.resolve(__dirname, '../src/core'),
  stdio: 'inherit',
});
