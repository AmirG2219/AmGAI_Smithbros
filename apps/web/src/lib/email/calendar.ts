// Calendar invites for the consultation email: an .ics file (Apple, Outlook, most mail apps) plus
// one-click links for Google and Outlook.com.

export type CalendarEvent = {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description: string;
  location: string | null;
};

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines longer than 75 bytes must be folded per RFC 5545.
const fold = (line: string) => line.replace(/(.{1,73})/g, "$1\r\n ").replace(/\r\n $/, "");

export function icsFile(e: CalendarEvent) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Smith Bros Floors//Consultation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@smithbrosfloors`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${escIcs(e.title)}`,
    `DESCRIPTION:${escIcs(e.description)}`,
    ...(e.location ? [`LOCATION:${escIcs(e.location)}`] : []),
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Consultation in one hour",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return Buffer.from(lines.map(fold).join("\r\n") + "\r\n", "utf8");
}

export function calendarLinks(e: CalendarEvent) {
  const google = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(e.start)}/${stamp(e.end)}`,
    details: e.description,
    ...(e.location ? { location: e.location } : {}),
  });
  const outlook = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.title,
    startdt: e.start.toISOString(),
    enddt: e.end.toISOString(),
    body: e.description,
    ...(e.location ? { location: e.location } : {}),
  });
  return {
    google: `https://calendar.google.com/calendar/render?${google}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${outlook}`,
  };
}
