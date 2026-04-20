import { join } from "node:path";
import { type ExtensionAPI, getAgentDir } from "@mariozechner/pi-coding-agent";
import { getNeuralwattApiKey } from "../../lib/env";
import { fetchQuotas } from "../../utils/quotas";
import { QuotasComponent } from "./components/quotas-display";

function missingAuthMessage(): string {
  const authPath = join(getAgentDir(), "auth.json");
  return `Neuralwatt quota requires an API key. Add credentials to ${authPath} or set the NEURALWATT_API_KEY environment variable.`;
}

export function registerQuotasCommand(pi: ExtensionAPI): void {
  pi.registerCommand("neuralwatt:quota", {
    description: "Display Neuralwatt API usage and quota",
    handler: async (_args, ctx) => {
      const apiKey = await getNeuralwattApiKey(ctx.modelRegistry.authStorage);
      if (!apiKey) {
        ctx.ui.notify(missingAuthMessage(), "warning");
        return;
      }
      const key: string = apiKey;

      const result = await ctx.ui.custom<null>((tui, theme, _kb, done) => {
        const controller = new AbortController();
        const component = new QuotasComponent(
          theme,
          tui,
          () => {
            controller.abort();
            done(null);
          },
          () => {
            component.setState({ type: "loading" });
            tui.requestRender();
            void loadQuotas();
          },
        );

        async function loadQuotas(): Promise<void> {
          const fetchResult = await fetchQuotas(key, controller.signal);
          if (controller.signal.aborted) return;
          if (fetchResult.success) {
            component.setState({
              type: "loaded",
              quotas: fetchResult.data.quotas,
            });
          } else {
            component.setState({
              type: "error",
              message: fetchResult.error.message,
            });
          }
          tui.requestRender();
        }

        void loadQuotas();

        return {
          render: (width: number) => component.render(width),
          invalidate: () => component.invalidate(),
          handleInput: (data: string) => component.handleInput(data),
          dispose: () => {
            controller.abort();
            component.destroy();
          },
        };
      });

      // Non-interactive fallback (RPC, print, JSON modes)
      if (result === undefined) {
        const fetchResult = await fetchQuotas(key);
        if (!fetchResult.success) {
          ctx.ui.notify(
            JSON.stringify({ error: fetchResult.error.message }),
            "error",
          );
          return;
        }
        ctx.ui.notify(JSON.stringify(fetchResult.data.quotas), "info");
      }
    },
  });
}
