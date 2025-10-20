pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DAOPredictMarketFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchNotOpen();
    error BatchClosedOrDoesNotExist();
    error InvalidArgument();
    error ReplayDetected();
    error StateMismatch();
    error DecryptionFailed();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event CooldownSecondsSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event PausedSet(bool paused);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event PredictionSubmitted(address indexed user, uint256 indexed batchId, uint256 encryptedPrediction);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalYes, uint256 totalNo);

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    mapping(uint256 => bool) public isBatchOpen;
    mapping(uint256 => euint32) public encryptedYesCounts;
    mapping(uint256 => euint32) public encryptedNoCounts;
    mapping(uint256 => uint256) public submissionsInBatch;
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    address public owner;
    bool public paused;
    uint256 public cooldownSeconds;
    uint256 public nextBatchId = 1;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier respectCooldown(address user, mapping(address => uint256) storage lastActionTime) {
        if (block.timestamp < lastActionTime[user] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        cooldownSeconds = 60; // Default cooldown: 60 seconds
    }

    function addProvider(address provider) external onlyOwner {
        if (provider == address(0)) revert InvalidArgument();
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) revert InvalidArgument();
        delete isProvider[provider];
        emit ProviderRemoved(provider);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        uint256 oldCooldownSeconds = cooldownSeconds;
        if (newCooldownSeconds == oldCooldownSeconds) revert InvalidArgument();
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(oldCooldownSeconds, newCooldownSeconds);
    }

    function setPaused(bool shouldPause) external onlyOwner {
        if (paused == shouldPause) revert InvalidArgument();
        paused = shouldPause;
        emit PausedSet(shouldPause);
    }

    function openBatch() external onlyOwner whenNotPaused {
        uint256 currentBatchId = nextBatchId;
        if (isBatchOpen[currentBatchId]) revert InvalidArgument(); // Should not happen with nextBatchId logic

        isBatchOpen[currentBatchId] = true;
        submissionsInBatch[currentBatchId] = 0;
        // FHE types are initialized on first use, no explicit initialization needed here for encryptedYesCounts/NoCounts

        nextBatchId++;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner {
        if (!isBatchOpen[batchId]) revert BatchNotOpen();
        isBatchOpen[batchId] = false;
        emit BatchClosed(batchId);
    }

    function submitPrediction(uint256 batchId, euint32 encryptedPrediction)
        external
        onlyProvider
        whenNotPaused
        respectCooldown(msg.sender, lastSubmissionTime)
    {
        if (!isBatchOpen[batchId]) revert BatchClosedOrDoesNotExist();
        if (!encryptedPrediction.isInitialized()) revert InvalidArgument();

        // Initialize encrypted counters if this is the first submission for the batch
        _initIfNeeded(encryptedYesCounts[batchId]);
        _initIfNeeded(encryptedNoCounts[batchId]);

        // For simplicity, prediction 1 means YES, 0 means NO.
        // A real system might have more complex prediction encoding.
        ebool isYesVote = encryptedPrediction.ge(FHE.asEuint32(1));

        // Aggregate votes
        encryptedYesCounts[batchId] = encryptedYesCounts[batchId].add(isYesVote.select(FHE.asEuint32(1), FHE.asEuint32(0)));
        encryptedNoCounts[batchId] = encryptedNoCounts[batchId].add(isYesVote.select(FHE.asEuint32(0), FHE.asEuint32(1)));
        
        submissionsInBatch[batchId]++;
        lastSubmissionTime[msg.sender] = block.timestamp;
        emit PredictionSubmitted(msg.sender, batchId, encryptedPrediction.toBytes32());
    }

    function requestBatchResultDecryption(uint256 batchId)
        external
        onlyProvider
        whenNotPaused
        respectCooldown(msg.sender, lastDecryptionRequestTime)
    {
        if (isBatchOpen[batchId]) revert BatchNotOpen(); // Batch must be closed
        if (submissionsInBatch[batchId] == 0) revert InvalidArgument(); // Nothing to decrypt

        euint32 finalEncryptedYesCount = encryptedYesCounts[batchId];
        euint32 finalEncryptedNoCount = encryptedNoCounts[batchId];

        if (!finalEncryptedYesCount.isInitialized() || !finalEncryptedNoCount.isInitialized()) {
            revert InvalidArgument(); // Should have been initialized if submissions > 0
        }
        
        bytes32[] memory cts = new bytes32[](2);
        cts[0] = finalEncryptedYesCount.toBytes32();
        cts[1] = finalEncryptedNoCount.toBytes32();

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        DecryptionContext storage ctx = decryptionContexts[requestId];

        // Replay Guard
        if (ctx.processed) revert ReplayDetected();

        // State Verification: Rebuild ciphertexts from current storage and verify hash
        // This ensures that the contract state relevant to this decryption request hasn't changed
        // since the request was made.
        euint32 currentEncryptedYesCount = encryptedYesCounts[ctx.batchId];
        euint32 currentEncryptedNoCount = encryptedNoCounts[ctx.batchId];

        if (!currentEncryptedYesCount.isInitialized() || !currentEncryptedNoCount.isInitialized()) {
            revert StateMismatch(); // Should not happen if batch had submissions
        }

        bytes32[] memory currentCts = new bytes32[](2);
        currentCts[0] = currentEncryptedYesCount.toBytes32();
        currentCts[1] = currentEncryptedNoCount.toBytes32();
        
        bytes32 currentStateHash = _hashCiphertexts(currentCts);
        if (currentStateHash != ctx.stateHash) {
            revert StateMismatch();
        }

        // Proof Verification
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert DecryptionFailed();
        }

        // Decode & Finalize
        // cleartexts is abi.encodePacked(clearYesCount, clearNoCount)
        // Each uin32 is 4 bytes.
        uint256 totalYes = uint256(uint32(bytes4(cleartexts)));
        uint256 totalNo = uint256(uint32(bytes4(cleartexts[4:])));

        ctx.processed = true;
        emit DecryptionCompleted(requestId, ctx.batchId, totalYes, totalNo);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 storage x) internal {
        if (!x.isInitialized()) {
            x = FHE.asEuint32(0);
        }
    }

    // No _requireInitialized needed as isInitialized() checks are done before use.
}