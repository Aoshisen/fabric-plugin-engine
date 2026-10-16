export class Lifecycle {
  private disposed = false;

  get isDestroyed(): boolean {
    return this.disposed;
  }

  run(teardown: () => void): void {
    if (this.disposed) return;
    this.disposed = true;
    teardown();
  }
}
