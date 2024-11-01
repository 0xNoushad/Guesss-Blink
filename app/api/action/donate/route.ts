import {
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  ActionGetResponse,
  ActionPostRequest,
} from "@solana/actions";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
} from "@solana/spl-token";

const CONFIG = {
  MAX_NAME_LENGTH: 32,
  MAX_TICKER_LENGTH: 5,
  MIN_NAME_LENGTH: 3,
  MIN_TICKER_LENGTH: 2,
  COMPUTE_UNITS: 100000,
  DECIMALS: 9,
  INITIAL_SUPPLY: 1000000000000,  
};
 
const validateInput = (params: URLSearchParams) => {
  const errors: string[] = [];
  const name = params.get("name");
  const ticker = params.get("ticker");
  const description = params.get("description");
  const image = params.get("image");

  if (!name || name.length < CONFIG.MIN_NAME_LENGTH || name.length > CONFIG.MAX_NAME_LENGTH) {
    errors.push(`Token name must be between ${CONFIG.MIN_NAME_LENGTH} and ${CONFIG.MAX_NAME_LENGTH} characters`);
  }

  if (!ticker || ticker.length < CONFIG.MIN_TICKER_LENGTH || ticker.length > CONFIG.MAX_TICKER_LENGTH) {
    errors.push(`Ticker must be between ${CONFIG.MIN_TICKER_LENGTH} and ${CONFIG.MAX_TICKER_LENGTH} characters`);
  }

  if (description && description.length > 200) {
    errors.push(`Description must not exceed 200 characters`);
  }

  if (image) {
    try {
      new URL(image);
    } catch {
      errors.push("Invalid image URL format");
    }
  }

  return errors;
};
 
export const GET = async (req: Request) => {
  const payload: ActionGetResponse = {
    title: "Create Your Meme Coin",
    icon: "https://i.imgur.com/DIb21T3.png",
    description: `Create your own meme coin on Solana. Requirements:
    - Name: ${CONFIG.MIN_NAME_LENGTH}-${CONFIG.MAX_NAME_LENGTH} characters
    - Ticker: ${CONFIG.MIN_TICKER_LENGTH}-${CONFIG.MAX_TICKER_LENGTH} characters
    - Description: Up to 200 characters
    - Valid image URL (optional)
    - Initial supply: 1000 tokens
    - Sufficient SOL balance for transaction fees`,
    label: "Create Meme Coin",
    links: {
      actions: [
        {
          label: "Create Token",
          href: `${req.url}?name={name}&ticker={ticker}&description={description}&image={image}`,
          parameters: [
            { 
              name: "name", 
              label: "Token Name",
              required: true,
              pattern: `.{${CONFIG.MIN_NAME_LENGTH},${CONFIG.MAX_NAME_LENGTH}}`
            },
            { 
              name: "ticker", 
              label: "Ticker Symbol",
              required: true,
              pattern: `.{${CONFIG.MIN_TICKER_LENGTH},${CONFIG.MAX_TICKER_LENGTH}}`
            },
            { 
              name: "description", 
              label: "Description",
              required: false,
              pattern: `.{0,200}`
            },
            { 
              name: "image", 
              label: "Image URL",
              required: false,
              pattern: "https?://.+"
            },
          ],
          type: "transaction",
        },
      ],
    },
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      ...ACTIONS_CORS_HEADERS,
      "X-Action-Version": "2.1.3",
      "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    },
  });
};

 
export const OPTIONS = GET;
 
export const POST = async (req: Request) => {
  try {
    const body: ActionPostRequest = await req.json();
    const url = new URL(req.url);
    const params = url.searchParams;

     
    console.log("Starting token creation process");
    console.log("Parameters:", Object.fromEntries(params.entries()));
 
    const validationErrors = validateInput(params);
    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ errors: validationErrors }), {
        status: 400,
        headers: ACTIONS_CORS_HEADERS,
      });
    }

    const account = new PublicKey(body.account);
    console.log("Account public key:", account.toBase58());
 
    const connection = new Connection(clusterApiUrl("devnet"), 'confirmed');
 
    const balance = await connection.getBalance(account);
    const requiredBalance = await getMinimumBalanceForRentExemptMint(connection);
    console.log("Current balance:", balance / 1e9, "SOL");
    console.log("Required balance:", requiredBalance / 1e9, "SOL");

    if (balance < requiredBalance) {
      return new Response(JSON.stringify({ 
        error: `Insufficient balance. Required: ${requiredBalance / 1e9} SOL` 
      }), {
        status: 400,
        headers: ACTIONS_CORS_HEADERS,
      });
    }
 
    const mintKeypair = Keypair.generate();
    console.log("Generated mint address:", mintKeypair.publicKey.toBase58());

    const associatedTokenAccount = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      account
    );
    console.log("Associated token account:", associatedTokenAccount.toBase58());
 
    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: account,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports: requiredBalance,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        CONFIG.DECIMALS,
        account,
        account,
        TOKEN_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        account, 
        associatedTokenAccount, 
        account, 
        mintKeypair.publicKey
      ),
      
      createMintToInstruction(
        mintKeypair.publicKey,
        associatedTokenAccount,
        account,
        CONFIG.INITIAL_SUPPLY
      )
    );
 
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.feePayer = account;
    transaction.recentBlockhash = latestBlockhash.blockhash;
     
    transaction.sign(mintKeypair);

    console.log("Transaction created with blockhash:", latestBlockhash.blockhash);
 
    const solscanLink = `https://solscan.io/token/${mintKeypair.publicKey.toBase58()}?cluster=devnet`;
 
    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `Your meme coin is being created! 🎉

Token Details:
• Name: ${params.get("name")}
• Ticker: ${params.get("ticker")}
• Mint Address: ${mintKeypair.publicKey.toBase58()}
• Initial Supply: 1000 tokens
• Decimals: ${CONFIG.DECIMALS}

View on Solscan: [View Token](${solscanLink})

If the token doesn't appear in your wallet automatically:
1. Copy the Mint Address above
2. Open your wallet
3. Click "Add Token" or "+ Custom Token"
4. Paste the Mint Address
5. Make sure "Devnet" is selected
6. Click "Add"

Please approve the transaction to finalize creation.`,
        type: "transaction",
      },
    });

    return new Response(JSON.stringify(payload), {
      headers: {
        ...ACTIONS_CORS_HEADERS,
        "X-Action-Version": "2.1.3",
        "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      },
    });
  } catch (err) {
    console.error("Token creation error:", err);
    const errorMessage = err instanceof Error ? err.message : "Transaction could not be completed";
    return new Response(JSON.stringify({ 
      error: errorMessage,
      details: err instanceof Error ? err.stack : undefined
    }), {
      status: 500,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
};