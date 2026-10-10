---
"@aliou/pi-neuralwatt": minor
---

Remove the built-in sub-bar integration. The `subBarIntegration` feature (live quota usage in the status bar) is no longer part of the package; it ships as a standalone one-off pi extension distributed as a GitHub gist (https://gist.github.com/aliou/9939544f3c5a4f917b0a8e5c0497cdb2) instead — installing the gist is now the opt-in. A config migration drops the dead `subBarIntegration` section and points users at the gist. The provider's internal quota events are unchanged, so the standalone bridge keeps working without any provider changes.
