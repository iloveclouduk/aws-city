import { bus } from './bus';
import { taskById } from '@/world/clients';
import { useCity } from './store';

/**
 * A walk asked for from a mini-game, an HQ or the world map (a game's end card, the To-do list) goes back to the city
 * first, so the player sees Kai walk (the city wakes at once: createGame's view sync). Not from a first run's world map,
 * where no city is picked yet.
 */
function backToCity() {
  const s = useCity.getState();
  if (s.view.name === 'city' || (s.view.name === 'world' && !s.prefs.region)) return;
  s.setView({ name: 'city' });
}

/**
 * Kai walks to a landmark and a quest's visit step counts when he gets there (CityScene's `walkTo`). When the city
 * can't walk him (asleep behind a game or an HQ), the visit counts at once, so a quest never waits on a scene that
 * isn't running.
 */
export function walkTo(id: string) {
  backToCity();
  let taken = false;
  bus.emit('walkTo', { id, accept: () => (taken = true) });
  if (taken) return;
  useCity.getState().select(id);
  useCity.getState().arrive(id);
}

/**
 * City Clients: Kai walks to the station of a side job (its business's site, src/world/clients.ts) and the job opens
 * when he gets there. A station out on the landscape ring (no walking out there) is reached at the city gate while the
 * camera looks at it; a city that can't walk him (asleep behind a game or an HQ) opens the job at once.
 */
export function walkToStation(taskId: string) {
  const ref = taskById(taskId);
  if (!ref) return;
  const open = () => useCity.getState().openClientTask(taskId);
  backToCity();
  let taken = false;
  bus.emit('walkToStation', { clientId: ref.client.id, station: ref.task.station, accept: () => (taken = true), arrived: open });
  if (!taken) open();
}
