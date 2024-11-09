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
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,

  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getMintLen,
  ExtensionType,
  createInitializeMetadataPointerInstruction,
} from "@solana/spl-token";
import {
  createInitializeInstruction,
  createUpdateFieldInstruction,
  TokenMetadata,
} from "@solana/spl-token-metadata";

interface TokenFormData {
  name: string;
  symbol: string;
  description: string;
  image: string;
  decimals: number;
  initialSupply: number;
}

const CONFIG = {
  MAX_NAME_LENGTH: 32,
  MAX_SYMBOL_LENGTH: 10,
  MIN_NAME_LENGTH: 3,
  MIN_SYMBOL_LENGTH: 2,
  DECIMALS: 9,
  INITIAL_SUPPLY: 1000000000,
};

const validateInput = (params: TokenFormData): string[] => {
  const errors: string[] = [];
  const { name, symbol, description, image, decimals, initialSupply } = params;

  if (!name || name.length < CONFIG.MIN_NAME_LENGTH || name.length > CONFIG.MAX_NAME_LENGTH) {
    errors.push(`Token name must be between ${CONFIG.MIN_NAME_LENGTH} and ${CONFIG.MAX_NAME_LENGTH} characters`);
  }

  if (!symbol || symbol.length < CONFIG.MIN_SYMBOL_LENGTH || symbol.length > CONFIG.MAX_SYMBOL_LENGTH) {
    errors.push(`Symbol must be between ${CONFIG.MIN_SYMBOL_LENGTH} and ${CONFIG.MAX_SYMBOL_LENGTH} characters`);
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

  if (isNaN(decimals) || decimals < 0 || decimals > 9) {
    errors.push("Decimals must be a number between 0 and 9");
  }

  if (isNaN(initialSupply) || initialSupply <= 0) {
    errors.push("Initial supply must be a positive number");
  }

  return errors;
};

export async function GET(req: Request): Promise<Response> {
  const payload: ActionGetResponse = {
    title: "Create Your Token with Metadata",
    icon: "https://i.imgur.com/DIb21T3.png",
    description: `Create your own token on Solana with metadata. Requirements:
    - Name: ${CONFIG.MIN_NAME_LENGTH}-${CONFIG.MAX_NAME_LENGTH} characters
    - Symbol: ${CONFIG.MIN_SYMBOL_LENGTH}-${CONFIG.MAX_SYMBOL_LENGTH} characters
    - Description: Up to 200 characters
    - Valid image URL (optional)
    - Decimals: 0-9
    - Initial supply: Positive number`,
    label: "Create Token",
    links: {
      actions: [
        {
          label: "Create Token",
          href: `${req.url}?name={name}&symbol={symbol}&description={description}&image={image}&decimals={decimals}&initialSupply={initialSupply}`,
          parameters: [
            { 
              name: "name", 
              label: "Token Name",
              required: true,
              pattern: `.{${CONFIG.MIN_NAME_LENGTH},${CONFIG.MAX_NAME_LENGTH}}`
            },
            { 
              name: "symbol", 
              label: "Symbol",
              required: true,
              pattern: `.{${CONFIG.MIN_SYMBOL_LENGTH},${CONFIG.MAX_SYMBOL_LENGTH}}`
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
              pattern: "\\d"
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
}

export const OPTIONS = GET;

export async function POST(req: Request): Promise<Response> {
  try {
    const body: ActionPostRequest = await req.json();
    const url = new URL(req.url);
    const params = new URLSearchParams(url.search);

    const formData: TokenFormData = {
      name: params.get("name") || "",
      symbol: params.get("symbol") || "",
      description: params.get("description") || "",
      image: params.get("image") || "",
      decimals: Number(params.get("decimals")) || CONFIG.DECIMALS,
      initialSupply: Number(params.get("initialSupply")) || CONFIG.INITIAL_SUPPLY
    };

    const validationErrors = validateInput(formData);
    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ errors: validationErrors }), {
        status: 400,
        headers: ACTIONS_CORS_HEADERS,
      });
    }

    const account = new PublicKey(body.account);
    const connection = new Connection(clusterApiUrl("devnet"), 'confirmed');
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;

    const adjustedInitialSupply = BigInt(formData.initialSupply) * BigInt(10 ** formData.decimals);

    const metaData: TokenMetadata = {
      name: formData.name,
      symbol: formData.symbol,
      uri: formData.image,
      mint,
      updateAuthority: account,
      additionalMetadata: [["description", formData.description]],
    };

    const metadataExtension = 2 + 2;
    const metadataLen = Buffer.from(JSON.stringify(metaData)).length;
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);
    
    const lamports = await connection.getMinimumBalanceForRentExemption(
      mintLen + metadataExtension + metadataLen
    );

    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: account,
        newAccountPubkey: mint,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMetadataPointerInstruction(
        mint,
        account,
        mint,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        mint,
        formData.decimals,
        account,
        account,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint,
        updateAuthority: account,
        mint: mint,
        mintAuthority: account,
        name: metaData.name,
        symbol: metaData.symbol,
        uri: metaData.uri,
      })
    );

    if (formData.description) {
      transaction.add(
        createUpdateFieldInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          metadata: mint,
          updateAuthority: account,
          field: "description",
          value: formData.description,
        })
      );
    }

    const associatedTokenAccount = await getAssociatedTokenAddress(
      mint,
      account,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    transaction.add(
      createAssociatedTokenAccountInstruction(
        account,
        associatedTokenAccount,
        account,
        mint,
        TOKEN_2022_PROGRAM_ID
      ),
      createMintToInstruction(
        mint,
        associatedTokenAccount,
        account,
        adjustedInitialSupply,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.feePayer = account;
    transaction.recentBlockhash = latestBlockhash.blockhash;

    transaction.sign(mintKeypair);

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `Your token is being created with metadata! 🎉

Token Details:
• Name: ${formData.name}
• Symbol: ${formData.symbol}
• Description: ${formData.description}
• Image: ${formData.image}
• Mint Address: ${mint.toBase58()}
• Initial Supply: ${formData.initialSupply} tokens
• Decimals: ${formData.decimals}

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
    const errorMessage = err instanceof Error ? err.message : "Transaction could not be completed";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: ACTIONS_CORS_HEADERS,
      status: 400,
    });
  }
}
