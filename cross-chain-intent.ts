import "dotenv/config";
import { KERNEL_V3_2, getEntryPoint } from "@zerodev/sdk/constants";
import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-ecdsa-validator";
import {
  formatUnits,
  erc20Abi,
  parseUnits,
  type Hex,
  createPublicClient,
  http,
  encodeFunctionData,
  zeroAddress,
} from "viem";
import { createKernelAccount } from "@zerodev/sdk";
import { privateKeyToAccount } from "viem/accounts";
import {
  createIntentClient,
  installIntentExecutor,
  INTENT_V0_3,
} from "@zerodev/intent";
import { polygon, base, optimism } from "viem/chains";

// Load environment variables
if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is not set in .env file");
}

// Configuration
const privateKeyRaw = process.env.PRIVATE_KEY;
// Ensure the private key has the correct format (0x prefix)
const privateKey = privateKeyRaw?.startsWith('0x') 
  ? privateKeyRaw as Hex 
  : `0x${privateKeyRaw}` as Hex;

const timeout = 100_000;
const bundlerRpc = "https://rpc.zerodev.app";
const entryPoint = getEntryPoint("0.7");
const userAccount = privateKeyToAccount(privateKey);

// Token addresses for USDC on different chains
const USDC_ADDRESS = {
  [polygon.id]: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC on Polygon
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",    // USDC on Base
  [optimism.id]: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" // USDC on Optimism
};

console.log("🔑 Using EOA address:", userAccount.address);

// Source chain and destination chain for cross-chain operation
const sourceChain = polygon;
const destChain = base;

async function createIntentClient() {
  console.log(`🔄 Creating Intent client on ${sourceChain.name}...`);

  const publicClient = createPublicClient({
    chain: sourceChain,
    transport: http(),
  });

  // Create multi-chain ECDSA validator
  console.log("🔄 Setting up multi-chain ECDSA validator...");
  const ecdsaValidator = await toMultiChainECDSAValidator(publicClient, {
    signer: userAccount,
    kernelVersion: KERNEL_V3_2,
    entryPoint,
  });

  // Create kernel account with intent executor
  console.log("🔄 Creating kernel account with intent executor...");
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    kernelVersion: KERNEL_V3_2,
    entryPoint,
    initConfig: [installIntentExecutor(INTENT_V0_3)],
  });

  console.log("📝 Smart Account address:", kernelAccount.address);

  // Create intent client
  const intentClient = createIntentClient({
    account: kernelAccount,
    chain: sourceChain,
    bundlerTransport: http(bundlerRpc, { timeout }),
    version: INTENT_V0_3,
  });

  return intentClient;
}

