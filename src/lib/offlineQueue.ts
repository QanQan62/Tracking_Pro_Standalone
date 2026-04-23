const QUEUE_KEY = 'track_offline_queue';

export interface OfflineAction {
  id: string;
  type: 'PROCESS_ORDERS' | 'UPDATE_CART_POSITION';
  payload: any;
  timestamp: number;
}

export function getOfflineQueue(): OfflineAction[] {
  if (typeof window === 'undefined') return [];
  try {
    const q = window.localStorage.getItem(QUEUE_KEY);
    return q ? JSON.parse(q) : [];
  } catch (error) {
    console.error('Error reading offline queue:', error);
    return [];
  }
}

export function addToOfflineQueue(action: Omit<OfflineAction, 'id' | 'timestamp'>) {
  const queue = getOfflineQueue();
  const newAction: OfflineAction = {
    ...action,
    id: Math.random().toString(36).substring(2, 10),
    timestamp: Date.now()
  };
  queue.push(newAction);
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Error writing to offline queue:', error);
  }
}

export function removeFromOfflineQueue(id: string) {
  const queue = getOfflineQueue();
  const newQueue = queue.filter(a => a.id !== id);
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
  } catch (error) {
    console.error('Error updating offline queue:', error);
  }
}

export function clearOfflineQueue() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(QUEUE_KEY);
  }
}
