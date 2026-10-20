// Spectrum Cloud user management. On Photon's free/Pro shared-pool plans every
// end user must be registered before they can text the bot; registration
// returns the pool number ("assignedPhoneNumber") that user should text.
// Mirrors the calls made by Hermes Agent's Photon plugin.

const SPECTRUM_HOST = "https://spectrum.photon.codes";

export interface PhotonUser {
  phoneNumber: string;
  assignedPhoneNumber?: string | null;
  [key: string]: unknown;
}

function authHeader(projectId: string, projectSecret: string): string {
  return "Basic " + Buffer.from(`${projectId}:${projectSecret}`).toString("base64");
}

async function request(projectId: string, projectSecret: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${SPECTRUM_HOST}/projects/${projectId}/users/`, {
    ...init,
    headers: {
      Authorization: authHeader(projectId, projectSecret),
      "Content-Type": "application/json",
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Photon ${init?.method ?? "GET"} users failed (${res.status}): ${body}`);
  return body ? JSON.parse(body) : {};
}

function unwrapList(data: unknown): PhotonUser[] {
  if (Array.isArray(data)) return data;
  const obj = data as Record<string, unknown>;
  for (const key of ["users", "data", "items"]) {
    if (Array.isArray(obj?.[key])) return obj[key] as PhotonUser[];
  }
  return [];
}

export async function listUsers(projectId: string, projectSecret: string): Promise<PhotonUser[]> {
  return unwrapList(await request(projectId, projectSecret));
}

/** Registers `phoneNumber` (E.164) if it isn't already, and returns the user. */
export async function registerUser(
  projectId: string,
  projectSecret: string,
  phoneNumber: string,
): Promise<{ user: PhotonUser; created: boolean }> {
  if (!/^\+\d{8,15}$/.test(phoneNumber)) {
    throw new Error(`Phone number must be E.164, e.g. +15551234567 (got ${phoneNumber})`);
  }
  const existing = (await listUsers(projectId, projectSecret)).find((u) => u.phoneNumber === phoneNumber);
  if (existing) return { user: existing, created: false };

  const data = (await request(projectId, projectSecret, {
    method: "POST",
    body: JSON.stringify({ type: "shared", phoneNumber }),
  })) as Record<string, unknown>;
  const user = (data.user ?? data.data ?? data) as PhotonUser;
  return { user, created: true };
}
