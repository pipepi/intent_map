// Access tokens deliberately live outside RelationGraph so A5 export and undo history cannot capture them.
const sessions = new Map();
export const sessionFor = (terminalId) => sessions.get(terminalId);
export const setSession = (terminalId, session) => sessions.set(terminalId, session);
export const clearSession = (terminalId) => sessions.delete(terminalId);
export const clearSessions = () => sessions.clear();
