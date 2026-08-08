import { pb } from '../lib/pb';

export type FieldAssignment = {
  id: string;
  event: string;
  user: string;
  team: string;
  site: string;
  device?: string;
  status: string;
  expand?: {
    event?: { id: string; event_id: string; title: string; status: string; team_name?: string };
    team?: { id: string; code: string; name: string };
    site?: { id: string; code: string; name: string; habitat?: string };
    device?: { id: string; device_id: string; label: string };
  };
};

const cacheKey = (userId: string) => `biocorredor_assignment_${userId}`;

export function hasActiveLocalJourney(userId: string): boolean {
  try {
    const state = JSON.parse(localStorage.getItem(`biocorredor_journey_${userId}`) || '{}') as { status?: string };
    return state.status === 'active';
  } catch {
    return false;
  }
}

export async function loadCurrentAssignment(userId: string): Promise<FieldAssignment | null> {
  try {
    const result = await pb.collection('event_assignments').getList<FieldAssignment>(1, 1, {
      filter: `user = "${userId}" && status != "cancelled"`,
      // PocketBase 0.37.3 rejects sorting this collection by its generated `created` field.
      sort: '-id',
      expand: 'event,team,site,device',
    });
    const assignment = result.items[0] || null;
    if (assignment) localStorage.setItem(cacheKey(userId), JSON.stringify(assignment));
    return assignment;
  } catch {
    try { return JSON.parse(localStorage.getItem(cacheKey(userId)) || 'null') as FieldAssignment | null; } catch { return null; }
  }
}
