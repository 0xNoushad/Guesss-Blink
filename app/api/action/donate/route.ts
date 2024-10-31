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
  MINT_SIZE
} from "@solana/spl-token";

export const GET = async (req: Request) => {
  const url = new URL(req.url);

  const payload: ActionGetResponse = {
    title: "Create Your Meme Coin",
    icon: new URL("/token-creator-icon.jpg", url.origin).toString(),
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
            { name: "image", label: "Image URL" }
          ],
          type: "transaction"
        }
      ]
    }
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      ...ACTIONS_CORS_HEADERS,
      "X-Action-Version": "2.1.3",
      "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" // Devnet
    },
  });
};

export const OPTIONS = GET;

export const POST = async (req: Request) => {
  try {
    const body: ActionPostRequest = await req.json();
    const url = new URL(req.url);
    const params = url.searchParams;

    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      console.error(err);
      let message = "An unknown error occurred";
      if (typeof err == "string") message = err;
      return new Response(message, {
        status: 400,
        headers: {
          ...ACTIONS_CORS_HEADERS,
          "X-Action-Version": "2.1.3",
          "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" // Devnet
        },
      });
    }

    const connection = new Connection(
      process.env.SOLANA_RPC! || clusterApiUrl("devnet")
    );

    const mintKeypair = new PublicKey(params.get('mint') || account.toString());

    const lamports = await getMinimumBalanceForRentExemptMint(connection);

    const transaction = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1000,
      }),
      SystemProgram.createAccount({
        fromPubkey: account,
        newAccountPubkey: mintKeypair,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKeypair,
        9, // 9 decimals
        account,
        account,
        TOKEN_PROGRAM_ID
      )
    );

    transaction.feePayer = account;
    transaction.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `Creating ${params.get('name') || 'Custom'} Token`,
        type: "transaction",
      },
    });

    return new Response(JSON.stringify(payload), {
      headers: {
        ...ACTIONS_CORS_HEADERS,
        "X-Action-Version": "2.1.3",
        "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" // Devnet
      },
    });
  } catch (err) {
    console.log(err);
    let message = "An unknown error occurred";
    if (typeof err == "string") message = err;
    return new Response(message, {
      status: 400,
      headers: {
        ...ACTIONS_CORS_HEADERS,
        "X-Action-Version": "2.1.3",
        "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" // Devnet
      },
    });
  }
};
