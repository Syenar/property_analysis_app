export function createAbortError(message = 'The operation was aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

export function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

export function abortReason(signal, fallbackMessage = 'The operation was aborted') {
  if (!signal?.aborted) return null;
  if (signal.reason instanceof Error) return signal.reason;
  return createAbortError(typeof signal.reason === 'string' && signal.reason.trim() ? signal.reason : fallbackMessage);
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal);
}

export function rethrowIfAborted(error, signal) {
  if (signal?.aborted) throw abortReason(signal) || error;
  if (isAbortError(error)) throw error;
}
