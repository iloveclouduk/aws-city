// Console Copilot: runs inside AWS console pages. The work happens in src/console/agent.ts (shared with the practice
// console, src/entrypoints/practice/, which imports it directly: extension pages can't take content scripts). It only
// acts while the player has started a Copilot task from the city, and only on console pages.
import { defineContentScript } from 'wxt/utils/define-content-script';
import { startCopilotAgent } from '@/console/agent';
import { isConsoleUrl } from '@/console/safety';

export type { CopilotMessage, StepResult } from '@/console/agent';

export default defineContentScript({
  matches: ['https://*.console.aws.amazon.com/*', 'https://console.aws.amazon.com/*'],
  runAt: 'document_idle',
  main() {
    if (!isConsoleUrl(location.href)) return;
    startCopilotAgent();
  },
});
