export class EpubRslError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "EpubRslError";
    this.exitCode = exitCode;
  }
}
