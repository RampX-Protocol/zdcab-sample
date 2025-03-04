import "dotenv/config";
import { KERNEL_V3_2, getEntryPoint } from "@zerodev/sdk/constants";
import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-ecdsa-validator";
import {
  formatUnits,
  formatEther,
  erc20Abi,
  parseUnits,
  parseEther,
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

console.log("🔑 Using EOA address:", userAccount.address);

// Main chain for our example
const chain = polygon;

async function createIntentClient() {
  console.log(`🔄 Creating Intent client on ${chain.name}...`);

  const publicClient = createPublicClient({
    chain,
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
    chain,
    bundlerTransport: http(bundlerRpc, { timeout }),
    version: INTENT_V0_3,
  });

  return intentClient;
}

async function main() {
  console.log("🚀 Starting ZeroDev Kernel Intent submission on Polygon");
  console.log("---------------------------------------------------");
  
  const intentClient = await createIntentClient();
  
  // Get Chain Abstracted Balance (CAB)
  console.log("📊 Checking Chain Abstracted Balances (CAB)...");
  const cab = await intentClient.getCAB({
    networks: [polygon.id, base.id, optimism.id],
    tokenTickers: ["MATIC", "ETH", "USDC"],
  });
  
  // Display CAB information
  console.log("\n📊 Chain Abstracted Balance (CAB) Details:");
  console.log("=========================================");
  for (const token of cab.tokens) {
    const decimals = token.ticker === "USDC" ? 6 : 18;
    console.log(`${token.ticker}: ${formatUnits(BigInt(token.amount), decimals)} (${token.amount} wei)`);
    
    // Show breakdown by chain
    if (token.balances && token.balances.length > 0) {
      console.log("  Chain breakdown:");
      for (const balance of token.balances) {
        const chainName = balance.chainId === polygon.id ? "Polygon" : 
                         balance.chainId === base.id ? "Base" : 
                         balance.chainId === optimism.id ? "Optimism" : 
                         `Chain ID ${balance.chainId}`;
        console.log(`  - ${chainName}: ${formatUnits(BigInt(balance.amount), decimals)}`);
      }
    }
    console.log("------------------");
  }

  // Define our intent
  console.log("\n🔄 Creating a simple intent on Polygon...");
  const intentDefinition = {
    calls: [
      {
        // Simple self-transfer of a small amount of MATIC
        to: intentClient.account.address,
        value: parseEther("0.0001"),
        data: "0x",
      },
    ],
    outputTokens: [
      {
        chainId: polygon.id,
        address: zeroAddress, // Native token (MATIC)
        amount: parseEther("0.0001"),
      },
    ],
  };
  
  // Log the intent definition
  console.log("\n📝 Intent Definition:");
  console.log("===================");
  console.log(JSON.stringify(intentDefinition, null, 2));
  
  // Send the intent
  console.log("\n🚀 Submitting intent...");
  const result = await intentClient.sendUserIntent(intentDefinition);

  console.log("\n✅ Intent sent successfully!");
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
    })
  );

  // Wait for final execution on the destination chain
  console.log("\n⏳ Waiting for intent execution...");
  const receipt = await intentClient.waitForUserIntentExecutionReceipt({
    uiHash: result.outputUiHash.uiHash,
  });

  console.log("\n🎉 Intent execution completed!");
  console.log(`📍 Executed on chain: ${receipt?.executionChainId}`);
  console.log(`📝 Transaction hash: ${receipt?.receipt.transactionHash}`);
  
  // Display block explorer link
  const blockExplorerUrl = `https://polygonscan.com/tx/${receipt?.receipt.transactionHash}`;
  console.log(`🔍 View on block explorer: ${blockExplorerUrl}`);
  
  console.log("\n✅ ZeroDev Kernel Intent demonstration completed successfully");
}

main().catch((error) => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});