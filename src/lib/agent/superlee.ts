// src/lib/agent/superlee.ts
import { findTokenAddress, symbolFor } from "./tokens";

/** ===== Types ===== */
export type ConversationState =
  | "awaiting_sup"
  | "greeting"
  | "register_awaiting_file"
  | "register_analyzing_ai"
  | "register_awaiting_name"
  | "register_awaiting_description"
  | "register_awaiting_license"
  | "register_ready"
  | "swap_awaiting_tokens"
  | "swap_awaiting_amount"
  | "swap_ready";

export type SuperleeContext = {
  state: ConversationState;
  flow: "register" | "swap" | null;
  registerData?: {
    file?: File;
    aiDetected?: boolean;
    aiConfidence?: number;
    name?: string;
    description?: string;
    license?: string;
    pilType?: string;
  };
  swapData?: {
    tokenIn?: string;
    tokenOut?: string;
    amount?: number;
    slippagePct?: number;
  };
};

export type SwapIntent = {
  kind: "swap";
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amount: number;
  slippagePct?: number;
};

export type RegisterIntent = {
  kind: "register";
  title?: string;
  prompt?: string;
  license?: "by" | "by-nc" | "by-nd" | "by-sa" | "cc0" | "arr";
  pilType?: "open_use" | "non_commercial_remix" | "commercial_use" | "commercial_remix";
};

export type SuperleeResponse =
  | { type: "message"; text: string; buttons?: string[]; image?: { url: string; alt?: string }; links?: { text: string; url: string }[] }
  | { type: "plan"; intent: SwapIntent | RegisterIntent; plan: string[] }
  | { type: "awaiting_file" }
  | { type: "awaiting_input"; prompt: string };

/** ===== Helpers ===== */
const num = (s: string) => parseFloat(s.replace(/,/g, "."));
const pct = (s: string) => parseFloat(s.replace(/,/g, "."));

const RE_ADDR = /0x[a-fA-F0-9]{40}/;
const RE_AMOUNT = /(\d[\d.,]*)/;

/** ===== License Options ===== */
function getLicenseOptions(aiDetected: boolean = false): string[] {
  const options = [
    "Remix Allowed",
    "Commercial Use Allowed", 
    "Non-Commercial"
  ];
  
  if (!aiDetected) {
    options.push("AI Training Allowed");
  }
  
  return options;
}

function licenseToCode(license: string): { license: string; pilType: string } {
  switch (license) {
    case "Remix Allowed":
      return { license: "by", pilType: "commercial_remix" };
    case "Commercial Use Allowed":
      return { license: "arr", pilType: "commercial_use" };
    case "Non-Commercial":
      return { license: "by-nc", pilType: "non_commercial_remix" };
    case "AI Training Allowed":
      return { license: "cc0", pilType: "open_use" };
    default:
      return { license: "by", pilType: "commercial_remix" };
  }
}

/** ===== Token Parsing ===== */
function parseSwapTokens(text: string): { tokenIn?: string; tokenOut?: string; amount?: number } {
  const cleaned = text.trim().toLowerCase();
  
  // Try to parse various formats
  const patterns = [
    // "wip to usdc 1.5"
    /(\w+)\s+(?:to|>|→)\s+(\w+)\s+([\d.,]+)/i,
    // "1.5 wip to usdc"
    /([\d.,]+)\s+(\w+)\s+(?:to|>|→)\s+(\w+)/i,
    // "swap wip usdc 1.5"
    /swap\s+(\w+)\s+(\w+)\s+([\d.,]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (pattern === patterns[0]) {
        // token1 to token2 amount
        return {
          tokenIn: match[1].toUpperCase(),
          tokenOut: match[2].toUpperCase(),
          amount: num(match[3])
        };
      } else if (pattern === patterns[1]) {
        // amount token1 to token2
        return {
          tokenIn: match[2].toUpperCase(),
          tokenOut: match[3].toUpperCase(),
          amount: num(match[1])
        };
      } else {
        // swap token1 token2 amount
        return {
          tokenIn: match[1].toUpperCase(),
          tokenOut: match[2].toUpperCase(),
          amount: num(match[3])
        };
      }
    }
  }

  return {};
}

