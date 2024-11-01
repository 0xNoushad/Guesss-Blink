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
  DECIMALS: 9,
  INITIAL_SUPPLY: 1000000000,  
};
 
const validateInput = (params: URLSearchParams) => {
  const errors: string[] = [];
  const name = params.get("name");
  const ticker = params.get("ticker");
  const description = params.get("description");
  const image = params.get("image");
  const decimals = params.get("decimals");
  const initialSupply = params.get("initialSupply");

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

  if (!decimals || isNaN(Number(decimals)) || Number(decimals) < 0 || Number(decimals) > 18) {
    errors.push("Decimals must be a number between 0 and 18");
  }

  if (!initialSupply || isNaN(Number(initialSupply)) || Number(initialSupply) <= 0) {
    errors.push("Initial supply must be a positive number");
  }

  return errors;
};

// GET request handler
export const GET = async (req: Request) => {
  const payload: ActionGetResponse = {
    title: "Create Your Meme Coin",
    icon: "https://i.imgur.com/DIb21T3.png",
    description: `Create your own meme coin on Solana. Requirements:
    - Name: ${CONFIG.MIN_NAME_LENGTH}-${CONFIG.MAX_NAME_LENGTH} characters
    - Ticker: ${CONFIG.MIN_TICKER_LENGTH}-${CONFIG.MAX_TICKER_LENGTH} characters
    - Description: Up to 200 characters
    - Valid image URL (optional)
    - Decimals: 0-18
    - Initial supply: Positive number
    - Sufficient SOL balance for transaction fees`,
    label: "Create Meme Coin",
    links: {
      actions: [
        {
          label: "Create Token",
          href: `${req.url}?name={name}&ticker={ticker}&description={description}&image={image}&decimals={decimals}&initialSupply={initialSupply}`,
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
            {
              name: "decimals",
              label: "Decimals",
              required: true,
              pattern: "\\d+"
            },
            {
              name: "initialSupply",
              label: "Initial Supply",
              required: true,
              pattern: "\\d+"
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

// OPTIONS request handler
export const OPTIONS = GET;

// POST request handler// ... (keep the existing imports and CONFIG)

// POST request handler
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

    const name = params.get("name") || "Unnamed Token";
    const symbol = params.get("ticker") || "UNKNOWN";
    const description = params.get("description") || "";
    const image = params.get("image") || "";
    const decimals = Number(params.get("decimals") || CONFIG.DECIMALS);
    const initialSupply = BigInt(params.get("initialSupply") || CONFIG.INITIAL_SUPPLY);
    const adjustedInitialSupply = initialSupply * BigInt(10 ** decimals);

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
        decimals,
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
        adjustedInitialSupply
      )
    );

    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.feePayer = account;
    transaction.recentBlockhash = latestBlockhash.blockhash;

    // Sign the transaction
    transaction.sign(mintKeypair);
    console.log("Transaction created with blockhash:", latestBlockhash.blockhash);

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `Your meme coin is being created! 🎉

Token Details:
• Name: ${name}
• Ticker: ${symbol}
• Description: ${description}
• Image: ${image}
• Mint Address: ${mintKeypair.publicKey.toBase58()}
• Initial Supply: ${initialSupply.toString()} tokens
• Decimals: ${decimals}

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