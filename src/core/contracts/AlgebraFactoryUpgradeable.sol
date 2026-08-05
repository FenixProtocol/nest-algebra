// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './libraries/Constants.sol';

import './interfaces/IAlgebraFactory.sol';
import './interfaces/IAlgebraPoolDeployer.sol';

import './interfaces/vault/IAlgebraVaultFactory.sol';
import './interfaces/plugin/IAlgebraPluginFactory.sol';

import './AlgebraCommunityVault.sol';
import '@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol';

/// @title Algebra factory
/// @notice Is used to deploy pools and its plugins
/// @dev Version: Algebra Integral 1.0
contract AlgebraFactoryUpgradeable is IAlgebraFactory, Ownable2StepUpgradeable, AccessControlEnumerableUpgradeable {
  /// @inheritdoc IAlgebraFactory
  bytes32 public constant override POOLS_ADMINISTRATOR_ROLE = keccak256('POOLS_ADMINISTRATOR'); // it`s here for the public visibility of the value

  /// @inheritdoc IAlgebraFactory
  bytes32 public constant override POOLS_CREATOR_ROLE = keccak256('POOLS_CREATOR'); // it`s here for the public visibility of the value

  /// @inheritdoc IAlgebraFactory
  bytes32 public constant override CUSTOM_POOL_DEPLOYER = keccak256('CUSTOM_POOL_DEPLOYER');

  /// @inheritdoc IAlgebraFactory
  /// @dev keccak256 of AlgebraPool init bytecode. Used to compute pool address deterministically
  bytes32 public constant override POOL_INIT_CODE_HASH = 0xe4894f29e2491e531db85584561de8b8869774d41313c860cf4089d80a51d8a4;

  /// @inheritdoc IAlgebraFactory
  address public override poolDeployer;

  ///@inheritdoc IAlgebraFactory
  bool public override isPublicPoolCreationMode;

  /// @inheritdoc IAlgebraFactory
  uint16 public override defaultCommunityFee;

  /// @inheritdoc IAlgebraFactory
  uint16 public override defaultFee;

  /// @inheritdoc IAlgebraFactory
  int24 public override defaultTickspacing;

  /// @inheritdoc IAlgebraFactory
  uint256 public override renounceOwnershipStartTimestamp;

  /// @inheritdoc IAlgebraFactory
  IAlgebraPluginFactory public override defaultPluginFactory;

  /// @inheritdoc IAlgebraFactory
  IAlgebraVaultFactory public override vaultFactory;

  /// @inheritdoc IAlgebraFactory
  mapping(address => mapping(address => address)) public override poolByPair;

  /// @inheritdoc IAlgebraFactory
  mapping(address => mapping(address => mapping(address => address))) public override customPoolByPair;

  /// @inheritdoc IAlgebraFactory
  mapping(address => address) public override deployerByPool;

  /// @dev time delay before ownership renouncement can be finished
  uint256 private constant RENOUNCE_OWNERSHIP_DELAY = 1 days;

  /**
   * @dev Initializes the contract by disabling the initializer of the inherited upgradeable contract.
   */
  constructor() {
    _disableInitializers();
  }

  function initialize(address _poolDeployer) external initializer {
    require(_poolDeployer != address(0));

    __AccessControlEnumerable_init();
    __Ownable2Step_init();

    poolDeployer = _poolDeployer;
    defaultTickspacing = Constants.INIT_DEFAULT_TICK_SPACING;
    defaultFee = Constants.INIT_DEFAULT_FEE;

    _grantRole(POOLS_CREATOR_ROLE, msg.sender);

    emit DefaultTickspacing(Constants.INIT_DEFAULT_TICK_SPACING);
    emit DefaultFee(Constants.INIT_DEFAULT_FEE);
  }

  /// @notice Updates the pool deployer after upgrading an existing factory proxy.
  /// @param newPoolDeployer The new pool deployer instance
  function setPoolDeployer(address newPoolDeployer) external reinitializer(2) onlyOwner {
    require(newPoolDeployer != address(0));
    poolDeployer = newPoolDeployer;
    emit PoolDeployer(newPoolDeployer);
  }

  /// @inheritdoc IAlgebraFactory
  function owner() public view override(IAlgebraFactory, OwnableUpgradeable) returns (address) {
    return super.owner();
  }

  /// @inheritdoc IAlgebraFactory
  function hasRoleOrOwner(bytes32 role, address account) public view override returns (bool) {
    return (owner() == account || super.hasRole(role, account));
  }

  /// @inheritdoc IAlgebraFactory
  function defaultConfigurationForPool(
    address pool
  ) external view override returns (uint16 communityFee, int24 tickSpacing, uint16 fee, address communityVault) {
    if (address(vaultFactory) != address(0)) {
      communityVault = vaultFactory.getVaultForPool(pool);
    }
    return (defaultCommunityFee, defaultTickspacing, defaultFee, communityVault);
  }

  /// @inheritdoc IAlgebraFactory
  function computePoolAddress(address token0, address token1) public view override returns (address pool) {
    pool = address(uint160(uint256(keccak256(abi.encodePacked(hex'ff', poolDeployer, keccak256(abi.encode(token0, token1)), POOL_INIT_CODE_HASH)))));
  }

  /// @inheritdoc IAlgebraFactory
  function computeCustomPoolAddress(address customDeployer, address token0, address token1) public view override returns (address customPool) {
    customPool = address(
      uint160(uint256(keccak256(abi.encodePacked(hex'ff', poolDeployer, keccak256(abi.encode(customDeployer, token0, token1)), POOL_INIT_CODE_HASH))))
    );
  }

  /// @inheritdoc IAlgebraFactory
  function createPool(address tokenA, address tokenB) external override returns (address pool) {
    if (!isPublicPoolCreationMode) {
      _checkRole(POOLS_CREATOR_ROLE);
    }
    require(tokenA != tokenB);
    (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    require(token0 != address(0));
    require(poolByPair[token0][token1] == address(0));

    address defaultPlugin;
    if (address(defaultPluginFactory) != address(0)) {
      defaultPlugin = defaultPluginFactory.createPlugin(computePoolAddress(token0, token1), token0, token1);
    }
    pool = IAlgebraPoolDeployer(poolDeployer).deploy(defaultPlugin, token0, token1, address(0));

    poolByPair[token0][token1] = pool; // to avoid future addresses comparison we are populating the mapping twice
    poolByPair[token1][token0] = pool;
    emit Pool(token0, token1, pool);

    if (address(vaultFactory) != address(0)) {
      vaultFactory.createVaultForPool(pool);
    }
  }

  /// @inheritdoc IAlgebraFactory
  function createCustomPool(
    address customDeployer,
    address creator,
    address tokenA,
    address tokenB,
    bytes calldata data
  ) external override returns (address customPool) {
    require(hasRole(CUSTOM_POOL_DEPLOYER, msg.sender), 'Can`t create custom pools');
    require(customDeployer != address(0));
    require(tokenA != tokenB);
    (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    require(token0 != address(0));
    require(customPoolByPair[customDeployer][token0][token1] == address(0));

    address plugin = IAlgebraPluginFactory(msg.sender).beforeCreatePoolHook(
      computeCustomPoolAddress(customDeployer, token0, token1),
      creator,
      customDeployer,
      token0,
      token1,
      data
    );

    customPool = IAlgebraPoolDeployer(poolDeployer).deploy(plugin, token0, token1, customDeployer);

    IAlgebraPluginFactory(msg.sender).afterCreatePoolHook(plugin, customPool, customDeployer);

    customPoolByPair[customDeployer][token0][token1] = customPool;
    customPoolByPair[customDeployer][token1][token0] = customPool;
    deployerByPool[customPool] = customDeployer;
    emit CustomPool(customDeployer, token0, token1, customPool);

    if (address(vaultFactory) != address(0)) {
      vaultFactory.createVaultForPool(customPool);
    }
  }

  /// @inheritdoc IAlgebraFactory
  function setIsPublicPoolCreationMode(bool mode_) external override onlyOwner {
    isPublicPoolCreationMode = mode_;
    emit PublicPoolCreationMode(mode_);
  }

  /// @inheritdoc IAlgebraFactory
  function setDefaultCommunityFee(uint16 newDefaultCommunityFee) external override onlyOwner {
    require(newDefaultCommunityFee <= Constants.MAX_COMMUNITY_FEE);
    require(defaultCommunityFee != newDefaultCommunityFee);
    if (newDefaultCommunityFee != 0) require(address(vaultFactory) != address(0));
    defaultCommunityFee = newDefaultCommunityFee;
    emit DefaultCommunityFee(newDefaultCommunityFee);
  }

  /// @inheritdoc IAlgebraFactory
  function setDefaultFee(uint16 newDefaultFee) external override onlyOwner {
    require(newDefaultFee <= Constants.MAX_DEFAULT_FEE);
    require(defaultFee != newDefaultFee);
    defaultFee = newDefaultFee;
    emit DefaultFee(newDefaultFee);
  }

  /// @inheritdoc IAlgebraFactory
  function setDefaultTickspacing(int24 newDefaultTickspacing) external override onlyOwner {
    require(newDefaultTickspacing >= Constants.MIN_TICK_SPACING);
    require(newDefaultTickspacing <= Constants.MAX_TICK_SPACING);
    require(newDefaultTickspacing != defaultTickspacing);
    defaultTickspacing = newDefaultTickspacing;
    emit DefaultTickspacing(newDefaultTickspacing);
  }

  /// @inheritdoc IAlgebraFactory
  function setDefaultPluginFactory(address newDefaultPluginFactory) external override onlyOwner {
    require(newDefaultPluginFactory != address(defaultPluginFactory));
    defaultPluginFactory = IAlgebraPluginFactory(newDefaultPluginFactory);
    emit DefaultPluginFactory(newDefaultPluginFactory);
  }

  /// @inheritdoc IAlgebraFactory
  function setVaultFactory(address newVaultFactory) external override onlyOwner {
    require(newVaultFactory != address(vaultFactory));
    if (newVaultFactory == address(0)) require(defaultCommunityFee == 0);
    vaultFactory = IAlgebraVaultFactory(newVaultFactory);
    emit VaultFactory(newVaultFactory);
  }

  /// @inheritdoc IAlgebraFactory
  function startRenounceOwnership() external override onlyOwner {
    require(renounceOwnershipStartTimestamp == 0);
    renounceOwnershipStartTimestamp = block.timestamp;
    emit RenounceOwnershipStart(renounceOwnershipStartTimestamp, renounceOwnershipStartTimestamp + RENOUNCE_OWNERSHIP_DELAY);
  }

  /// @inheritdoc IAlgebraFactory
  function stopRenounceOwnership() external override onlyOwner {
    require(renounceOwnershipStartTimestamp != 0);
    renounceOwnershipStartTimestamp = 0;
    emit RenounceOwnershipStop(block.timestamp);
  }

  /// @dev Leaves the contract without owner. It will not be possible to call `onlyOwner` functions anymore.
  /// Can only be called by the current owner if RENOUNCE_OWNERSHIP_DELAY seconds
  /// have passed since the call to the startRenounceOwnership() function.
  function renounceOwnership() public override onlyOwner {
    require(renounceOwnershipStartTimestamp != 0);
    require(block.timestamp - renounceOwnershipStartTimestamp >= RENOUNCE_OWNERSHIP_DELAY);
    renounceOwnershipStartTimestamp = 0;

    super.renounceOwnership();
    emit RenounceOwnershipFinish(block.timestamp);
  }

  /// @dev Transfers ownership of the contract to a new account (`newOwner`).
  /// Modified to fit with the role mechanism.
  function _transferOwnership(address newOwner) internal override {
    _revokeRole(DEFAULT_ADMIN_ROLE, owner());
    super._transferOwnership(newOwner);
    if (owner() != address(0)) {
      _grantRole(DEFAULT_ADMIN_ROLE, owner());
    }
  }

  /**
   * @dev This empty reserved space is put in place to allow future versions to add new
   * variables without shifting down storage in the inheritance chain.
   * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
   */
  uint256[48] private __gap;
}
