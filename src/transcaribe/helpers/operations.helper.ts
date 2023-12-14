export const CONSTANTS = {
  tarifa: 3000,
};

export function setUTCDate(date: Date) {
  const offset = date.getTimezoneOffset(); // offset in minutes
  const offsetInMs = offset * 60 * 1000; // offset in milliseconds
  const utc = date.getTime() + offsetInMs; // utc timestamp
  const newDate = new Date(utc - 10 * 60 * 60 * 1000); // create new Date object for different city
  return newDate;
}
