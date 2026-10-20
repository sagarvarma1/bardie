import { people, type people_v1 } from "@googleapis/people";
import { googleClientFor } from "./oauth.js";

export interface ContactSummary {
  name: string;
  emails: string[];
  phones: string[];
}

const READ_MASK = "names,emailAddresses,phoneNumbers";

function summarize(person: people_v1.Schema$Person | undefined): ContactSummary | null {
  if (!person) return null;
  const emails = (person.emailAddresses ?? []).map((e) => e.value).filter((v): v is string => Boolean(v));
  const phones = (person.phoneNumbers ?? []).map((p) => p.value).filter((v): v is string => Boolean(v));
  const name = person.names?.[0]?.displayName ?? emails[0] ?? "";
  return name || emails.length || phones.length ? { name, emails, phones } : null;
}

/**
 * Searches saved contacts and "other contacts" (people the user has emailed
 * but never saved). The People API wants an empty warm-up search before the
 * first real one, or results can come back stale.
 */
export async function findContacts(userId: number, query: string): Promise<ContactSummary[]> {
  const api = people({ version: "v1", auth: googleClientFor(userId) });
  const [saved, other] = await Promise.all([
    api.people
      .searchContacts({ query: "", readMask: READ_MASK })
      .then(() => api.people.searchContacts({ query, readMask: READ_MASK, pageSize: 10 })),
    api.otherContacts
      .search({ query: "", readMask: READ_MASK })
      .then(() => api.otherContacts.search({ query, readMask: READ_MASK, pageSize: 10 })),
  ]);

  const results: ContactSummary[] = [];
  const seen = new Set<string>();
  for (const r of [...(saved.data.results ?? []), ...(other.data.results ?? [])]) {
    const c = summarize(r.person);
    const key = c && (c.emails[0] ?? c.phones[0] ?? c.name).toLowerCase();
    if (!c || !key || seen.has(key)) continue;
    seen.add(key);
    results.push(c);
  }
  return results.slice(0, 10);
}
