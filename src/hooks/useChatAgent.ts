import { useState, useCallback, useEffect } from "react";
import { superleeEngine } from "@/lib/agent/superlee";
import type { Message, Plan, ChatState } from "@/types/agents";

export function useChatAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [status, setStatus] = useState<string>("");
  const [awaitingFile, setAwaitingFile] = useState<boolean>(false);
  const [awaitingInput, setAwaitingInput] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState<boolean>(false);

  // Load messages from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("superleeMessages");
      if (saved) {
        const loadedMessages = JSON.parse(saved);
        setMessages(loadedMessages);
      }
    } catch {
      // Ignore errors, start with empty chat
    }
  }, []);

  // Save messages to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem("superleeMessages", JSON.stringify(messages));
    } catch {
      // Ignore errors
    }
  }, [messages]);

  const showGreeting = useCallback(() => {
    const greeting = superleeEngine.getGreeting();
    if (greeting.type === "message") {
      setMessages([{
        role: "agent",
        text: greeting.text,
        ts: Date.now(),
        buttons: greeting.buttons
      }]);
    }
  }, []);

  const addMessage = useCallback((role: Message["role"], text: string, buttons?: string[]) => {
    setMessages((prev) => [...prev, { role, text, ts: Date.now(), buttons }]);
  }, []);

  const addCompleteMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateLastMessage = useCallback((updates: Partial<Message>) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[updated.length - 1] = { ...updated[updated.length - 1], ...updates };
      return updated;
    });
  }, []);

  const simulateTyping = useCallback((callback: () => void, delay = 800) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      callback();
    }, delay);
  }, []);

  const processPrompt = useCallback((prompt: string, file?: File, aiDetectionResult?: { isAI: boolean; confidence: number }) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    // Add user message
    addMessage("you", trimmedPrompt);
    setStatus("");
    setAwaitingFile(false);
    setAwaitingInput(null);

    // Simulate typing and then process
    simulateTyping(() => {
      // Process with Superlee engine
      const response = superleeEngine.processMessage(trimmedPrompt, file, aiDetectionResult);

      if (response.type === "message") {
        // Only add message if text is not empty (to handle silent responses)
        if (response.text.trim()) {
          // If response has image or links, use addCompleteMessage for full Message object
          if (response.image || response.links) {
            addCompleteMessage({
              role: "agent",
              text: response.text,
              ts: Date.now(),
              buttons: response.buttons,
              image: response.image,
              links: response.links
            });
          } else {
            // Use regular addMessage for text-only responses
            addMessage("agent", response.text, response.buttons);
          }
        }
        setCurrentPlan(null);
        return;
      }

      if (response.type === "awaiting_file") {
        setAwaitingFile(true);
        addMessage("agent", "Please upload your file to continue.");
        return;
      }

      if (response.type === "awaiting_input") {
        setAwaitingInput(response.prompt);
        addMessage("agent", response.prompt);
        return;
      }

      if (response.type === "plan") {
        // AI has a plan
        setCurrentPlan({
          type: response.intent.kind as "swap" | "register",
          steps: response.plan,
          intent: response.intent,
        });

        // Plan will be shown in PlanBox only, no need for chat message
      }
    });
  }, [addMessage, simulateTyping]);

  const clearPlan = useCallback(() => {
    setCurrentPlan(null);
    setStatus("");
  }, []);

  const updateStatus = useCallback((newStatus: string) => {
    setStatus(newStatus);
    simulateTyping(() => {
      addMessage("agent", `ℹ️ ${newStatus}`);
    }, 400);
  }, [addMessage, simulateTyping]);

  const newChat = useCallback(() => {
    superleeEngine.reset();
    setMessages([]);
    setCurrentPlan(null);
    setStatus("");
    setAwaitingFile(false);
    setAwaitingInput(null);
    setIsTyping(false);
    try {
      localStorage.removeItem("superleeMessages");
    } catch {
      // Ignore errors
    }
  }, []);

  const getEngineFile = useCallback(() => {
    return superleeEngine.getContext().registerData?.file;
  }, []);

  return {
    messages,
    currentPlan,
    status,
    awaitingFile,
    awaitingInput,
    isTyping,
    addMessage,
    addCompleteMessage,
    updateLastMessage,
    processPrompt,
    clearPlan,
    updateStatus,
    newChat,
    getEngineFile,
  };
}
