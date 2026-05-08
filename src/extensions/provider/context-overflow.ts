interface AssistantErrorLike {
  role: string;
  stopReason?: string;
  provider?: string;
  errorMessage?: string;
}

const NEURALWATT_CONTEXT_OVERFLOW_PATTERN =
  /request exceeds model'?s maximum context length/i;

/**
 * Normalize Neuralwatt context overflow errors so Pi's native overflow
 * compaction path can detect them and perform compact-and-retry.
 */
export function normalizeNeuralwattContextOverflowError<
  TMessage extends AssistantErrorLike,
>(message: TMessage, currentProvider?: string): TMessage | undefined {
  if (message.role !== "assistant") return;
  if (message.stopReason !== "error") return;
  if (message.provider !== "neuralwatt" && currentProvider !== "neuralwatt")
    return;

  const errorMessage = message.errorMessage ?? "";
  if (errorMessage.includes("context_length_exceeded")) return;
  if (!NEURALWATT_CONTEXT_OVERFLOW_PATTERN.test(errorMessage)) return;

  return {
    ...message,
    errorMessage: `context_length_exceeded: ${errorMessage}`,
  };
}
