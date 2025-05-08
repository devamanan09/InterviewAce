import type { StoredInterviewSession } from './types';

const SESSIONS_STORAGE_KEY = 'interviewAceSessions';

export function saveSessionToLocalStorage(session: StoredInterviewSession): void {
  try {
    const existingSessions = getSessionsFromLocalStorage();
    const updatedSessions = [session, ...existingSessions]; // Add new session to the beginning
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updatedSessions.slice(0, 20))); // Limit to 20 sessions
  } catch (error) {
    console.error("Error saving session to local storage:", error);
    // Potentially show a toast to the user
  }
}

export function getSessionsFromLocalStorage(): StoredInterviewSession[] {
  try {
    const sessionsJson = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (sessionsJson) {
      const sessions = JSON.parse(sessionsJson) as StoredInterviewSession[];
      // Ensure dates are Date objects if needed, though for display ISO string is fine.
      // For simplicity, we assume they are stored and retrieved as ISO strings.
      return sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return [];
  } catch (error) {
    console.error("Error retrieving sessions from local storage:", error);
    return [];
  }
}

export function getSessionByIdFromLocalStorage(id: string): StoredInterviewSession | undefined {
  try {
    const sessions = getSessionsFromLocalStorage();
    return sessions.find(session => session.id === id);
  } catch (error) {
    console.error("Error retrieving session by ID from local storage:", error);
    return undefined;
  }
}

export function deleteSessionFromLocalStorage(id: string): void {
  try {
    const existingSessions = getSessionsFromLocalStorage();
    const updatedSessions = existingSessions.filter(session => session.id !== id);
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updatedSessions));
  } catch (error) {
    console.error("Error deleting session from local storage:", error);
  }
}
