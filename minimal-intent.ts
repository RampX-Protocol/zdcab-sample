import "dotenv/config";
import { KERNEL_V3_2, getEntryPoint } from "@zerodev/sdk/constants";
import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-ecdsa-validator";
import {
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
import { polygon } from "viem/chains";

// Add BigInt serialization support for console.log
BigInt.prototype.toJSON = function() {
  return this.toString();
};

// Load environment variables
const privateKeyRaw = process.env.PRIVATE_KEY;
if (!privateKeyRaw) {
  throw new Error("PRIVATE_KEY is not set in .env file");
}

// Ensure the private key has the correct format (0x prefix)
const privateKey = privateKeyRaw.startsWith('0x')
  ? privateKeyRaw as Hex
  : `0x${privateKeyRaw}` as Hex;

// Main function
async function main() {
  console.log("🚀 Starting ZeroDev Simplest Intent Sample");
  
  // Constants
  const entryPoint = getEntryPoint("0.7");
  const bundlerRpc = "https://rpc.zerodev.app";
  const timeout = 100_000; // 100 seconds timeout
  
  // Setup
  const userAccount = privateKeyToAccount(privateKey);
  console.log("🔑 EOA address:", userAccount.address);
  
  // Get Polygon RPC URL from environment
  const polygonRpcUrl = process.env.POLYGON_RPC_URL;
  if (!polygonRpcUrl) {
    console.warn("⚠️ POLYGON_RPC_URL not set in .env file, using default fallback");
  }
  
  // Create a public client for Polygon
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(polygonRpcUrl),
  });
  
  // Create validator
  console.log("1️⃣ Creating validator...");
  const ecdsaValidator = await toMultiChainECDSAValidator(publicClient, {
    signer: userAccount,
    kernelVersion: KERNEL_V3_2,
    entryPoint,
  });
  
  // Create kernel account
  console.log("2️⃣ Creating kernel account...");
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
  console.log("3️⃣ Creating intent client...");
  const intentClient = createIntentClient({
    account: kernelAccount,
    chain: polygon,
    bundlerTransport: http(bundlerRpc, { timeout }),
    version: INTENT_V0_3,
  });
  
  // USDC address on Polygon
  const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
  // A small amount of USDC to transfer (0.01 USDC)
  const transferAmount = BigInt(10000); // 0.01 USDC (with 6 decimals)
  
  // Create a simple intent to transfer USDC
  console.log("4️⃣ Creating intent definition...");
  // The minimal intent definition
  const intentDefinition = {
    calls: [
      {
        to: USDC_ADDRESS,
        value: BigInt(0), // No MATIC value for token transfer
        data: encodeFunctionData({
          abi: [
            {
              name: "transfer", 
              type: "function",
              inputs: [
                { name: "to", type: "address" },
                { name: "amount", type: "uint256" }
              ],
              outputs: [{ type: "bool" }],
              stateMutability: "nonpayable"
            }
          ],
          functionName: "transfer",
          args: [userAccount.address, transferAmount],
        }),
      },
    ],
    // Include inputTokens (might be required by the API)
    inputTokens: [
      {
        chainId: polygon.id,
        address: USDC_ADDRESS,
      },
    ],
    // Define the expected output tokens (what we expect to receive)
    outputTokens: [
      {
        chainId: polygon.id,
        address: USDC_ADDRESS,
        amount: transferAmount,
      },
    ],
  };
  
  // Log the intent definition with proper BigInt handling
  console.log("\n📝 Intent Definition:");
  console.log(JSON.stringify(intentDefinition, null, 2));
  
  // Submit intent
  console.log("5️⃣ Submitting intent...");
  try {
    const result = await intentClient.sendUserIntent(intentDefinition);
    console.log("✅ Intent submitted successfully!");
    console.log("🔑 Output UI Hash:", result.outputUiHash.uiHash);
    
    // Wait for execution
    console.log("6️⃣ Waiting for execution...");
    const receipt = await intentClient.waitForUserIntentExecutionReceipt({
      uiHash: result.outputUiHash.uiHash,
    });
    
    console.log("🎉 Intent executed successfully!");
    console.log("📝 Transaction hash:", receipt?.receipt.transactionHash);
    console.log("🔗 View on Polygonscan:", `https://polygonscan.com/tx/${receipt?.receipt.transactionHash}`);
  } catch (error) {
    console.error("❌ Error submitting intent:", error);
    // Log the detailed error if available
    if (error.details) {
      console.error("Details:", error.details);
    }
  }
}

main().catch(console.error);