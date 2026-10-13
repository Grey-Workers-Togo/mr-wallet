import { describe, expect, it } from 'vitest';
import { updateMeSchema } from '../../../modules/users/dto/update-me.dto';
import { ianaTimeZone } from '../timezone.schema';

describe('ianaTimeZone', () => {
  it.each(['Africa/Porto-Novo', 'Africa/Lome', 'America/Argentina/Buenos_Aires', 'UTC'])('accepts %s', (name) => {
    expect(ianaTimeZone().safeParse(name).success).toBe(true);
  });

  it.each(['', 'Mars/Olympus', '+01:00', 'GMT+1 ', 'Africa/', '../etc/passwd', 'Paris'])('rejects %j', (name) => {
    expect(ianaTimeZone().safeParse(name).success).toBe(false);
  });

  it('is enforced on the profile update', () => {
    expect(updateMeSchema.safeParse({ timezone: 'Africa/Lome' }).success).toBe(true);
    expect(updateMeSchema.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(false);
  });
});
