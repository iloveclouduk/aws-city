// Watch it done: an agent's task told as a short story the player can follow (src/ui/ActivityFeed.tsx TaskCard).
// Before: who will do what, where ("Sally will store your holiday photos in S3 Lake. Watch her walk there.") and a Watch
// button. During: the card mirrors the canvas, step by step. After: what was built, the one thing it teaches, what it
// paid and the next step; in the demo, where the task matches a practice template, "See it in Deploy" plans that stack
// (planDeploy) for the player to approve. Pure, so it's tested without React (tests/watch.test.ts).
import type { TaskView } from './store';
import { placeFor } from '@/world/places';
import { matchText, serviceById } from '@/world/taxonomy';

interface StoryDef {
  /** "store your holiday photos": what the agent will do, finishing "… in <place>". */
  will: string;
  /** The one thing to take away, in plain words (true of the service, not just the demo). */
  teaches: string;
  /** A practice template (shared/templates.json) that builds the real thing, offered after the task in the demo. */
  templateId?: string;
  /** The task an agent offers to do (the building card's "Do it for me"). */
  prompt: string;
}

/** The agents with a hand-written story (the demo's scripted tasks, src/backend/MockBackend.ts SCRIPTS). */
const STORIES: Record<string, StoryDef> = {
  s3: {
    will: 'store your holiday photos',
    teaches: 'S3 storage classes: files you rarely open can live somewhere cheaper, and old ones can move to the deep freeze on their own.',
    templateId: 'static-site',
    prompt: 'Store my holiday photos cheaply',
  },
  lambda: {
    will: 'set up code that runs each time a file arrives',
    teaches: 'Lambda runs your code only when something happens, so you pay nothing while it waits.',
    templateId: 'hello-api',
    prompt: 'Run code when a file is uploaded',
  },
  iam: {
    will: 'check who can do what in your account',
    teaches: 'Least privilege: give each person or app only the permissions it needs, and use roles instead of long-lived keys.',
    prompt: 'Who has permission to do what in my account?',
  },
  route53: {
    will: 'send visitors to the nearest copy of your site',
    teaches: 'Route 53 turns names into addresses, and can pick the fastest Region or fail over when one is down.',
    prompt: 'Point my domain name at the closest copy of my site',
  },
  dynamodb: {
    will: 'set up a table for your app’s data',
    teaches: 'A good partition key spreads your data out, so reads by key stay fast as the table grows.',
    templateId: 'dynamo-table',
    prompt: 'Make a DynamoDB table for my app’s users',
  },
  shield: {
    will: 'protect your site from a flood of traffic',
    teaches: 'Shield Standard protects every AWS customer from common network floods at no extra cost.',
    prompt: 'Protect my site from a traffic flood',
  },
  bedrock: {
    will: 'answer your question with a foundation model',
    teaches: 'Bedrock lets an app use foundation models, and ground their answers in your own documents.',
    prompt: 'Ask a foundation model a question',
  },
  ec2: {
    will: 'start a server in a private subnet',
    teaches: 'Keep servers in a private subnet and open only the ports they need.',
    prompt: 'Start a small server for my app',
  },
};

/** "Sally the Angler" → "Sally". */
export const firstName = (agentName: string) => agentName.split(' the ')[0];

export interface TaskStory {
  agentId: string;
  who: string;
  place: string;
  /** "Sally will store your holiday photos in S3 Lake." */
  framing: string;
  /** "Watch Sally walk there." */
  watch: string;
  teaches: string;
  templateId?: string;
}

/** The agent a task goes to: the one the plan named, else the one its words point at, else the concierge's default. */
export const taskAgent = (task: Pick<TaskView, 'agentId' | 'prompt'>) => task.agentId ?? matchText(task.prompt) ?? 'bedrock';

/** The story of a task (any agent: a hand-written one, else the building's own first lesson). */
export function taskStory(task: Pick<TaskView, 'agentId' | 'prompt'>): TaskStory {
  const agentId = taskAgent(task);
  const p = placeFor(agentId);
  const who = p ? firstName(p.agentName) : 'An agent';
  const place = p?.place ?? serviceById(agentId)?.name ?? 'town';
  const def = STORIES[agentId];
  const framing = def ? `${who} will ${def.will} in ${place}.` : `${who} will take this on at ${place}.`;
  const teaches = def?.teaches ?? p?.simple ?? p?.teaches[0] ?? '';
  return { agentId, who, place, framing, watch: `Watch ${who} walk there.`, teaches, ...(def?.templateId ? { templateId: def.templateId } : {}) };
}

/** What a building's agent offers to do for you ("Do it for me"), or undefined when it has no task of its own. */
export function agentOffer(serviceId: string): { prompt: string; story: string } | undefined {
  const def = STORIES[serviceId];
  const p = placeFor(serviceId);
  if (!def || !p) return undefined;
  return { prompt: def.prompt, story: `${firstName(p.agentName)} can ${def.will} in ${p.place}, and you can watch every step.` };
}

/** Where a task is: before it starts (framing), while it runs (live), or finished (result). */
export type TaskPhase = 'framing' | 'live' | 'result' | 'failed';
export function taskPhase(task: Pick<TaskView, 'status' | 'steps'>): TaskPhase {
  if (task.status === 'failed') return 'failed';
  if (task.status === 'done') return 'result';
  // The agent is still on its way (or not picked yet): the story so far is "who will do what".
  const started = task.steps.some((s, i) => i > 0 && s.status !== 'pending');
  return task.status === 'routing' || !started ? 'framing' : 'live';
}

/** The step the agent is on now (the running one, else the last finished), for the live line. */
export function liveStep(task: Pick<TaskView, 'steps'>) {
  const i = task.steps.findIndex((s) => s.status === 'running');
  const at = i >= 0 ? i : task.steps.map((s) => s.status).lastIndexOf('done');
  return at >= 0 ? { index: at, text: task.steps[at].text, of: task.steps.length } : undefined;
}

/** "+15 ⭐ S3 Lake, +5 ⭐ IAM Gatehouse", or the friendly daily-cap line when the building's paid tasks are used up today. */
export function paidLine(task: Pick<TaskView, 'paid' | 'capped'>): string | undefined {
  if (task.capped) return 'Today’s task stars here are used up: full stars again tomorrow.';
  if (!task.paid?.length) return undefined;
  return task.paid.map((x) => `+${x.stars} ⭐ ${placeFor(x.serviceId)?.place ?? x.serviceId}`).join(', ');
}