async function main() {
  console.log("🚀 Starting ZeroDev Cross-Chain Intent Demo");
  console.log(`From ${sourceChain.name} to ${destChain.name}`);
  console.log("---------------------------------------------------");
  
  const intentClient = await createIntentClient();
  
  // Get Chain Abstracted Balance (CAB)
  console.log("📊 Checking Chain Abstracted Balances (CAB) for USDC...");
  const cab = await intentClient.getCAB({
    networks: [sourceChain.id, destChain.id, optimism.id],
    tokenTickers: ["USDC"],
  });
  
  // Display CAB information
  console.log("\n📊 Chain Abstracted Balance (CAB) Details:");
  console.log("=========================================");
  for (const token of cab.tokens) {
    console.log(`${token.ticker}: ${formatUnits(BigInt(token.amount), 6)} (${token.amount} wei)`);
    
    // Show breakdown by chain
    if (token.balances && token.balances.length > 0) {
      console.log("  Chain breakdown:");
      for (const balance of token.balances) {
        const chainName = balance.chainId === polygon.id ? "Polygon" : 
                         balance.chainId === base.id ? "Base" : 
                         balance.chainId === optimism.id ? "Optimism" : 
                         `Chain ID ${balance.chainId}`;
        console.log(`  - ${chainName}: ${formatUnits(BigInt(balance.amount), 6)}`);
      }
    }
    console.log("------------------");
  }

  // Amount of USDC to transfer (0.01 USDC for testing)
  const usdcAmount = parseUnits("0.01", 6);
  
  // Define cross-chain intent (use USDC from source chain to execute a transfer on destination chain)
  console.log(`\n🔄 Creating cross-chain intent: Transfer 0.01 USDC on ${destChain.name} using USDC from ${sourceChain.name}...`);
  
  // Define our cross-chain intent
  const intentDefinition = {
    calls: [
      {
        to: USDC_ADDRESS[destChain.id], // USDC on destination chain
        value: BigInt(0),
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [userAccount.address, usdcAmount], // Transfer to our own EOA
        }),
      },
    ],
    // Specify input tokens (optional, for demonstration)
    inputTokens: [
      {
        chainId: sourceChain.id,
        address: USDC_ADDRESS[sourceChain.id], // USDC on source chain
      },
    ],
    // Specify output tokens (required)
    outputTokens: [
      {
        chainId: destChain.id,
        address: USDC_ADDRESS[destChain.id], // USDC on destination chain
        amount: usdcAmount,
      },
    ],
  };
  
  // Log the intent definition
  console.log("\n📝 Cross-Chain Intent Definition:");
  console.log("==============================");
  console.log(JSON.stringify(intentDefinition, null, 2));
  
  // Send the intent
  console.log("\n🚀 Submitting cross-chain intent...");
  try {
    const result = await intentClient.sendUserIntent(intentDefinition);

    console.log("\n✅ Cross-chain intent sent successfully!");
    console.log("InputsUiHash:", JSON.stringify(result.inputsUiHash, null, 2));
    console.log("OutputUiHash:", JSON.stringify(result.outputUiHash, null, 2));
    
    // Wait for the intent to be opened on all input chains
    console.log("\n⏳ Waiting for intent to be opened on input chains...");
    await Promise.all(
      result.inputsUiHash.map(async (data, index) => {
        console.log(`Waiting for input intent ${index + 1}/${result.inputsUiHash.length} (${data.uiHash})...`);
        const openReceipts = await intentClient.waitForUserIntentOpenReceipt({
          uiHash: data.uiHash,
        });
        console.log(`✅ Intent opened on chain ${openReceipts?.openChainId} with transaction hash: ${openReceipts?.receipt.transactionHash}`);
        
        // Show block explorer link for the source chain
        const sourceExplorerUrl = `https://polygonscan.com/tx/${openReceipts?.receipt.transactionHash}`;
        console.log(`🔍 View source transaction: ${sourceExplorerUrl}`);
      })
    );

    // Wait for final execution on the destination chain
    console.log(`\n⏳ Waiting for intent execution on ${destChain.name}...`);
    const receipt = await intentClient.waitForUserIntentExecutionReceipt({
      uiHash: result.outputUiHash.uiHash,
    });

    console.log("\n🎉 Cross-chain intent execution completed!");
    console.log(`📍 Executed on chain: ${receipt?.executionChainId}`);
    console.log(`📝 Transaction hash: ${receipt?.receipt.transactionHash}`);
    
    // Display block explorer link for the destination chain
    const blockExplorerUrl = `https://basescan.org/tx/${receipt?.receipt.transactionHash}`;
    console.log(`🔍 View destination transaction: ${blockExplorerUrl}`);
    
    // Check the updated CAB after the cross-chain operation
    console.log("\n📊 Checking updated Chain Abstracted Balances after cross-chain operation...");
    const updatedCab = await intentClient.getCAB({
      networks: [sourceChain.id, destChain.id],
      tokenTickers: ["USDC"],
    });
    
    console.log("\n📊 Updated CAB Details:");
    console.log("=====================");
    for (const token of updatedCab.tokens) {
      console.log(`${token.ticker}: ${formatUnits(BigInt(token.amount), 6)} (${token.amount} wei)`);
      
      if (token.balances && token.balances.length > 0) {
        console.log("  Chain breakdown:");
        for (const balance of token.balances) {
          const chainName = balance.chainId === polygon.id ? "Polygon" : 
                           balance.chainId === base.id ? "Base" : 
                           `Chain ID ${balance.chainId}`;
          console.log(`  - ${chainName}: ${formatUnits(BigInt(balance.amount), 6)}`);
        }
      }
    }
  } catch (error) {
    console.error("\n❌ Error with cross-chain intent:", error);
    console.log("\nNote: This example requires you to have USDC tokens on the source chain.");
    console.log("If you don't have USDC, try running the simple intent-example.ts instead.");
  }
  
  console.log("\n✅ ZeroDev Cross-Chain Intent demonstration completed");
}

main().catch((error) => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});