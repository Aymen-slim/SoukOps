export interface ChannelButton {
  id: string;
  title: string; // max 20 chars on WhatsApp
}

export interface ChannelAdapter {
  sendText(conversationId: string, text: string): Promise<void>;
  sendImage(conversationId: string, mediaPath: string, caption?: string): Promise<void>;
  sendButtons(conversationId: string, text: string, buttons: ChannelButton[]): Promise<void>;
  sendLocationRequest(conversationId: string, text: string): Promise<void>;
  sendPinLink(conversationId: string, url: string, text: string): Promise<void>;
}
