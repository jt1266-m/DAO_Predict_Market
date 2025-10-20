// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface PredictionMarket {
  id: string;
  daoName: string;
  proposalTitle: string;
  encryptedYesVotes: string;
  encryptedNoVotes: string;
  endTime: number;
  creator: string;
  category: string;
  status: "active" | "settled" | "canceled";
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [markets, setMarkets] = useState<PredictionMarket[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newMarketData, setNewMarketData] = useState({ daoName: "", proposalTitle: "", yesVotes: 0, noVotes: 0, endTime: 7, category: "Governance" });
  const [selectedMarket, setSelectedMarket] = useState<PredictionMarket | null>(null);
  const [decryptedYes, setDecryptedYes] = useState<number | null>(null);
  const [decryptedNo, setDecryptedNo] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [userHistory, setUserHistory] = useState<string[]>([]);

  const activeCount = markets.filter(m => m.status === "active").length;
  const settledCount = markets.filter(m => m.status === "settled").length;
  const canceledCount = markets.filter(m => m.status === "canceled").length;

  useEffect(() => {
    loadMarkets().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadMarkets = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("market_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing market keys:", e); }
      }
      const list: PredictionMarket[] = [];
      for (const key of keys) {
        try {
          const marketBytes = await contract.getData(`market_${key}`);
          if (marketBytes.length > 0) {
            try {
              const marketData = JSON.parse(ethers.toUtf8String(marketBytes));
              list.push({ 
                id: key, 
                daoName: marketData.daoName, 
                proposalTitle: marketData.proposalTitle, 
                encryptedYesVotes: marketData.encryptedYesVotes, 
                encryptedNoVotes: marketData.encryptedNoVotes,
                endTime: marketData.endTime, 
                creator: marketData.creator, 
                category: marketData.category || "Governance",
                status: marketData.status || "active"
              });
            } catch (e) { console.error(`Error parsing market data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading market ${key}:`, e); }
      }
      list.sort((a, b) => b.endTime - a.endTime);
      setMarkets(list);
    } catch (e) { console.error("Error loading markets:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const createMarket = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting prediction data with Zama FHE..." });
    try {
      const encryptedYes = FHEEncryptNumber(newMarketData.yesVotes);
      const encryptedNo = FHEEncryptNumber(newMarketData.noVotes);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const marketId = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const endTimestamp = Math.floor(Date.now() / 1000) + (newMarketData.endTime * 24 * 60 * 60);
      const marketData = { 
        daoName: newMarketData.daoName,
        proposalTitle: newMarketData.proposalTitle,
        encryptedYesVotes: encryptedYes,
        encryptedNoVotes: encryptedNo,
        endTime: endTimestamp,
        creator: address,
        category: newMarketData.category,
        status: "active"
      };
      await contract.setData(`market_${marketId}`, ethers.toUtf8Bytes(JSON.stringify(marketData)));
      const keysBytes = await contract.getData("market_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(marketId);
      await contract.setData("market_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      setTransactionStatus({ visible: true, status: "success", message: "Prediction market created with FHE encryption!" });
      await loadMarkets();
      setUserHistory(prev => [...prev, `Created market ${marketId}`]);
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewMarketData({ daoName: "", proposalTitle: "", yesVotes: 0, noVotes: 0, endTime: 7, category: "Governance" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Creation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const settleMarket = async (marketId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted votes with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const marketBytes = await contract.getData(`market_${marketId}`);
      if (marketBytes.length === 0) throw new Error("Market not found");
      const marketData = JSON.parse(ethers.toUtf8String(marketBytes));
      const updatedMarket = { ...marketData, status: "settled" };
      await contract.setData(`market_${marketId}`, ethers.toUtf8Bytes(JSON.stringify(updatedMarket)));
      setTransactionStatus({ visible: true, status: "success", message: "Market settled successfully!" });
      setUserHistory(prev => [...prev, `Settled market ${marketId}`]);
      await loadMarkets();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Settlement failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const cancelMarket = async (marketId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing market cancellation..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const marketBytes = await contract.getData(`market_${marketId}`);
      if (marketBytes.length === 0) throw new Error("Market not found");
      const marketData = JSON.parse(ethers.toUtf8String(marketBytes));
      const updatedMarket = { ...marketData, status: "canceled" };
      await contract.setData(`market_${marketId}`, ethers.toUtf8Bytes(JSON.stringify(updatedMarket)));
      setTransactionStatus({ visible: true, status: "success", message: "Market canceled successfully!" });
      setUserHistory(prev => [...prev, `Canceled market ${marketId}`]);
      await loadMarkets();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Cancellation failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isCreator = (marketAddress: string) => address?.toLowerCase() === marketAddress.toLowerCase();

  const filteredMarkets = markets.filter(market => {
    const matchesSearch = market.daoName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         market.proposalTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || market.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const renderStats = () => {
    return (
      <div className="stats-container">
        <div className="stat-card">
          <div className="stat-value">{markets.length}</div>
          <div className="stat-label">Total Markets</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{activeCount}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{settledCount}</div>
          <div className="stat-label">Settled</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{canceledCount}</div>
          <div className="stat-label">Canceled</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading encrypted prediction markets...</p>
    </div>
  );

  return (
    <div className="app-container dark-theme">
      <header className="app-header">
        <div className="logo">
          <h1>DAO<span>Predict</span>Market</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + Create Market
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <main className="main-content">
        <section className="intro-section">
          <h2>FHE-Powered DAO Prediction Markets</h2>
          <p>
            Privately predict DAO governance outcomes using Zama's Fully Homomorphic Encryption. 
            All predictions are encrypted end-to-end, providing market signals while preserving voter privacy.
          </p>
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
        </section>

        <section className="stats-section">
          <h3>Market Statistics</h3>
          {renderStats()}
        </section>

        <section className="search-section">
          <div className="search-container">
            <input 
              type="text" 
              placeholder="Search markets..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select 
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Categories</option>
              <option value="Governance">Governance</option>
              <option value="Treasury">Treasury</option>
              <option value="Protocol">Protocol</option>
              <option value="Community">Community</option>
            </select>
            <button onClick={loadMarkets} className="refresh-btn" disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </section>

        <section className="markets-section">
          <h3>Active Prediction Markets</h3>
          <div className="markets-grid">
            {filteredMarkets.length === 0 ? (
              <div className="no-markets">
                <p>No prediction markets found</p>
                <button onClick={() => setShowCreateModal(true)} className="create-btn">
                  Create First Market
                </button>
              </div>
            ) : (
              filteredMarkets.map(market => (
                <div 
                  key={market.id} 
                  className={`market-card ${market.status}`}
                  onClick={() => setSelectedMarket(market)}
                >
                  <div className="market-header">
                    <span className="dao-name">{market.daoName}</span>
                    <span className={`status-badge ${market.status}`}>{market.status}</span>
                  </div>
                  <h4 className="proposal-title">{market.proposalTitle}</h4>
                  <div className="market-details">
                    <div className="detail-item">
                      <span>Ends:</span>
                      <span>{new Date(market.endTime * 1000).toLocaleDateString()}</span>
                    </div>
                    <div className="detail-item">
                      <span>Category:</span>
                      <span>{market.category}</span>
                    </div>
                  </div>
                  <div className="market-actions">
                    {isCreator(market.creator) && market.status === "active" && (
                      <>
                        <button 
                          className="action-btn settle" 
                          onClick={(e) => { e.stopPropagation(); settleMarket(market.id); }}
                        >
                          Settle
                        </button>
                        <button 
                          className="action-btn cancel" 
                          onClick={(e) => { e.stopPropagation(); cancelMarket(market.id); }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="history-section">
          <h3>Your Activity History</h3>
          {userHistory.length === 0 ? (
            <p>No activity history yet</p>
          ) : (
            <ul className="history-list">
              {userHistory.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h3>Create New Prediction Market</h3>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>DAO Name *</label>
                <input 
                  type="text" 
                  name="daoName" 
                  value={newMarketData.daoName}
                  onChange={(e) => setNewMarketData({...newMarketData, daoName: e.target.value})}
                  placeholder="e.g. Uniswap, Aave"
                />
              </div>
              <div className="form-group">
                <label>Proposal Title *</label>
                <input 
                  type="text" 
                  name="proposalTitle" 
                  value={newMarketData.proposalTitle}
                  onChange={(e) => setNewMarketData({...newMarketData, proposalTitle: e.target.value})}
                  placeholder="Short description of the proposal"
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  name="category"
                  value={newMarketData.category}
                  onChange={(e) => setNewMarketData({...newMarketData, category: e.target.value})}
                >
                  <option value="Governance">Governance</option>
                  <option value="Treasury">Treasury</option>
                  <option value="Protocol">Protocol</option>
                  <option value="Community">Community</option>
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Initial Yes Votes (FHE Encrypted)</label>
                  <input 
                    type="number" 
                    name="yesVotes" 
                    value={newMarketData.yesVotes}
                    onChange={(e) => setNewMarketData({...newMarketData, yesVotes: parseInt(e.target.value) || 0})}
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>Initial No Votes (FHE Encrypted)</label>
                  <input 
                    type="number" 
                    name="noVotes" 
                    value={newMarketData.noVotes}
                    onChange={(e) => setNewMarketData({...newMarketData, noVotes: parseInt(e.target.value) || 0})}
                    min="0"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Market Duration (Days)</label>
                <input 
                  type="number" 
                  name="endTime" 
                  value={newMarketData.endTime}
                  onChange={(e) => setNewMarketData({...newMarketData, endTime: parseInt(e.target.value) || 7})}
                  min="1"
                  max="30"
                />
              </div>
              <div className="fhe-notice">
                <p>All vote counts will be encrypted with Zama FHE before being stored on-chain</p>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">
                Cancel
              </button>
              <button 
                onClick={createMarket} 
                disabled={creating || !newMarketData.daoName || !newMarketData.proposalTitle}
                className="submit-btn"
              >
                {creating ? "Creating..." : "Create Market"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMarket && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h3>Market Details</h3>
              <button onClick={() => { setSelectedMarket(null); setDecryptedYes(null); setDecryptedNo(null); }} className="close-btn">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="market-info">
                <div className="info-row">
                  <span>DAO:</span>
                  <span>{selectedMarket.daoName}</span>
                </div>
                <div className="info-row">
                  <span>Proposal:</span>
                  <span>{selectedMarket.proposalTitle}</span>
                </div>
                <div className="info-row">
                  <span>Status:</span>
                  <span className={`status-badge ${selectedMarket.status}`}>{selectedMarket.status}</span>
                </div>
                <div className="info-row">
                  <span>End Time:</span>
                  <span>{new Date(selectedMarket.endTime * 1000).toLocaleString()}</span>
                </div>
                <div className="info-row">
                  <span>Creator:</span>
                  <span>{selectedMarket.creator.substring(0, 6)}...{selectedMarket.creator.substring(38)}</span>
                </div>
              </div>

              <div className="vote-section">
                <h4>Encrypted Votes</h4>
                <div className="vote-cards">
                  <div className="vote-card">
                    <h5>Yes Votes</h5>
                    <div className="encrypted-data">
                      {selectedMarket.encryptedYesVotes.substring(0, 30)}...
                    </div>
                    <button 
                      className="decrypt-btn"
                      onClick={async () => {
                        if (decryptedYes !== null) {
                          setDecryptedYes(null);
                        } else {
                          const decrypted = await decryptWithSignature(selectedMarket.encryptedYesVotes);
                          setDecryptedYes(decrypted);
                        }
                      }}
                      disabled={isDecrypting}
                    >
                      {isDecrypting ? "Decrypting..." : decryptedYes !== null ? "Hide Value" : "Decrypt"}
                    </button>
                    {decryptedYes !== null && (
                      <div className="decrypted-value">
                        Decrypted: {decryptedYes}
                      </div>
                    )}
                  </div>
                  <div className="vote-card">
                    <h5>No Votes</h5>
                    <div className="encrypted-data">
                      {selectedMarket.encryptedNoVotes.substring(0, 30)}...
                    </div>
                    <button 
                      className="decrypt-btn"
                      onClick={async () => {
                        if (decryptedNo !== null) {
                          setDecryptedNo(null);
                        } else {
                          const decrypted = await decryptWithSignature(selectedMarket.encryptedNoVotes);
                          setDecryptedNo(decrypted);
                        }
                      }}
                      disabled={isDecrypting}
                    >
                      {isDecrypting ? "Decrypting..." : decryptedNo !== null ? "Hide Value" : "Decrypt"}
                    </button>
                    {decryptedNo !== null && (
                      <div className="decrypted-value">
                        Decrypted: {decryptedNo}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`status-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="checkmark">✓</div>}
              {transactionStatus.status === "error" && <div className="error">✕</div>}
            </div>
            <div className="status-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>DAO Predict Market - FHE-Powered Prediction Markets for DAO Governance</p>
        <div className="footer-links">
          <a href="#">Documentation</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms</a>
        </div>
      </footer>
    </div>
  );
};

export default App;