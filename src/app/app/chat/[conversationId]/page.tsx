import ChatWorkspace from "@/components/chat/ChatWorkspace";

type Props = {
  params: Promise<{ conversationId: string }>;
};

export default async function ConversationPage({ params }: Props) {
  const { conversationId } = await params;
  return <ChatWorkspace initialConversationId={conversationId} />;
}
