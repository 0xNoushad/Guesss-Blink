import {
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  ActionGetResponse,
  ActionPostRequest,
} from "@solana/actions";
import {
  clusterApiUrl,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
} from "@solana/spl-token";

// GET endpoint to retrieve action information and input parameters
export const GET = async (req: Request) => {
  const url = new URL(req.url);

  const payload: ActionGetResponse = {
    title: "Create Your Meme Coin",
    icon: "https://i.imgur.com/DIb21T3.png",
    description: "Fill in the details to create your own meme coin on Solana.",
    label: "Create Meme Coin",
    links: {
      actions: [
        {
          label: "Create Token",
          href: `${req.url}?name={name}&ticker={ticker}&description={description}&image={image}`,
          parameters: [
            { name: "name", label: "Token Name" },
            { name: "ticker", label: "Ticker Symbol" },
            { name: "description", label: "Description" },
            { name: "image", label: "Image URL" },
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

// OPTIONS method, same as GET
export const OPTIONS = GET;

// POST endpoint to handle the creation of the meme coin
export const POST = async (req: Request) => {
  try {
    const body: ActionPostRequest = await req.json();
    const url = new URL(req.url);
    const params = url.searchParams;

    // Parse user-provided account and input parameters
    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      console.error("Invalid public key:", err);
      return new Response("Invalid account public key", { status: 400 });
    }
    
    const connection = new Connection(clusterApiUrl("devnet"));


    // Ensure mint keypair and other required parameters are provided
    const mintKeypair = new PublicKey(params.get("mint") || account.toString());
    const tokenName = params.get("name") || "Custom Token";
    const ticker = params.get("ticker") || "MEME";
    const description = params.get("description") || "Your custom meme coin on Solana.";
    const image = params.get("image") || ""; // Optional

    // Get the minimum balance required for a mint account
    const lamports = await getMinimumBalanceForRentExemptMint(connection);

    // Create the transaction to initialize the mint
    const transaction = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
      SystemProgram.createAccount({
        fromPubkey: account,
        newAccountPubkey: mintKeypair,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKeypair,
        9, // Token decimals
        account, // Mint authority
        account, // Freeze authority
        TOKEN_PROGRAM_ID
      )
    );

    // Set the transaction fee payer and recent blockhash
    transaction.feePayer = account;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    // Create payload with the transaction for client-side signing
    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `Creating ${tokenName} Token with Ticker ${ticker}`,
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
    console.error("Transaction error:", err);
    return new Response("Transaction could not be completed", {
      status: 500,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
};