/** ===== Main Superlee Engine ===== */
export class SuperleeEngine {
  private context: SuperleeContext = {
    state: "awaiting_sup",
    flow: null
  };

  constructor() {
    this.reset();
  }

  reset() {
    this.context = {
      state: "awaiting_sup",
      flow: null
    };
  }

  getGreeting(): SuperleeResponse {
    return {
      type: "message",
      text: "Hey 👋, what do you want to do today? Choose one:",
      buttons: ["Register IP", "Swap Token"]
    };
  }

  processMessage(message: string, file?: File, aiDetectionResult?: { isAI: boolean; confidence: number }): SuperleeResponse {
    const cleaned = message.trim().toLowerCase();

    // Easter eggs only work in "awaiting_sup" state (before SUP is typed)
    if (this.context.state === "awaiting_sup") {
      // Special response for superlee token - only when not started yet
      if (cleaned.includes("superlee token") || cleaned.includes("token superlee")) {
        return {
          type: "message",
          text: "🪙 Looking for Superlee token info? Check it out here:",
          links: [
            {
              text: "View Superlee Token",
              url: "https://ip.world/token/0x53b3Cd3035feCa127172b84DC5B72a6ca9b9AAb9"
            }
          ]
        };
      }

      // Special responses for easter eggs - only when not started yet
      if (cleaned.includes("who is mushy") || cleaned.includes("mushy")) {
        return {
          type: "message",
          text: "Mushy? Oh, that's the best CM in the world, no doubt. 😎",
          image: {
            url: "https://cdn.builder.io/api/v1/image/assets%2F63395bcf097f453d9ecb84f69d3bcf7c%2F13e4207002674f1985b1c9ba838a17ba?format=webp&width=800",
            alt: "Mushy - The best CM in the world"
          }
        };
      }

      if (cleaned === "dimjink") {
        return {
          type: "message",
          text: "anjink 😂"
        };
      }
    } else {
      // After SUP is typed, easter eggs give warning
      if (cleaned.includes("who is mushy") || cleaned.includes("mushy") || cleaned === "dimjink" || cleaned.includes("superlee token") || cleaned.includes("token superlee")) {
        return {
          type: "message",
          text: "⚠️ Don't type randomly. Please follow the conversation flow!"
        };
      }
    }

    // Special handling for "Continue Registration" with file and AI results
    if (message.toLowerCase().includes("continue registration") && file && aiDetectionResult) {
      // Set up the register data with the provided file and AI results
      this.context.flow = "register";
      this.context.registerData = {
        file,
        aiDetected: aiDetectionResult.isAI,
        aiConfidence: aiDetectionResult.confidence
      };
      this.context.state = "register_awaiting_name";

      return {
        type: "awaiting_input",
        prompt: "Perfect! What should we call this IP? (Enter a title/name)"
      };
    }

    switch (this.context.state) {
      case "awaiting_sup":
        return this.handleSupTrigger(cleaned);

      case "greeting":
        return this.handleGreeting(cleaned);

      case "register_awaiting_file":
        if (file) {
          return this.handleFileUpload(file, aiDetectionResult);
        }
        return {
          type: "awaiting_file"
        };

      case "register_analyzing_ai":
        if (aiDetectionResult) {
          return this.handleAIAnalysisComplete(aiDetectionResult);
        }
        return {
          type: "message",
          text: "🔍 Analyzing image for AI detection..."
        };

      case "register_awaiting_name":
        if (message.toLowerCase().includes("continue") || message.toLowerCase().includes("lanjutkan")) {
          return {
            type: "awaiting_input",
            prompt: "Perfect! What should we call this IP? (Enter a title/name)"
          };
        }
        return this.handleNameInput(message);

      case "register_awaiting_description":
        return this.handleDescriptionInput(message);

      case "register_awaiting_license":
        return this.handleLicenseSelection(message);

      case "swap_awaiting_tokens":
        return this.handleTokenInput(message);

      case "swap_awaiting_amount":
        return this.handleAmountInput(message);

      default:
        return {
          type: "message",
          text: "⚠️ Don't type randomly. Please follow the instructions!"
        };
    }
  }

