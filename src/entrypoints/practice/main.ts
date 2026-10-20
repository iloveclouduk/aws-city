// The practice console page. Extension pages can't take content scripts, so it runs the Copilot's hands
// (src/console/agent.ts) itself, answering only messages meant for its own tab.
import { browser } from 'wxt/browser';
import { startCopilotAgent } from '@/console/agent';
import { mountPractice } from '@/console/practicePage';
import './style.css';

mountPractice(document);

let ownTab: number | undefined;
void browser.tabs
  ?.getCurrent?.()
  .then((t) => (ownTab = t?.id))
  .catch(() => {});
// tabs.sendMessage reaches only this tab (no id on the message); a broadcast fallback names the tab it's for.
startCopilotAgent((msg) => msg.practiceTabId === undefined || msg.practiceTabId === ownTab);
