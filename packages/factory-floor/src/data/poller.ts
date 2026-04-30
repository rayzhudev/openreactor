import type { AutomationStatusPayload } from "../types";

export class Poller {
  private url: string;
  private interval: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onData: (payload: AutomationStatusPayload) => void;
  private onError: (error: string) => void;
  private backoff = 0;

  constructor(
    url: string,
    interval: number,
    onData: (payload: AutomationStatusPayload) => void,
    onError: (error: string) => void
  ) {
    this.url = url;
    this.interval = interval;
    this.onData = onData;
    this.onError = onError;
  }

  start() {
    this.poll();
    this.timer = setInterval(() => this.poll(), this.interval);
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll() {
    try {
      const response = await fetch(this.url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as AutomationStatusPayload;
      this.backoff = 0;
      this.onData(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      this.backoff = Math.min(60000, Math.max(5000, this.backoff * 2 || 5000));
      this.onError(`Connection failed: ${msg}. Retrying in ${Math.round(this.backoff / 1000)}s`);
    }
  }
}