  private handleSupTrigger(message: string): SuperleeResponse {
    if (message === "sup") {
      this.context.state = "greeting";
      return {
        type: "message",
        text: "Hey! What can I help you with? 😊",
        buttons: ["Register IP", "Swap Token"]
      };
    }

    // If user types anything other than "SUP", give warning
    return {
      type: "message",
      text: "⚠️ Don't type randomly. Just type \"SUP\" to start!"
    };
  }

  private handleGreeting(message: string): SuperleeResponse {
    if (message.includes("register") || message.includes("ip")) {
      this.context.flow = "register";
      this.context.state = "register_awaiting_file";
      this.context.registerData = {};
      return {
        type: "message",
        text: "Alright, please upload your IP file.",
        buttons: ["Upload File"]
      };
    }

    if (message.includes("swap") || message.includes("token")) {
      this.context.flow = "swap";
      this.context.state = "swap_awaiting_tokens";
      this.context.swapData = {};
      return {
        type: "awaiting_input",
        prompt: "Which tokens do you want to swap? (e.g., 'WIP to USDC' or 'ETH > USDT')"
      };
    }

    // If user types something invalid, give warning instead of repeating greeting
    return {
      type: "message",
      text: "⚠️ Don't type randomly. Please choose one of the options above!",
      buttons: ["Register IP", "Swap Token"]
    };
  }

  private handleFileUpload(file: File, aiResult?: { isAI: boolean; confidence: number }): SuperleeResponse {
    if (!this.context.registerData) {
      this.context.registerData = {};
    }

    this.context.registerData.file = file;

    if (aiResult) {
      // AI detection sudah selesai, langsung proses
      return this.handleAIAnalysisComplete(aiResult);
    } else {
      // File baru diupload, tunggu AI detection
      this.context.state = "register_analyzing_ai";
      return {
        type: "message",
        text: "📁 File uploaded successfully!\n\n🔍 Analyzing image for AI detection... Please wait."
      };
    }
  }

  private handleAIAnalysisComplete(aiResult: { isAI: boolean; confidence: number }): SuperleeResponse {
    if (!this.context.registerData) {
      this.context.registerData = {};
    }

    this.context.registerData.aiDetected = aiResult.isAI;
    this.context.registerData.aiConfidence = aiResult.confidence;

    let response = `✅ AI analysis completed!\n\n`;

    if (aiResult.isAI) {
      response += `🤖 Result: This image was created by AI (confidence: ${(aiResult.confidence * 100).toFixed(1)}%)\n\n⚠️ Note: "AI Training Allowed" license option will not be available for AI-generated content.`;
    } else {
      response += `👨‍🎨 Result: This image was created manually/originally (confidence: ${((1 - aiResult.confidence) * 100).toFixed(1)}%)\n\n✅ All license options are available for this content.`;
    }

    this.context.state = "register_awaiting_name";
    return {
      type: "message",
      text: response,
      buttons: ["Continue Registration"]
    };
  }

  private handleNameInput(name: string): SuperleeResponse {
    if (!this.context.registerData) {
      this.context.registerData = {};
    }
    
    this.context.registerData.name = name.trim();
    this.context.state = "register_awaiting_description";
    
    return {
      type: "awaiting_input",
      prompt: "Give me a description of your IP."
    };
  }

  private handleDescriptionInput(description: string): SuperleeResponse {
    if (!this.context.registerData) {
      this.context.registerData = {};
    }
    
    this.context.registerData.description = description.trim();
    this.context.state = "register_awaiting_license";
    
    const aiDetected = this.context.registerData.aiDetected || false;
    const licenseOptions = getLicenseOptions(aiDetected);
    
    let message = "Which license type would you like to choose?\n\n";
    licenseOptions.forEach((option, index) => {
      message += `${index + 1}. ${option}\n`;
    });
    
    if (aiDetected) {
      message += "\n⚠️ Note: AI Training Allowed is not available for AI-generated content.";
    }
    
    return {
      type: "message",
      text: message,
      buttons: licenseOptions
    };
  }

