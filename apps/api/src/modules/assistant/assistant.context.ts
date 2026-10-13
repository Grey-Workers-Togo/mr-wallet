import { ValidationAppError } from '../../common/errors/app-error';
import type { AccountsFacade } from '../accounts/accounts.facade';
import type { CategoriesFacade } from '../categories/categories.facade';
import type { UsersFacade } from '../users/users.facade';
import { AliasMapper } from './domain/aliases';
import type { ToolContext } from './tools/tool-definition';

export interface ContextFacades {
  users: UsersFacade;
  categories: CategoriesFacade;
  accounts: AccountsFacade;
}

function isIanaTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return timeZone !== '';
  } catch {
    return false;
  }
}

/**
 * Everything a tool may know about the caller, built server-side from the authenticated user id
 * (RG-AS3). The aliases are the only names that ever reach the provider (ADR-0016 §2, ADR-0019 §1).
 *
 * An invalid stored timezone fails closed: a wrong boundary would give a wrong figure, and a silent
 * UTC fallback is exactly that (docs/QUESTIONS.md, lot A0).
 */
export async function buildToolContext(facades: ContextFacades, userId: string, now: Date): Promise<ToolContext> {
  const user = await facades.users.findById(userId);
  if (!user) throw new ValidationAppError('USER_NOT_FOUND');
  if (!isIanaTimeZone(user.timezone)) throw new ValidationAppError('USER_TIMEZONE_INVALID');

  const locale = user.locale.toLowerCase().startsWith('en') ? 'en' : 'fr';
  const [categories, accounts] = await Promise.all([facades.categories.list(userId), facades.accounts.list(userId)]);

  return {
    userId,
    timeZone: user.timezone,
    locale,
    now,
    aliases: {
      categories: new AliasMapper(
        'c',
        categories.map((category) => ({ id: category.id, name: facades.categories.resolveName(category, locale) })),
      ),
      accounts: new AliasMapper(
        'a',
        accounts.filter((account) => !account.isArchived).map((account) => ({ id: account.id, name: account.name })),
      ),
    },
  };
}
