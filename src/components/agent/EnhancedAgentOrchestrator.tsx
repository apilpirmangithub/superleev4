import React, { useRef, useEffect, useCallback, useState } from "react";
import { usePublicClient } from "wagmi";
import { storyAeneid } from "@/lib/chains/story";
import { waitForTxConfirmation } from "@/lib/utils/transaction";
import { useChatAgent } from "@/hooks/useChatAgent";
import { useSwapAgent } from "@/hooks/useSwapAgent";
import { useRegisterIPAgent } from "@/hooks/useRegisterIPAgent";
import { useFileUpload } from "@/hooks/useFileUpload";
import { DEFAULT_LICENSE_SETTINGS } from "@/lib/license/terms";
import type { LicenseSettings } from "@/lib/license/terms";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { PlanBox } from "./PlanBox";
import { HistorySidebar } from "./HistorySidebar";
import { Toast } from "./Toast";
import { detectAI, fileToBuffer } from "@/services";
import type { Hex } from "viem";

export function EnhancedAgentOrchestrator() {
  const chatAgent = useChatAgent();
  const swapAgent = useSwapAgent();
  const registerAgent = useRegisterIPAgent();
  const fileUpload = useFileUpload();
  const publicClient = usePublicClient();
  
  const [toast, setToast] = useState<string | null>(null);
  const [aiDetectionResult, setAiDetectionResult] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedFile, setAnalyzedFile] = useState<File | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  
  const explorerBase = storyAeneid.blockExplorers?.default.url || "https://aeneid.storyscan.xyz";

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatAgent.messages]);

  // Auto-analyze AI when file is uploaded
  useEffect(() => {
    if (fileUpload.file && !isAnalyzing) {
      analyzeImageForChat();
    }
  }, [fileUpload.file]);

  const analyzeImageForChat = async () => {
    if (!fileUpload.file) return;

    setIsAnalyzing(true);
    setAiDetectionResult(null);

    // Add immediate loading message when starting analysis
    const loadingMessage = {
      role: "agent" as const,
      text: "Wait a moment, let me analyze if your image is AI generated or real",
      ts: Date.now(),
      isLoading: true
    };

    chatAgent.addCompleteMessage(loadingMessage);

    // Store file reference before removing preview
    const currentFile = fileUpload.file;
    setAnalyzedFile(currentFile);

    // Remove image preview immediately after upload
    setTimeout(() => {
      fileUpload.removeFile();
    }, 100);

    try {
      const buffer = await fileToBuffer(currentFile);
      const result = await detectAI(buffer);
      setAiDetectionResult({
        ...result,
        status: 'completed'
      });

      // Update loading message to show results
      const detectionText = result.isAI
        ? `Analysis complete! Your image is AI generated with ${((result.confidence || 0) * 100).toFixed(1)}% confidence.

Note: AI-generated images cannot be licensed for AI training purposes - it doesn't make sense to train AI with AI-generated content again!`
        : `Analysis complete! Your image appears to be real/human-made with ${((result.confidence || 0) * 100).toFixed(1)}% confidence.`;

      // Update the loading message to show results with continue button
      chatAgent.updateLastMessage({
        text: detectionText,
        isLoading: false,
        buttons: ["Continue Registration"]
      });
    } catch (error) {
      console.error('AI detection failed:', error);
      setAiDetectionResult({
        isAI: false,
        confidence: 0,
        status: 'failed'
      });

      // Update loading message to show error
      const errorText = "❌ Sorry, I couldn't analyze the image. But don't worry, you can still proceed with registration!";

      chatAgent.updateLastMessage({
        text: errorText,
        isLoading: false
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const executePlan = useCallback(async () => {
    if (!chatAgent.currentPlan) return;

    const plan = chatAgent.currentPlan;

    if (plan.type === "swap" && plan.intent.kind === "swap") {
      chatAgent.updateStatus("🔄 Executing swap...");

      const result = await swapAgent.executeSwap(plan.intent);

      if (result.success) {
        const successMessage = `Swap success ✅
From: ${plan.intent.tokenIn}
To: ${plan.intent.tokenOut}
Amount: ${plan.intent.amount}
Tx: ${result.txHash}
↗ View: ${explorerBase}/tx/${result.txHash}`;

        chatAgent.addMessage("agent", successMessage);
        setToast("Swap success ✅");
      } else {
        chatAgent.addMessage("agent", `Swap error: ${result.error}`);
        setToast("Swap error ❌");
      }
      
      chatAgent.clearPlan();
      swapAgent.resetSwap();
    }
    
    else if (plan.type === "register" && plan.intent.kind === "register") {
      if (!analyzedFile) {
        chatAgent.addMessage("agent", "❌ Please attach an image first!");
        setToast("Attach image first 📎");
        return;
      }

      chatAgent.updateStatus("📝 Registering IP...");

      // Use default license settings from the plan
      const licenseSettings: LicenseSettings = {
        ...DEFAULT_LICENSE_SETTINGS,
        pilType: plan.intent.pilType || DEFAULT_LICENSE_SETTINGS.pilType,
      };

      const result = await registerAgent.executeRegister(plan.intent, analyzedFile, licenseSettings);
      
      if (result.success) {
        // Show initial success with transaction link
        const submittedMessage = `Tx submitted ⏳\n↗ View: ${explorerBase}/tx/${result.txHash}`;
        chatAgent.addMessage("agent", submittedMessage);

        // Wait for confirmation
        try {
          chatAgent.updateStatus("Waiting for confirmation...");
          const confirmed = await waitForTxConfirmation(
            publicClient, 
            result.txHash as Hex,
            { timeoutMs: 90_000 }
          );

          if (confirmed) {
            const successText = `Register success ✅

Your image has been successfully registered as IP!

License Type: ${result.licenseType}
AI Detected: ${result.aiDetected ? 'Yes' : 'No'} (${((result.aiConfidence || 0) * 100).toFixed(1)}%)`;

            // Create message with image and links
            const message = {
              role: "agent" as const,
              text: successText,
              ts: Date.now(),
              image: result.imageUrl ? {
                url: result.imageUrl,
                alt: "Registered IP image"
              } : undefined,
              links: [
                {
                  text: `📋 View IP: ${result.ipId}`,
                  url: `https://aeneid.explorer.story.foundation/ipa/${result.ipId}`
                },
                {
                  text: `🔗 View Transaction: ${result.txHash}`,
                  url: `${explorerBase}/tx/${result.txHash}`
                }
              ]
            };

            chatAgent.addCompleteMessage(message);
            setToast("IP registered ✅");
          } else {
            chatAgent.updateStatus("Tx still pending on network. Check explorer.");
          }
        } catch {
          chatAgent.updateStatus("Tx still pending on network. Check explorer.");
        }
      } else {
        chatAgent.addMessage("agent", `Register error: ${result.error}`);
        setToast("Register error ❌");
      }
      
      chatAgent.clearPlan();
      registerAgent.resetRegister();
      setAnalyzedFile(null);
      setAiDetectionResult(null);
    }
  }, [
    chatAgent,
    swapAgent,
    registerAgent,
    analyzedFile,
    publicClient,
    explorerBase,
    aiDetectionResult
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = useCallback((buttonText: string) => {
    if (buttonText === "Upload File") {
      // Trigger file input
      fileInputRef.current?.click();
    } else {
      chatAgent.processPrompt(buttonText);
    }
  }, [chatAgent]);

  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      fileUpload.handleFileSelect(file);
      // Reset input for re-selection of same file
      event.target.value = '';
    }
  }, [fileUpload]);

  return (
    <div className="mx-auto max-w-[1400px] px-2 sm:px-4 md:px-6 overflow-x-hidden">
      <div className="flex flex-col lg:grid lg:grid-cols-[180px,1fr] gap-3 lg:gap-6 h-[calc(100vh-120px)] lg:h-[calc(100vh-180px)]">
        {/* History Sidebar - Hidden on mobile, shown on desktop */}
        <div className="hidden lg:block">
          <HistorySidebar
            messages={chatAgent.messages}
            onNewChat={chatAgent.newChat}
          />
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Header */}
          <div className="shrink-0 mb-3 lg:mb-4">
            <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 p-3 lg:p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center shadow-lg">
                  <span className="text-lg font-bold text-white">S</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">CHAT WITH SUPERLEE</div>
                </div>
              </div>

              {/* Mobile menu button for history */}
              <button
                onClick={chatAgent.newChat}
                className="lg:hidden p-2 rounded-lg bg-white/10 hover:bg-white/15 transition-colors"
                title="New Chat"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>

          {/* Chat Content */}
          <section className="flex-1 rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex flex-col min-h-0">
            {/* Messages Area */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto scrollbar-invisible"
            >
              <div className="mx-auto w-full max-w-[900px] px-2 sm:px-3 lg:px-4 py-3 lg:py-4">
                <MessageList
                  messages={chatAgent.messages}
                  onButtonClick={handleButtonClick}
                  isTyping={chatAgent.isTyping}
                />


                {/* Plan Box */}
                {chatAgent.currentPlan && (
                  <PlanBox
                    plan={chatAgent.currentPlan}
                    onConfirm={executePlan}
                    onCancel={chatAgent.clearPlan}
                    swapState={swapAgent.swapState}
                    registerState={registerAgent.registerState}
                  />
                )}
              </div>
            </div>

            {/* Composer */}
            <div className="shrink-0">
              <Composer
                onSubmit={(prompt) => chatAgent.processPrompt(prompt, fileUpload.file || undefined, aiDetectionResult)}
                status={chatAgent.status}
                file={fileUpload.file}
                onFileSelect={fileUpload.handleFileSelect}
                onFileRemove={fileUpload.removeFile}
                previewUrl={fileUpload.previewUrl}
                isTyping={chatAgent.isTyping}
                awaitingInput={chatAgent.awaitingInput}
                messages={chatAgent.messages}
              />
            </div>
          </section>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {/* Toast Notifications */}
      <Toast
        message={toast}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
