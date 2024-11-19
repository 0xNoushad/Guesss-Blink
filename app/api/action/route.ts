import {
  ACTIONS_CORS_HEADERS,
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  createPostResponse,
} from "@solana/actions";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";

// Enhanced Game Configuration
const GAME_CONFIG = {
  ENTRY_FEE: 10 * LAMPORTS_PER_SOL,
  PRIZE_MULTIPLIER: 2,
  MIN_NUMBER: 1,
  MAX_NUMBER: 12,
  WALLET_FEE_COLLECTOR: new PublicKey("JCSTecnYRdTTeFTGxQuoPJzJGHpsmv6PQkPnKMz9isvi")
};

// Image URLs for game visuals
const GAME_IMAGES = {
  numbers: {
    1: "https://blink-game.com/images/number-1.png",
    2: "https://blink-game.com/images/number-2.png",
    3: "https://blink-game.com/images/number-1.png",
    4: "https://blink-game.com/images/number-2.png",
 
  5: "https://blink-game.com/images/number-12.png",
    6: "https://blink-game.com/images/number-1.png",
    7: "https://blink-game.com/images/number-2.png",
 
  8: "https://blink-game.com/images/number-12.png",
    9: "https://blink-game.com/images/number-1.png",
    10: "https://blink-game.com/images/number-2.png",
 
    11: "https://blink-game.com/images/number-12.png",
 
    12: "https://blink-game.com/images/number-12.png"
  },
  results: {
    win: "https://blink-game.com/images/winner.png",
    lose: "https://blink-game.com/images/loser.png"
  }
};

// Utility function to generate a random winning number
function generateWinningNumber(): number {
  return Math.floor(Math.random() * GAME_CONFIG.MAX_NUMBER) + 1;
}

// GET handler for the game action
export async function GET(request: Request) {
  const url = new URL(request.url);
  
  const payload: ActionGetResponse = {
    icon: "https://proxy.dial.to/image?url=https%3A%2F%2Fstorage.googleapis.com%2Fblink-man%2Firfan_50_-0.00_48_d1f59a6aa267446eba7db2affc4a52d4.png",
    title: "Villain's Number Roulette",
    description: `Entry Fee: ${GAME_CONFIG.ENTRY_FEE / LAMPORTS_PER_SOL} SOL | Guess the Villain's Number!`,
    label: "Challenge the Villain",
    links: {
      actions: [
        {
          label: `Bet ${GAME_CONFIG.ENTRY_FEE / LAMPORTS_PER_SOL} SOL`,
          href: `${url.href}?selectedNumber=<USER_INPUT>`, // Add placeholder
          type: "transaction"
        }
      ]
    }
  };

  return Response.json(payload, {
    headers: ACTIONS_CORS_HEADERS,
  });
}


// OPTIONS handler (required for CORS)
export const OPTIONS = GET;

// POST handler for game submission
export async function POST(request: Request) {
  const body: ActionPostRequest = await request.json();
  const url = new URL(request.url);
  
  // Validate sender's account
  let sender: PublicKey;
  try {
    sender = new PublicKey(body.account);
  } catch (error) {
    return Response.json(
      { error: { message: "Invalid Solana account" } },
      { 
        status: 400, 
        headers: ACTIONS_CORS_HEADERS 
      }
    );
  }

  // Extract and validate selected number
  const selectedNumber = parseInt(url.searchParams.get("selectedNumber") || "0");
  if (selectedNumber < GAME_CONFIG.MIN_NUMBER || selectedNumber > GAME_CONFIG.MAX_NUMBER) {
    return Response.json(
      { 
        error: { 
          message: `Select a number between ${GAME_CONFIG.MIN_NUMBER} and ${GAME_CONFIG.MAX_NUMBER}` 
        } 
      },
      { 
        status: 400, 
        headers: ACTIONS_CORS_HEADERS 
      }
    );
  }

  // Generate winning number
  const winningNumber = generateWinningNumber();
  const isWinner = selectedNumber === winningNumber;

  // Establish connection to Solana devnet
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  // Prepare transaction based on win/lose
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: isWinner 
        ? sender  // Send winnings back to player
        : GAME_CONFIG.WALLET_FEE_COLLECTOR,  // Collect entry fee if lost
      lamports: isWinner 
        ? GAME_CONFIG.ENTRY_FEE * GAME_CONFIG.PRIZE_MULTIPLIER  // Double the entry fee
        : GAME_CONFIG.ENTRY_FEE  // Original entry fee
    })
  );

  // Set transaction details
  transaction.feePayer = sender;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;

  // Prepare game result payload
  const gameResult = {
    selectedNumber,
    winningNumber,
    isWinner,
    message: isWinner 
      ? "Villainous Victory! You cracked the code!" 
      : "Foiled Again! Better luck next time, villain.",
    imageUrl: isWinner 
      ? GAME_IMAGES.results.win 
      : GAME_IMAGES.results.lose
  };

  // Create Solana Blink action response
  const payload: ActionPostResponse = await createPostResponse({
    fields: {
      transaction,
      message: gameResult.message,
      type: "transaction"
    }
  });

  // Return response with game result and transaction
  
  return new Response(JSON.stringify(payload), {
    headers: ACTIONS_CORS_HEADERS,
  });
}