// A fresh id for each time the email form is opened. Kept in its own file so pages stay free of random calls.
export const newSendKey = () => crypto.randomUUID();
