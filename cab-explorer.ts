import "dotenv/config";
import { KERNEL_V3_2, getEntryPoint } from "@zerodev/sdk/constants";
import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-ecdsa-validator";
import {
  formatUnits,
  type Hex,
  createPublicClient,
  http,
  zeroAddress,
} from "viem";
import { createKernelAccount } from "@zerodev/sdk";
import { privateKeyToAccount } from "viem/accounts";
import {
  createIntentClient,
  installIntentExecutor,
  INTENT_V0_3,
} from "@zerodev/intent";
import { 
  polygon, 
  base, 
  optimism, 
  arbitrum, 
  mainnet, 
  bsc 
} from "viem/chains";

// Load environment variables
const privateKeyRaw = process.env.PRIVATE_KEY;
if (!privateKeyRaw) {
  throw new Error("PRIVATE_KEY is not set in .env file");
}

// Ensure the private key has the correct format (0x prefix)
const privateKey = privateKeyRaw.startsWith('0x')
  ? privateKeyRaw as Hex
  : `0x${privateKeyRaw}` as Hex;

// Map chain IDs to human-readable names
const chainNames = {
  [mainnet.id]: "Ethereum Mainnet",
  [polygon.id]: "Polygon",
  [arbitrum.id]: "Arbitrum",
  [optimism.id]: "Optimism",
  [base.id]: "Base",
  [bsc.id]: "Binance Smart Chain",
};

// Get the token decimals for different token types
function getTokenDecimals(ticker: string): number {
  switch (ticker.toUpperCase()) {
    case "USDC":
    case "USDT":
      return 6;
    case "DAI":
      return 18;
    case "ETH":
    case "MATIC":
    case "BNB":
    case "AVAX":
      return 18;
    default:
      return 18;
  }
}

// Customize token display
function formatTokenAmount(amount: string, ticker: string): string {
  const decimals = getTokenDecimals(ticker);
  const formattedAmount = formatUnits(BigInt(amount), decimals);
  // Display in color based on value
  const numAmount = Number(formattedAmount);
  
  if (numAmount === 0) {
    return `${formattedAmount} ${ticker}`;
  } else if (numAmount < 0.01) {
    return `${formattedAmount} ${ticker} (DUST)`;
  } else if (numAmount >= 100) {
    return `${formattedAmount} ${ticker} (SIGNIFICANT)`;
  } else {
    return `${formattedAmount} ${ticker}`;
  }
}

