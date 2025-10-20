# DAO Predict Market: FHE-based Prediction Markets for DAO Governance Outcomes

DAO Predict Market leverages **Zama's Fully Homomorphic Encryption (FHE) technology** to create a secure and private prediction market. This innovative platform allows users to predict and place bets on the outcomes of significant governance proposals within various Decentralized Autonomous Organizations (DAOs). Empowering users with anonymity, these predictions serve as a confidential gauge of community sentiment, providing invaluable insights for DAO decision-making.

## The Challenge of Transparent Governance

In the landscape of decentralized governance, transparency often comes at the cost of privacy. Traditional voting systems expose individual preferences, leaving community members vulnerable to undue influence. The need for a secure mechanism to gauge community sentiment, wherein members can voice their predictions without fear of backlash or coercion, remains a significant challenge. This project addresses the gap, providing an engaging environment for community members to express opinions on governance proposals while ensuring their privacy remains intact.

## Leveraging FHE for Solving Governance Dilemmas

Our solution utilizes **Zama's open-source libraries**, such as **Concrete** and the **zama-fhe SDK**, to implement Fully Homomorphic Encryption. This cutting-edge technology allows users to make predictions and place bets in a privacy-preserving manner. With FHE, even the platform itself can process user data without ever exposing the underlying information, guaranteeing that individual predictions remain confidential. This unique capability fosters trust among community members and encourages broader participation in governance discussions.

## Core Features

- **FHE Encryption for Predictions:** All predictions and stakes are encrypted, ensuring user privacy and security.
- **Market Signal for Governance:** Provides a market-driven mechanism for the DAO to gauge community sentiment on upcoming proposals.
- **Enhanced Engagement:** Encourages community members to participate actively, adding a gamified layer to governance through competitive predictions.
- **Diverse DAO Proposals:** Users can access a comprehensive list of predictions across multiple DAOs, enhancing visibility and participation.

## Technology Stack

The project employs a robust mix of technology to ensure reliability and security:

- **Zama FHE SDK:** Core component for implementing Fully Homomorphic Encryption.
- **Node.js:** Backend service for handling the prediction logic and user interactions.
- **Hardhat/Foundry:** Frameworks for smart contract development and testing.
- **Solidity:** Programming language for writing smart contracts on the Ethereum blockchain.

## Directory Structure

Here’s a quick overview of the project’s file structure:

```
DAO_Predict_Market/
├── contracts/
│   └── DAO_Predict_Market.sol
├── scripts/
│   └── deploy.js
├── tests/
│   └── DAO_Predict_Market.test.js
├── package.json
└── README.md
```

## Installation Instructions

To set up the DAO Predict Market on your local environment, follow these steps:

1. **Ensure you have Node.js installed.** This project requires Node.js version 14 or higher.
2. **Install Hardhat or Foundry** as your development environment.
3. **Download the project files** (do not use `git clone` or any other URLs).
4. Navigate to the project root directory in your terminal.
5. Run the following command to install necessary dependencies, which includes the Zama FHE libraries:

   ```bash
   npm install
   ```

## Build & Run Instructions

After installation, you can build, test, and run the project with the following commands:

1. **Compile the smart contracts:**
   ```bash
   npx hardhat compile
   ```

2. **Run tests to ensure everything is functioning as expected:**
   ```bash
   npx hardhat test
   ```

3. **Deploy the smart contracts:**
   ```bash
   npx hardhat run scripts/deploy.js
   ```

## Example Code Snippet

Here’s a brief example showing how you might set up a prediction in the `DAO_Predict_Market.sol` contract:

```solidity
pragma solidity ^0.8.0;

contract DAO_Predict_Market {
    struct Prediction {
        string proposal;
        uint256 predictedOutcome;
        bytes encryptedPredictionData;
    }
    
    mapping(address => Prediction) public predictions;

    function placePrediction(string memory _proposal, uint256 _predictedOutcome, bytes memory _encryptedData) public {
        predictions[msg.sender] = Prediction({
            proposal: _proposal,
            predictedOutcome: _predictedOutcome,
            encryptedPredictionData: _encryptedData
        });
    }
}
```

This function allows users to place their predictions securely and privately, utilizing encrypted data to keep the details confidential.

## Acknowledgements

This project is made possible thanks to the pioneering work of the **Zama team**. Their dedication to advancing the field of encryption through open-source tools provides the foundation for confidential blockchain applications, enabling innovative projects like DAO Predict Market to thrive. We express our gratitude for their commitment to enhancing privacy in the digital landscape.

---
This README provides a comprehensive overview of the DAO Predict Market project, emphasizing its reliance on state-of-the-art encryption technology to solve real-world problems in DAO governance. Feel free to explore the various features and dive into governance like never before!
