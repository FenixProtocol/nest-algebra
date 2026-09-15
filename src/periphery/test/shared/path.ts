import { getAddress, ZeroAddress } from 'ethers';

const ADDR_SIZE = 20;
const NEXT_OFFSET = ADDR_SIZE * 2;
const DATA_SIZE = NEXT_OFFSET + ADDR_SIZE;

export function encodePath(path: string[]): string {
  return encodeRoutePath(path, new Array(path.length - 1).fill(ZeroAddress));
}

export function encodeLegacyPath(path: string[]): string {
  let encoded = '0x';
  for (let i = 0; i < path.length; i++) {
    // 20 byte encoding of the address
    encoded += path[i].slice(2);
  }

  return encoded.toLowerCase();
}

export function encodeRoutePath(tokens: string[], deployers: string[]): string {
  if (tokens.length !== deployers.length + 1) throw new Error('Invalid route');

  let encoded = '0x';
  for (let i = 0; i < deployers.length; i++) {
    encoded += tokens[i].slice(2);
    encoded += deployers[i].slice(2);
  }
  encoded += tokens[tokens.length - 1].slice(2);

  return encoded.toLowerCase();
}

function decodeOne(tokenFeeToken: Buffer): [[string, string]] {
  // reads the first 20 bytes for the token address
  const tokenABuf = tokenFeeToken.slice(0, ADDR_SIZE);
  const tokenA = getAddress('0x' + tokenABuf.toString('hex'));

  // skips the pool deployer and reads the next 20 bytes for the token address
  const tokenBBuf = tokenFeeToken.slice(NEXT_OFFSET, DATA_SIZE);
  const tokenB = getAddress('0x' + tokenBBuf.toString('hex'));

  return [[tokenA, tokenB]];
}

export function decodePath(path: string): [string[]] {
  let data = Buffer.from(path.slice(2), 'hex');

  let tokens: string[] = [];
  let finalToken: string = '';
  while (data.length >= DATA_SIZE) {
    const [[tokenA, tokenB]] = decodeOne(data);
    finalToken = tokenB;
    tokens = [...tokens, tokenA];
    data = data.slice(NEXT_OFFSET);
  }
  tokens = [...tokens, finalToken];

  return [tokens];
}