  private handleLicenseSelection(license: string): SuperleeResponse {
    if (!this.context.registerData) {
      this.context.registerData = {};
    }
    
    const licenseInfo = licenseToCode(license);
    this.context.registerData.license = licenseInfo.license;
    this.context.registerData.pilType = licenseInfo.pilType;
    this.context.state = "register_ready";
    
    const intent: RegisterIntent = {
      kind: "register",
      title: this.context.registerData.name,
      prompt: this.context.registerData.description,
      license: licenseInfo.license as any,
      pilType: licenseInfo.pilType as any
    };
    
    const plan = [
      `Name IP : "${this.context.registerData.name}"`,
      `Description: "${this.context.registerData.description}"`,
      `License: ${license}`,
      `AI Detected: ${this.context.registerData.aiDetected ? 'Yes' : 'No'}`
    ];
    
    return {
      type: "plan",
      intent,
      plan
    };
  }

  private handleTokenInput(message: string): SuperleeResponse {
    const parsed = parseSwapTokens(message);
    
    if (!parsed.tokenIn || !parsed.tokenOut) {
      return {
        type: "awaiting_input",
        prompt: "Please specify both tokens. Example: 'WIP to USDC' or 'ETH > USDT'"
      };
    }

    if (!this.context.swapData) {
      this.context.swapData = {};
    }
    
    this.context.swapData.tokenIn = parsed.tokenIn;
    this.context.swapData.tokenOut = parsed.tokenOut;
    
    if (parsed.amount && parsed.amount > 0) {
      this.context.swapData.amount = parsed.amount;
      return this.prepareSwapPlan();
    }
    
    this.context.state = "swap_awaiting_amount";
    return {
      type: "awaiting_input",
      prompt: `How much ${parsed.tokenIn} do you want to swap?`
    };
  }

  private handleAmountInput(message: string): SuperleeResponse {
    const amount = num(message);
    
    if (!amount || amount <= 0) {
      return {
        type: "awaiting_input",
        prompt: "Please enter a valid amount (e.g., '1.5' or '100')"
      };
    }

    if (!this.context.swapData) {
      this.context.swapData = {};
    }
    
    this.context.swapData.amount = amount;
    return this.prepareSwapPlan();
  }

  private prepareSwapPlan(): SuperleeResponse {
    if (!this.context.swapData?.tokenIn || !this.context.swapData?.tokenOut || !this.context.swapData?.amount) {
      return {
        type: "awaiting_input",
        prompt: "Missing swap information. Please start over."
      };
    }

    const tokenInAddr = findTokenAddress(this.context.swapData.tokenIn);
    const tokenOutAddr = findTokenAddress(this.context.swapData.tokenOut);
    
    if (!tokenInAddr || !tokenOutAddr) {
      // Get available token symbols
      const availableTokens = ["WIP", "USDC", "WETH"]; // Add more as needed
      return {
        type: "awaiting_input",
        prompt: `Token not found. Supported tokens: ${availableTokens.join(", ")}`
      };
    }

    this.context.state = "swap_ready";
    
    const intent: SwapIntent = {
      kind: "swap",
      tokenIn: tokenInAddr,
      tokenOut: tokenOutAddr,
      amount: this.context.swapData.amount,
      slippagePct: this.context.swapData.slippagePct || 0.5
    };

    const plan = [
      `Swap ${this.context.swapData.amount} ${this.context.swapData.tokenIn} → ${this.context.swapData.tokenOut}`,
      `Slippage: ${intent.slippagePct}%`,
      "Get quote from PiperX Aggregator",
      "Approve token if needed",
      "Execute swap transaction",
      "Show transaction result"
    ];

    return {
      type: "plan",
      intent,
      plan
    };
  }

  getContext(): SuperleeContext {
    return this.context;
  }

  setContext(context: SuperleeContext) {
    this.context = context;
  }
}

export const superleeEngine = new SuperleeEngine();
