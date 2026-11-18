/** An expected failure whose message is safe to show to the user. */
export class RequestError extends Error {
  override name = 'RequestError';
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
