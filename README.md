# ZeroDev Kernel Intent Examples with Chain Abstraction

This repository demonstrates ZeroDev's Kernel Intent system and Chain Abstracted Balances (CAB) capabilities, showing how to perform cross-chain transactions without bridging.

## What is ZeroDev Chain Abstraction?

ZeroDev's Chain Abstraction technology enables users to:

1. Use tokens from one chain on another chain without bridging
2. Execute cross-chain transactions in a single intent
3. Access deep liquidity pools across multiple chains
4. Pay gas on one chain using tokens from another chain

## Setup

1. Make sure you have your private key in the `.env` file:
   ```
   PRIVATE_KEY=your_private_key_here
   POLYGON_RPC_URL=https://polygon-rpc.com/
   ```

2. Install dependencies:
   This project uses **Bun**
   ```bash
   bun install
   ```

## Examples

### Chain Abstracted Balance (CAB) Explorers

These utilities allow you to view your Chain Abstracted Balances across supported networks:

1. **Full CAB Explorer** - Shows balances across all supported chains:
   ```bash
   bun cab-explorer.ts
   ```

2. **Polygon CAB Explorer** - Focuses only on Polygon balances:
   ```bash
   bun polygon-cab-explorer.ts
   ```

### Intent Examples

1. **Simple Intent on Polygon** - Demonstrates a basic intent for a self-transfer of MATIC:
   ```bash
   bun minimal-intent.ts
   ```

2. **Cross-Chain Intent** - Shows how to use USDC on Polygon to execute a transaction on Base:
   ```bash
   bun cross-chain-intent.ts
   ```

## Implementation Details

### Intent Structure

The core of ZeroDev intents follows this structure:

```typescript
const intentDefinition = {
  // Actions to execute
  calls: [
    {
      to: targetAddress,
      value: amount,       // For native token transfers
      data: calldata,      // For contract interactions
    },
  ],
  
  // Optional: specify which tokens to use as input
  inputTokens: [
    {
      chainId: sourceChain.id,
      address: tokenAddress,  // Token contract address
    },
  ],
  
  // Required: specify which tokens are needed on destination
  outputTokens: [
    {
      chainId: destinationChain.id,
      address: tokenAddress,
      amount: tokenAmount,
    },
  ],
  
  // Optional: specify how to pay for gas
  // - undefined: Pay with input tokens
  // - 'NATIVE': Pay with native tokens
  // - 'SPONSORED': Sponsor gas for the user
  gasToken: 'NATIVE'
}
```

### Intent Execution Flow

Cross-chain intents are executed in multiple steps:

1. **Opening**: The intent is opened on input chains where your tokens come from
2. **Execution**: The intent is executed on the destination chain

Each step produces transaction hashes that can be tracked on block explorers.

### Setting up a ZeroDev Kernel with Intent Support

The following steps are required:

1. **Installation**:
   ```
   bun add @zerodev/sdk @zerodev/intent @zerodev/multi-chain-ecdsa-validator
   ```

2. **Create Account**:
   ```typescript
   // Create validator
   const ecdsaValidator = await toMultiChainECDSAValidator(publicClient, {
     signer: userAccount,
     kernelVersion: KERNEL_V3_2,
     entryPoint,
   });
   
   // Create kernel account with intent executor
   const kernelAccount = await createKernelAccount(publicClient, {
     plugins: {
       sudo: ecdsaValidator,
     },
     kernelVersion: KERNEL_V3_2,
     entryPoint,
     initConfig: [installIntentExecutor(INTENT_V0_3)],
   });
   ```

3. **Create Intent Client**:
   ```typescript
   const intentClient = createIntentClient({
     account: kernelAccount,
     chain: polygon,
     bundlerTransport: http(bundlerRpc),
     version: INTENT_V0_3,
   });
   ```

4. **Send Intent**:
   ```typescript
   const result = await intentClient.sendUserIntent(intentDefinition);
   ```

5. **Wait for Execution**:
   ```typescript
   const receipt = await intentClient.waitForUserIntentExecutionReceipt({
     uiHash: result.outputUiHash.uiHash,
   });
   ```

## Supported Networks and Tokens

### Networks
- Ethereum Mainnet
- Polygon
- Arbitrum
- Optimism
- Base
- Binance Smart Chain

### Tokens
- Native tokens (ETH, MATIC, etc.)
- USDC
- USDT
- DAI
- And other popular ERC20 tokens

## Resources

- [Official ZeroDev Documentation](https://docs.zerodev.app/chain-abstraction/)
- [ZeroDev Website](https://zerodev.app/)
- [GitHub Repository](https://github.com/zerodevapp/sdk)

## Operational Notes

- For cross-chain intents, sufficient token balances must exist on source chains

### Summary

  Created a ZeroDev Kernel Intent submission example that demonstrates Chain
  Abstracted Balance (CAB) capabilities on Polygon and across chains.

  Created multiple TypeScript examples:
    - intent-example.ts: Comprehensive example for Polygon
    - cross-chain-intent.ts: Cross-chain intent using CAB
    - minimal-intent.ts & simplest-intent.ts: Simplified examples
    - cab-explorer.ts: CAB visualization across chains
    - polygon-cab-explorer.ts: Polygon-specific CAB explorer

  Next steps could include:

  1. Obtaining a ZeroDev project ID for sponsored intents
  2. Adding tokens to test accounts for cross-chain operations
  3. Adding more complex use cases (DeFi operations, NFTs)
