"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
};

type StreamEvent = {
  type: "reasoning" | "content";
  content: string;
};

const STORAGE_KEY = "lisa-conversations";
const ACTIVE_CONVERSATION_KEY = "lisa-active-conversation";

function createConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    messages: [],
  };
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] =
    useState<string>("");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedConversations = localStorage.getItem(STORAGE_KEY);
    const storedActiveId = localStorage.getItem(
      ACTIVE_CONVERSATION_KEY,
    );

    if (storedConversations) {
      const parsed = JSON.parse(
        storedConversations,
      ) as Conversation[];

      setConversations(parsed);

      if (
        storedActiveId &&
        parsed.some(
          (conversation) => conversation.id === storedActiveId,
        )
      ) {
        setActiveConversationId(storedActiveId);
        return;
      }

      if (parsed.length > 0) {
        setActiveConversationId(parsed[0].id);
        return;
      }
    }

    const conversation = createConversation();

    setConversations([conversation]);
    setActiveConversationId(conversation.id);
  }, []);

  useEffect(() => {
    if (conversations.length === 0) {
      return;
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(conversations),
    );
  }, [conversations]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    localStorage.setItem(
      ACTIVE_CONVERSATION_KEY,
      activeConversationId,
    );
  }, [activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [conversations, activeConversationId]);

  const activeConversation = conversations.find(
    (conversation) =>
      conversation.id === activeConversationId,
  );

  const createNewConversation = () => {
    const conversation = createConversation();

    setConversations((current) => [
      conversation,
      ...current,
    ]);

    setActiveConversationId(conversation.id);
    setInput("");
    setOpenMenuId(null);

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const deleteConversation = (conversationId: string) => {
    setConversations((current) => {
      const remaining = current.filter(
        (conversation) =>
          conversation.id !== conversationId,
      );

      if (remaining.length === 0) {
        const newConversation = createConversation();

        setActiveConversationId(newConversation.id);

        return [newConversation];
      }

      if (conversationId === activeConversationId) {
        setActiveConversationId(remaining[0].id);
      }

      return remaining;
    });

    setOpenMenuId(null);
    setInput("");
  };

  const updateAssistantMessage = (
    conversationId: string,
    content: string,
  ) => {
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        const messages = [...conversation.messages];
        const lastMessageIndex = messages.length - 1;

        if (
          lastMessageIndex < 0 ||
          messages[lastMessageIndex].role !== "assistant"
        ) {
          return conversation;
        }

        messages[lastMessageIndex] = {
          ...messages[lastMessageIndex],
          content,
        };

        return {
          ...conversation,
          messages,
        };
      }),
    );
  };

  const sendMessage = async () => {
    const message = input.trim();

    if (
      !message ||
      !activeConversation ||
      isLoading
    ) {
      return;
    }

    const conversationId = activeConversation.id;

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              title:
                conversation.messages.length === 0
                  ? message.slice(0, 40)
                  : conversation.title,
              messages: [
                ...conversation.messages,
                {
                  role: "user",
                  content: message,
                },
                {
                  role: "assistant",
                  content: "",
                },
              ],
            }
          : conversation,
      ),
    );

    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(
        "http://127.0.0.1:8008/api/v1/chat/stream",
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/x-ndjson",
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            message,
            enable_thinking: false,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Request failed with status ${response.status}`,
        );
      }

      if (!response.body) {
        throw new Error(
          "Response body is unavailable",
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let assistantResponse = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, {
          stream: true,
        });

        const lines = buffer.split("\n");

        // The final item may be an incomplete JSON object.
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmedLine = line.trim();

          if (!trimmedLine) {
            continue;
          }

          let event: StreamEvent;

          try {
            event = JSON.parse(
              trimmedLine,
            ) as StreamEvent;
          } catch (error) {
            console.error(
              "Failed to parse streaming event:",
              trimmedLine,
              error,
            );
            continue;
          }

          if (event.type === "reasoning") {
            // We will render reasoning separately later.
            continue;
          }

          if (event.type !== "content") {
            continue;
          }

          assistantResponse += event.content;

          updateAssistantMessage(
            conversationId,
            assistantResponse,
          );

          /*
           * Give the browser an opportunity to paint the
           * updated Markdown before processing more chunks.
           *
           * Without this, a fast stream can be consumed
           * continuously by JavaScript and the browser may
           * paint only after the stream has finished.
           */
          await waitForNextPaint();
        }
      }

      // Flush any remaining decoder bytes.
      buffer += decoder.decode();

      const finalLine = buffer.trim();

      if (finalLine) {
        try {
          const event = JSON.parse(
            finalLine,
          ) as StreamEvent;

          if (event.type === "content") {
            assistantResponse += event.content;

            updateAssistantMessage(
              conversationId,
              assistantResponse,
            );

            await waitForNextPaint();
          }
        } catch (error) {
          console.error(
            "Failed to parse final streaming event:",
            finalLine,
            error,
          );
        }
      }
    } catch (error) {
      console.error(error);

      updateAssistantMessage(
        conversationId,
        "Sorry, I couldn't reach LISA right now.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <main className="flex h-screen overflow-hidden bg-black text-zinc-100">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 md:flex">
        <div className="flex h-16 items-center px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-black">
              L
            </div>

            <span className="text-lg font-semibold tracking-tight">
              LISA
            </span>
          </div>
        </div>

        <div className="px-3">
          <button
            onClick={createNewConversation}
            className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 px-3 py-2.5 text-sm text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-white"
          >
            <span className="text-lg">+</span>
            New conversation
          </button>
        </div>

        <div className="mt-6 flex-1 overflow-y-auto px-3">
          <p className="px-2 text-xs font-medium uppercase tracking-wider text-zinc-600">
            Conversations
          </p>

          <div className="mt-3 space-y-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className="group relative"
              >
                <button
                  onClick={() => {
                    setActiveConversationId(
                      conversation.id,
                    );
                    setOpenMenuId(null);
                  }}
                  className={`w-full rounded-lg px-3 py-2 pr-10 text-left text-sm transition ${
                    conversation.id === activeConversationId
                      ? "bg-zinc-900 text-zinc-200"
                      : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                  }`}
                >
                  <span className="block truncate">
                    {conversation.title}
                  </span>
                </button>

                <button
                  onClick={(event) => {
                    event.stopPropagation();

                    setOpenMenuId((current) =>
                      current === conversation.id
                        ? null
                        : conversation.id,
                    );
                  }}
                  className={`absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 ${
                    openMenuId === conversation.id
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  }`}
                  aria-label="Conversation options"
                >
                  <span className="text-lg leading-none">
                    ⋯
                  </span>
                </button>

                {openMenuId === conversation.id && (
                  <div className="absolute right-1 top-10 z-20 w-32 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl shadow-black/50">
                    <button
                      onClick={() =>
                        deleteConversation(
                          conversation.id,
                        )
                      }
                      className="w-full rounded-md px-3 py-2 text-left text-sm text-red-400 transition hover:bg-zinc-800 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-zinc-800 p-3">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-300">
            <span>⚙</span>
            Settings
          </button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800 px-4 md:px-6">
          <div>
            <h1 className="text-sm font-medium text-zinc-200">
              {activeConversation?.title ?? "LISA"}
            </h1>

            <p className="text-xs text-zinc-600">
              Network Operations AI Assistant
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-zinc-800 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

            <span className="text-xs text-zinc-500">
              Online
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {!activeConversation ||
          activeConversation.messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-xl font-semibold">
                L
              </div>

              <h2 className="text-3xl font-semibold tracking-tight text-white">
                How can I help?
              </h2>

              <p className="mt-3 max-w-md text-center text-sm leading-6 text-zinc-500">
                Ask LISA about network operations,
                troubleshooting, configuration, or
                technical issues.
              </p>

              <div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                {[
                  "How do I troubleshoot firewall connectivity?",
                  "What should I check when BGP goes down?",
                  "How can I diagnose packet loss?",
                  "What logs should I check for a failed connection?",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setInput(prompt);
                      textareaRef.current?.focus();
                    }}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left text-sm text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
              <div className="space-y-8">
                {activeConversation.messages.map(
                  (message, index) => (
                    <div
                      key={index}
                      className={
                        message.role === "user"
                          ? "flex justify-end"
                          : "flex justify-start"
                      }
                    >
                      {message.role === "user" ? (
                        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-zinc-800 px-4 py-3 text-sm leading-6 text-zinc-100">
                          {message.content}
                        </div>
                      ) : (
                        <div className="max-w-[90%] text-sm leading-7 text-zinc-200">
                          <div className="prose prose-invert max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-200 prose-strong:text-zinc-100 prose-code:text-zinc-200 prose-pre:border prose-pre:border-zinc-800 prose-pre:bg-zinc-950 prose-li:text-zinc-200 prose-a:text-zinc-100 prose-table:text-zinc-200">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  ),
                )}

                {isLoading &&
                  activeConversation.messages.at(-1)
                    ?.role === "assistant" &&
                  activeConversation.messages.at(-1)
                    ?.content === "" && (
                    <div className="flex justify-start">
                      <div className="text-sm text-zinc-600">
                        LISA is thinking...
                      </div>
                    </div>
                  )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pb-5 md:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end rounded-2xl border border-zinc-800 bg-zinc-950 p-2 shadow-2xl shadow-black/50 transition focus-within:border-zinc-700">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) =>
                  setInput(event.target.value)
                }
                onKeyDown={handleKeyDown}
                placeholder="Message LISA..."
                rows={1}
                disabled={isLoading}
                className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
              />

              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
                aria-label="Send message"
              >
                ↑
              </button>
            </div>

            <p className="mt-2 text-center text-xs text-zinc-700">
              LISA can make mistakes. Verify important
              network operations.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}