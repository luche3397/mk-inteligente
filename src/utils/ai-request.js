export const AI_HISTORY_LIMIT = 20;

export const buildAiRequestPayload = ({ message, messages = [], attachments = [] }) => ({
  message,
  history: messages
    .slice(-AI_HISTORY_LIMIT)
    .filter((item) => (item?.role === 'user' || item?.role === 'assistant') && typeof item?.content === 'string')
    .map(({ role, content }) => ({ role, content })),
  attachments: attachments.map(({ type, mimeType, data }) => ({ type, mimeType, data })),
});
