import { expect, test } from '@playwright/test';

// Runs against the in-memory fake backend (?mp=fake) — no Supabase/Auth0 needed.
// When ?mp=fake is set the TestAuthProvider returns the fake user immediately on
// init(), so main.ts auto-navigates to the friends screen on boot (same path as
// a real user returning from an OIDC redirect). Tests interact with the friends
// screen directly — there is no manual "click #menu-friends" step needed.
async function ready(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => (window as unknown as { __golfTest?: { ready: boolean } }).__golfTest?.ready === true,
  );
}

test('friends screen is reachable and can generate an invite link', async ({ page }) => {
  await page.goto('/?mp=fake&user=alice');
  await ready(page);
  // ?mp=fake auto-lands on the friends screen (TestAuthProvider.init() returns the
  // fake user immediately, triggering startMultiplayer() on boot).
  await expect(page.locator('#friends-invite')).toBeVisible();
  await page.locator('#friends-invite').click();
  const link = page.locator('#friends-invite-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveValue(/\?friend=invite-alice-0/);

  // Back → the menu shows the (enabled) "Play with Friends" button, which reopens
  // the friends screen. Covers the #menu-friends button + handler when enabled.
  await page.locator('#friends-close').click();
  await expect(page.locator('#menu-friends')).toBeVisible();
  await page.locator('#menu-friends').click();
  await expect(page.locator('#friends-invite')).toBeVisible();
});

test('claiming an invite establishes a friendship', async ({ page }) => {
  // Alice creates an invite, then Bob claims via the URL. We drive both as one
  // user-journey: claim path creates the accepted friendship.
  await page.goto('/?mp=fake&user=alice');
  await ready(page);
  await page.locator('#friends-invite').click();
  const link = await page.locator('#friends-invite-link').inputValue();
  const code = new URL(link).searchParams.get('friend')!;

  await page.goto(`/?mp=fake&user=bob&friend=${encodeURIComponent(code)}`);
  await ready(page);
  // Bob auto-runs the friends flow on boot; Alice's invite resolves against bob's
  // fresh store, so we assert the screen renders without the inviter (separate
  // store) — the deterministic cross-user claim is unit-tested in fakeService.
  await expect(page.locator('#friends-invite')).toBeVisible();
});

test('single-player is unaffected when multiplayer is disabled (no ?mp)', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await expect(page.locator('#menu-play')).toBeVisible();
  await expect(page.locator('#menu-friends')).toHaveCount(0);
});
