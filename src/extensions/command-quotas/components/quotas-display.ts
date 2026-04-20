import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { Loader, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { NeuralwattQuotas } from "../../../types/quota-api";
import {
  renderCreditsTab,
  renderSubscriptionTab,
  renderUsageKeyTab,
} from "./quota-tabs";

type QuotasState =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "loaded"; quotas: NeuralwattQuotas };

export class QuotasComponent implements Component {
  private state: QuotasState = { type: "loading" };
  private theme: Theme;
  private tui: TUI;
  private onClose: () => void;
  private onRefetch: () => void;
  private loader: Loader | null = null;
  private activeTab = 0;

  constructor(
    theme: Theme,
    tui: TUI,
    onClose: () => void,
    onRefetch: () => void,
  ) {
    this.theme = theme;
    this.tui = tui;
    this.onClose = onClose;
    this.onRefetch = onRefetch;
    this.startLoader();
  }

  private startLoader(): void {
    this.loader = new Loader(
      this.tui,
      (s: string) => this.theme.fg("accent", s),
      (s: string) => this.theme.fg("muted", s),
      "Fetching quota...",
    );
  }

  destroy(): void {
    this.loader?.stop();
    this.loader = null;
  }

  setState(state: QuotasState): void {
    if (state.type === "loading") {
      this.loader?.stop();
      this.startLoader();
      this.activeTab = 0;
    } else if (this.state.type === "loading") {
      this.loader?.stop();
      this.loader = null;
    }
    this.state = state;
  }

  /** Build the list of active tab labels. */
  private tabs(): string[] {
    const hasSub =
      this.state.type === "loaded" && this.state.quotas.subscription !== null;
    return hasSub
      ? ["Subscription", "Credits", "Usage & Key"]
      : ["Credits", "Usage & Key"];
  }

  handleInput(data: string): boolean {
    if (matchesKey(data, "escape") || data === "q") {
      this.onClose();
      return true;
    }
    if (data === "r") {
      this.onRefetch();
      return true;
    }
    const tabCount = this.tabs().length;
    if (tabCount > 1) {
      if (data === "\t") {
        this.activeTab = (this.activeTab + 1) % tabCount;
        return true;
      }
      if (data === "\x1b[Z" || data === "\x1b[2Z") {
        this.activeTab = (this.activeTab - 1 + tabCount) % tabCount;
        return true;
      }
    }
    return false;
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const border = new DynamicBorder((s: string) => this.theme.fg("border", s));
    const contentWidth = Math.max(1, width - 4);

    lines.push(...border.render(width));
    lines.push(
      truncateToWidth(
        ` ${this.theme.fg("accent", this.theme.bold("Neuralwatt API Quota"))}`,
        width,
      ),
    );

    switch (this.state.type) {
      case "loading":
        if (this.loader) {
          lines.push(...this.loader.render(width));
        } else {
          lines.push(this.theme.fg("muted", "  Fetching quota..."));
        }
        break;
      case "error":
        lines.push(this.theme.fg("error", `  ${this.state.message}`));
        break;
      case "loaded": {
        const tabLines = this.renderLoaded(
          this.state.quotas,
          contentWidth,
          width,
        );
        lines.push(...tabLines);
        break;
      }
    }

    lines.push("");
    const hints = ["r refresh", "q/Esc close"];
    if (this.tabs().length > 1) hints.push("Tab/Shift+Tab switch tab");
    lines.push(this.theme.fg("dim", `  ${hints.join("  ")}`));
    lines.push(...border.render(width));

    return lines;
  }

  private renderLoaded(
    quotas: NeuralwattQuotas,
    contentWidth: number,
    maxWidth: number,
  ): string[] {
    const lines: string[] = [];
    const tabs = this.tabs();

    // Render tab bar with bg highlight on active tab
    lines.push("");
    const tabParts = tabs.map((label, idx) => {
      const fullLabel = ` ${label} `;
      if (idx === this.activeTab) {
        return this.theme.bg(
          "selectedBg",
          this.theme.fg("accent", this.theme.bold(fullLabel)),
        );
      }
      return this.theme.fg("dim", fullLabel);
    });
    lines.push(truncateToWidth(`  ${tabParts.join("  ")}`, maxWidth));

    // Render content for each tab, equalize heights, show active
    const allTabContent = tabs.map((label) => {
      if (label === "Subscription") {
        return renderSubscriptionTab(
          quotas,
          contentWidth,
          maxWidth,
          this.theme,
        );
      }
      if (label === "Credits") {
        return renderCreditsTab(quotas, contentWidth, maxWidth, this.theme);
      }
      // "Usage & Key"
      return renderUsageKeyTab(quotas, contentWidth, maxWidth, this.theme);
    });

    // Equalize tab heights so switching doesn't cause layout jumps
    const maxLen = Math.max(...allTabContent.map((t) => t.length));
    for (const tabLines of allTabContent) {
      while (tabLines.length < maxLen) tabLines.push("");
    }

    lines.push(...allTabContent[this.activeTab]);

    return lines;
  }

  invalidate(): void {}
}
