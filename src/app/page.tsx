"use client";

import { useEffect, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
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

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const storedConversations = localStorage.getItem(STORAGE_KEY);
    const storedActiveId = localStorage.getItem(ACTIVE_CONVERSATION_KEY);

    if (storedConversations) {
      const parsed = JSON.parse(storedConversations) as Conversation[];

      setConversations(parsed);

      if (storedActiveId && parsed.some((c) => c.id === storedActiveId)) {
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
    if (conversations.length === 0) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(conversations),
    );
  }, [conversations]);

  useEffect(() => {
    if (!activeConversationId) return;

    localStorage.setItem(
      ACTIVE_CONVERSATION_KEY,
      activeConversationId,
    );
  }, [activeConversationId]);

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );

  const createNewConversation = () => {
    const conversation = createConversation();

    setConversations((current) => [
      conversation,
      ...current,
    ]);

    setActiveConversationId(conversation.id);
    setInput("");
  };

  const sendMessage = async () => {
    const message = input.trim();

    if (!message || !activeConversation || isLoading) {
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
              ],
            }
          : conversation,
      ),
    );

    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(
        "http://127.0.0.1:8008/api/v1/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            message,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: [
                  ...conversation.messages,
                  {
                    role: "assistant",
                    content: data.response,
                  },
                ],
              }
            : conversation,
        ),
      );
    } catch (error) {
      console.error(error);

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: [
                  ...conversation.messages,
                  {
                    role: "assistant",
                    content:
                      "Sorry, I couldn't reach LISA right now.",
                  },
                ],
              }
            : conversation,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <main className="flex h-screen overflow-hidden bg-black text-zinc-100">
      {/* Sidebar */}
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
              <button
                key={conversation.id}
                onClick={() =>
                  setActiveConversationId(conversation.id)
                }
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  conversation.id === activeConversationId
                    ? "bg-zinc-900 text-zinc-200"
                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                }`}
              >
                <span className="block truncate">
                  {conversation.title}
                </span>
              </button>
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

      {/* Main chat */}
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

        {/* Messages */}
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
                troubleshooting, configuration, or technical
                issues.
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
                    onClick={() => setInput(prompt)}
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
                      <div
                        className={
                          message.role === "user"
                            ? "max-w-[80%] rounded-2xl bg-zinc-800 px-4 py-3 text-sm leading-6 text-zinc-100"
                            : "max-w-[90%] whitespace-pre-wrap text-sm leading-7 text-zinc-300"
                        }
                      >
                        {message.content}
                      </div>
                    </div>
                  ),
                )}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="text-sm text-zinc-600">
                      LISA is thinking...
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 px-4 pb-5 md:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end rounded-2xl border border-zinc-800 bg-zinc-950 p-2 shadow-2xl shadow-black/50 transition focus-within:border-zinc-700">
              <textarea
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
              LISA can make mistakes. Verify important network
              operations.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}