import type { PipRuntimeProfile } from "./pip";
import { assertRuntimeProfile } from "./pip-profile";

export interface RuntimeProfileStore {
  list(): Promise<PipRuntimeProfile[]>;
  read(profileId: string): Promise<PipRuntimeProfile | null>;
  save(profile: PipRuntimeProfile): Promise<void>;
  remove(profileId: string): Promise<void>;
}

const safeId = (profileId: string) => {
  if (!/^[a-z0-9_-]+$/.test(profileId)) throw new Error("Invalid runtime profile id");
  return profileId;
};

export class BrowserRuntimeProfileStore implements RuntimeProfileStore {
  constructor(private readonly prefix = "intent-map:runtime-profile:") {}

  async list() {
    const profiles: PipRuntimeProfile[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(this.prefix)) continue;
      const value = localStorage.getItem(key);
      if (value) profiles.push(assertRuntimeProfile(JSON.parse(value) as PipRuntimeProfile));
    }
    return profiles.sort((left, right) => left.profileId.localeCompare(right.profileId));
  }

  async read(profileId: string) {
    const value = localStorage.getItem(`${this.prefix}${safeId(profileId)}`);
    return value ? assertRuntimeProfile(JSON.parse(value) as PipRuntimeProfile) : null;
  }

  async save(profile: PipRuntimeProfile) {
    assertRuntimeProfile(profile);
    localStorage.setItem(`${this.prefix}${safeId(profile.profileId)}`, JSON.stringify(profile));
  }

  async remove(profileId: string) {
    localStorage.removeItem(`${this.prefix}${safeId(profileId)}`);
  }
}
