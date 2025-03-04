import "dotenv/config";
import { KERNEL_V3_2, getEntryPoint } from "@zerodev/sdk/constants";
import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-ecdsa-validator";
import {
  formatUnits,
  type Hex,
  createPublicClient,
  http,
} from "viem";
import { createKernelAccount } from "@zerodev/sdk";
import { privateKeyToAccount } from "viem/accounts";
import {
  createIntentClient,
  installIntentExecutor,
  INTENT_V0_3,
} from "@zerodev/intent";
import { polygon } from "viem/chains";

// Load environment variables
const privateKeyRaw = process.env.PRIVATE_KEY;
if (!privateKeyRaw) {
  throw new Error("PRIVATE_KEY is not set in .env file");
}

// Ensure the private key has the correct format (0x prefix)
const privateKey = privateKeyRaw.startsWith('0x')
  ? privateKeyRaw as Hex
  : `0x${privateKeyRaw}` as Hex;

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
      return 18;
    default:
      return 18;
  }
}

// Main function to explore CAB
async function main() {
  console.log("🌉 ZeroDev Chain Abstracted Balance (CAB) Explorer - Polygon Only");
  console.log("==============================================================");
  
  // Setup
  const entryPoint = getEntryPoint("0.6");
  const bundlerRpc = "https://rpc.zerodev.app";
  
  const userAccount = privateKeyToAccount(privateKey);
  console.log("🔑 EOA address:", userAccount.address);
  
  // Create a public client for Polygon
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(),
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
  
  // Check CAB for Polygon only
  console.log("\n🔍 Scanning for Chain Abstracted Balances on Polygon...");
  
  try {
    // Get the CAB for Polygon
    const cab = await intentClient.getCAB({
      networks: [polygon.id],
      tokenTickers: ["MATIC", "USDC", "USDT", "DAI"],
    });
    
    console.log("\n📊 Chain Abstracted Balance (CAB) Results for Polygon");
    console.log("=================================================");
    
    // Check if we have any tokens
    if (!cab.tokens || cab.tokens.length === 0) {
      console.log("❌ No tokens found on Polygon.");
    } else {
      // Display balances
      console.log("\n💰 Polygon Token Balances:");
      
      for (const token of cab.tokens) {
        const decimals = getTokenDecimals(token.ticker);
        const formattedAmount = formatUnits(BigInt(token.amount), decimals);
        console.log(`${token.ticker}: ${formattedAmount}`);
      }
      
      // Demonstrate intent capabilities
      console.log("\n🚀 Intent Capabilities:");
      console.log("With ZeroDev Intents on Polygon, you can:");
      console.log("- Transfer MATIC or tokens to any address");
      console.log("- Submit cross-chain intents to use your Polygon tokens on other chains");
      console.log("- Pay for gas using your existing token balances");
      console.log("- Execute complex DeFi operations in a single intent");
      
      // Sample intent structure
      console.log("\n📝 Sample Intent Structure for Polygon:");
      console.log(`
const intentDefinition = {
  calls: [
    {
      // Transfer MATIC example
      to: "0xRecipientAddress",
      value: parseEther("0.01"),
      data: "0x",
    },
  ],
  outputTokens: [
    {
      chainId: ${polygon.id}, // Polygon
      address: "0x0000000000000000000000000000000000000000", // MATIC
      amount: parseEther("0.01"),
    },
  ],
};

// Submit the intent
const result = await intentClient.sendUserIntent(intentDefinition);
      `);
    }
    
  } catch (error) {
    console.error("❌ Error getting Chain Abstracted Balances:", error);
  }
}

main().catch(console.error);