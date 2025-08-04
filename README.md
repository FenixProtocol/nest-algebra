
# Nest Algebra

Welcome to **Nest Algebra**

### Links
- [Nest ve(3,3) Core](https://github.com/FenixProtocol/nest-core)
- [Algebra docs](https://docs.algebra.finance/)

### List of projects on which Nest dex v3 is based:
- [Algebra](https://github.com/cryptoalgebra/Algebra/)
- [Fenix](https://github.com/FenixProtocol/fenix-algebra/)


## Setup

### Getting the code
Clone this repository
```sh
git clone  https://github.com/FenixProtocol/nest-algebra
```


Enter into the directory
```sh
cd nest-algebra
```

### Build

*Requires npm >= 8.0.0*

To install dependencies, you need to run the command in the root directory:
```
$ npm run bootstrap
```
This will download and install dependencies for all modules and set up husky hooks.



To compile a specific module, you need to run the following command in the module folder:
```
$ npm run compile
```


### Tests

Tests for a specific module are run by the following command in the module folder:
```
$ npm run test
```

### Tests coverage

To get a test coverage for specific module, you need to run the following command in the module folder:

```
$ npm run coverage
```

### Deploy
Firstly you need to create `.env` file in the root directory of project as in `env.example`.

To deploy all modules in specific network:
```
$ node scripts/deployAll.js <network>
```
