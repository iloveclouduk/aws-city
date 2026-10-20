// AWS North Hall (shared/conference.json): the AWS North conference's talks, in our own words, one stage each. Each
// talk names the buildings it's about; passing its three-question check grows them (store.passTalk) once.
import data from '../../shared/conference.json' with { type: 'json' };

export interface TalkCheck {
  q: string;
  options: string[];
  answer: number;
  why: string;
}
export interface Talk {
  id: string;
  title: string;
  theme: 'agents' | 'careers' | 'saas' | 'delivery' | 'serverless';
  simple: string;
  summary: string;
  keyIdeas: string[];
  serviceIds: string[];
  check: TalkCheck[];
  workshopIds: string[];
  sources: string[];
}

export const EVENT: string = data.event;
export const TALKS = data.talks as Talk[];
export const talkById = (id: string) => TALKS.find((t) => t.id === id);
/** Stars a passed talk pays each of its buildings (once per talk). */
export const TALK_XP = 8;
/** Right answers out of three to pass. */
export const TALK_PASS = 2;