// Main function to explore CAB
async function main() {
  console.log("🌉 ZeroDev Chain Abstracted Balance (CAB) Explorer");
  console.log("=================================================");
  
  // Setup
  const entryPoint = getEntryPoint("0.7");
  const bundlerRpc = "https://rpc.zerodev.app";
  
  const userAccount = privateKeyToAccount(privateKey);
  console.log("🔑 EOA address:", userAccount.address);
  
  // Create a public client for Polygon as our base chain
  const polygonRpcUrl = process.env.POLYGON_RPC_URL;
  if (!polygonRpcUrl) {
    console.warn("⚠️ POLYGON_RPC_URL not set in .env file, using default fallback");
  }
  
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(polygonRpcUrl),
  });
  
  // Create validator
  console.log("🔄 Setting up multi-chain ECDSA validator...");
  const ecdsaValidator = await toMultiChainECDSAValidator(publicClient, {
    signer: userAccount,
    kernelVersion: KERNEL_V3_2,
    entryPoint,
  });
  
  // Create kernel account
  console.log("🔄 Creating kernel account with intent executor...");
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    kernelVersion: KERNEL_V3_2,
    entryPoint,
    initConfig: [installIntentExecutor(INTENT_V0_3)],
  });
  console.log("💼 Smart Account address:", kernelAccount.address);
  
  // Create intent client
  console.log("🔄 Creating intent client...");
  const intentClient = createIntentClient({
    account: kernelAccount,
    chain: polygon,
    bundlerTransport: http(bundlerRpc),
    version: INTENT_V0_3,
  });
  
  // Check CAB across various networks and tokens
  console.log("\n🔍 Scanning for Chain Abstracted Balances across networks...");
  
  // Define networks and tokens to check
  const networks = [mainnet.id, polygon.id, arbitrum.id, optimism.id, base.id, bsc.id];
  const tokenTickers = ["ETH", "USDC", "USDT", "DAI", "MATIC", "BNB"];
  
  try {
    // Get the CAB
    const cab = await intentClient.getCAB({
      networks,
      tokenTickers,
    });
    
    console.log("\n📊 Chain Abstracted Balance (CAB) Results");
    console.log("=======================================");
    
    // Check if we have any tokens
    if (!cab.tokens || cab.tokens.length === 0) {
      console.log("❌ No tokens found across any networks.");
    } else {
      // Display total CAB by token
      console.log("\n🏦 TOTAL UNIFIED BALANCES:");
      const sortedTokens = [...cab.tokens].sort((a, b) => 
        Number(formatUnits(BigInt(b.amount), getTokenDecimals(b.ticker))) - 
        Number(formatUnits(BigInt(a.amount), getTokenDecimals(a.ticker)))
      );
      
      for (const token of sortedTokens) {
        const formattedAmount = formatTokenAmount(token.amount, token.ticker);
        console.log(`${token.ticker}: ${formattedAmount}`);
      }
      
      // Display breakdown by chain
      console.log("\n🔗 BREAKDOWN BY CHAIN:");
      
      // Group by chain for better visualization
      const chainBalances: Record<number, any[]> = {};
      
      for (const token of cab.tokens) {
        if (token.balances && token.balances.length > 0) {
          for (const balance of token.balances) {
            if (!chainBalances[balance.chainId]) {
              chainBalances[balance.chainId] = [];
            }
            
            chainBalances[balance.chainId].push({
              ticker: token.ticker,
              amount: balance.amount,
            });
          }
        }
      }
      
      // Sort chains by total USD value (approximate)
      const chainEntries = Object.entries(chainBalances);
      
      for (const [chainIdStr, balances] of chainEntries) {
        const chainId = Number(chainIdStr);
        const chainName = chainNames[chainId] || `Chain ID ${chainId}`;
        
        console.log(`\n${chainName}:`);
        
        // Sort tokens by value
        const sortedBalances = [...balances].sort((a, b) => 
          Number(formatUnits(BigInt(b.amount), getTokenDecimals(b.ticker))) - 
          Number(formatUnits(BigInt(a.amount), getTokenDecimals(a.ticker)))
        );
        
        for (const balance of sortedBalances) {
          const formattedAmount = formatTokenAmount(balance.amount, balance.ticker);
          console.log(`  - ${balance.ticker}: ${formattedAmount}`);
        }
      }
      
      // Cross-chain potential
      console.log("\n⚡ CROSS-CHAIN CAPABILITIES:");
      console.log("You can use these tokens to:");
      
      // Show possibilities for tokens with significant balances
      let hasSignificantBalance = false;
      
      for (const token of cab.tokens) {
        const amount = Number(formatUnits(BigInt(token.amount), getTokenDecimals(token.ticker)));
        
        if (amount > 0) {
          hasSignificantBalance = true;
          
          if (token.ticker === "USDC" || token.ticker === "USDT" || token.ticker === "DAI") {
            console.log(`- Execute stablecoin transactions on any supported chain using your ${token.ticker}`);
          } else if (token.ticker === "ETH") {
            console.log(`- Pay for gas or execute ETH-based transactions across all EVM chains`);
          } else if (token.ticker === "MATIC") {
            console.log(`- Use your MATIC from Polygon on other chains without bridging`);
          }
        }
      }
      
      if (!hasSignificantBalance) {
        console.log("- No significant token balances found for cross-chain operations");
        console.log("- Consider adding tokens to your wallet to use chain abstraction");
      }
    }
    
    console.log("\n✅ Chain Abstracted Balance exploration complete!");
    console.log("=================================================");
    console.log("With ZeroDev's Chain Abstraction, you can use these tokens across any supported chain");
    console.log("without bridging or complex operations.");
  } catch (error) {
    console.error("❌ Error getting Chain Abstracted Balances:", error);
  }
}

main().catch(console.error);