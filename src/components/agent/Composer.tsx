import React, { useRef, useEffect, useState } from "react";
import Image from "next/image";
import { useAccount } from "wagmi";
import { Send, X, Image as ImageIcon, Smile } from "lucide-react";

interface ComposerProps {
  onSubmit: (prompt: string) => void;
  status?: string;
  file?: File | null;
  onFileSelect?: (file: File) => void;
  onFileRemove?: () => void;
  previewUrl?: string | null;
  isTyping?: boolean;
  awaitingInput?: string | null;
  messages?: any[];
}

const EMOJI_SUGGESTIONS = ["👋", "😊", "🚀", "💎", "⚡", "🎯", "🔥", "✨"];

export function Composer({
  onSubmit,
  status,
  file,
  onFileSelect,
  onFileRemove,
  previewUrl,
  isTyping,
  awaitingInput,
  messages
}: ComposerProps) {
  const { isConnected } = useAccount();
  const [prompt, setPrompt] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleAutoGrow = (element: HTMLTextAreaElement) => {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };

  useEffect(() => {
    if (textareaRef.current) {
      handleAutoGrow(textareaRef.current);
    }
  }, [prompt]);

  // Check if the last message from SuperLee is asking for input
  const isLastMessageRequestingInput = () => {
    if (!messages || messages.length === 0) return false;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "agent") return false;

    const text = lastMessage.text.toLowerCase();

    // Pattern matching for input requests
    const inputPatterns = [
      /what is the name/i,
      /give me a description/i,
      /which tokens do you want/i,
      /how much .* do you want/i,
      /please enter/i,
      /please specify/i,
      /\?\s*$/  // Ends with question mark
    ];

    return inputPatterns.some(pattern => pattern.test(text));
  };

  // Auto-focus when SuperLee is waiting for input
  useEffect(() => {
    if (awaitingInput && textareaRef.current && isConnected) {
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [awaitingInput, isConnected]);

  // Auto-focus when SuperLee sends a message requesting input
  useEffect(() => {
    if (isLastMessageRequestingInput() && textareaRef.current && isConnected && !isTyping) {
      // Small delay to ensure UI is ready and typing animation is complete
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 1000); // Longer delay to wait for typing animation
      return () => clearTimeout(timer);
    }
  }, [messages, isConnected, isTyping]);

  // Auto-focus when greeting message with buttons appears (after "sup")
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === "agent" && lastMessage.buttons && lastMessage.buttons.length > 0) {
      // Check if this is the greeting message
      const isGreeting = lastMessage.text.includes("Hello!") || lastMessage.text.includes("Nice to meet you");

      if (isGreeting && textareaRef.current && isConnected && !isTyping) {
        // Focus after greeting message appears
        const timer = setTimeout(() => {
          textareaRef.current?.focus();
        }, 1200); // Slightly longer delay for greeting
        return () => clearTimeout(timer);
      }
    }
  }, [messages, isConnected, isTyping]);

  // Preserve focus when user has typed something
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // If user has text typed and clicks outside input, refocus after a short delay
      if (prompt.trim() && textareaRef.current && isConnected && !isTyping) {
        const target = e.target as Element;
        // Don't refocus if clicking on buttons or interactive elements
        if (!target.closest('button, a, input, select')) {
          setTimeout(() => {
            if (textareaRef.current && prompt.trim()) {
              textareaRef.current.focus();
            }
          }, 100);
        }
      }
    };

    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [prompt, isConnected, isTyping]);

  const handleSubmit = () => {
    const trimmedPrompt = prompt.trim();
    if ((!trimmedPrompt && !file) || !isConnected || isTyping) return;

    onSubmit(trimmedPrompt || "[File uploaded]");
    setPrompt("");
    setShowEmojiPicker(false);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };


  const addEmoji = (emoji: string) => {
    setPrompt(prev => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const canSend = isConnected && (prompt.trim().length > 0 || file) && !isTyping;

  return (
    <div className="shrink-0 border-t border-white/10 bg-gradient-to-t from-black/20 to-transparent relative overflow-visible">
      <div className="mx-auto w-full max-w-[900px] px-2 sm:px-3 lg:px-4 py-3 lg:py-4">
        {/* File Preview */}
        {file && previewUrl && (
          <div className="mb-3 p-3 rounded-2xl bg-white/8 border border-white/15 backdrop-blur-sm animate-slide-up hover-glow transition-smooth">
            <div className="flex items-start gap-3">
              <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                <Image
                  src={previewUrl}
                  alt="Preview"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {file.name}
                </div>
                <div className="text-xs text-white/60">
                  {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type}
                </div>
              </div>
              <button
                onClick={onFileRemove}
                className="p-1 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-bounce hover:scale-110"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="relative">
          <div className="flex items-end gap-2 rounded-2xl ring-1 ring-white/15 bg-white/8 backdrop-blur-md px-3 py-2 overflow-visible transition-smooth hover:ring-white/25 focus-within:ring-sky-400/50 focus-within:ring-2 hover-glow">


            {/* Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              className="flex-1 resize-none bg-transparent px-2 py-2 text-base placeholder:opacity-50 focus:outline-none scrollbar-invisible"
              placeholder={file ? "Add a message..." : "CHAT WITH SUPERLEE..."}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                handleAutoGrow(e.currentTarget);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={isTyping}
            />

            {/* Emoji Button */}
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-smooth hover-lift shrink-0"
                title="Add emoji"
              >
                <Smile className="h-5 w-5" />
              </button>

              {/* Emoji Picker */}
              {showEmojiPicker && (
                <div className="absolute bottom-full right-0 mb-2 p-3 bg-white/10 backdrop-blur-md border border-white/15 rounded-xl shadow-xl z-50 animate-scale-in">
                  <div className="grid grid-cols-4 gap-2">
                    {EMOJI_SUGGESTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => addEmoji(emoji)}
                        className="p-2 rounded-lg hover:bg-white/10 text-lg transition-bounce hover:scale-125"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Send button */}
            <button
              className={`relative z-10 p-2 rounded-xl transition-all duration-200 disabled:cursor-not-allowed shrink-0 ${
                canSend
                  ? "bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-400 hover:to-blue-400 text-white shadow-lg hover:shadow-xl hover:scale-105"
                  : "bg-white/10 text-white/50"
              }`}
              onClick={handleSubmit}
              disabled={!canSend}
              title={
                !isConnected
                  ? "Connect wallet to send"
                  : isTyping
                  ? "Assistant is typing..."
                  : (!prompt.trim() && !file)
                  ? "Type a message or attach a file"
                  : "Send (Enter or Ctrl/⌘+Enter)"
              }
            >
              <Send className="h-5 w-5" />
            </button>

            {/* Sprite mascot */}
            <Image
              src="/brand/superlee-sprite.png"
              alt=""
              width={48}
              height={48}
              priority
              className="pointer-events-none select-none pixelated animate-float absolute -top-3 -right-3 w-12 h-12 z-20 drop-shadow-[0_10px_28px_rgba(34,211,238,.35)]"
            />
          </div>


          {/* Status and shortcuts */}
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-white/50">
              {status ? (
                <span>{status}</span>
              ) : (
                <span>Press Enter to send • Shift+Enter for new line</span>
              )}
            </div>
            {!isConnected && (
              <div className="text-xs text-orange-400">
                Connect wallet to send messages
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
