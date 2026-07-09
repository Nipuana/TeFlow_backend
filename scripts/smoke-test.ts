/**
 * End-to-end smoke test. Boots the app on an ephemeral port and drives the real
 * HTTP surface with fetch, asserting both the happy path AND that the OWASP
 * defences actually reject abuse. Run with:  npm run smoke
 */
import assert from 'assert';
import type { AddressInfo } from 'net';
import { createApp } from '../src/app';

const app = createApp();
let base = '';

interface Res {
  status: number;
  json: any;
}

const req = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
};

let passed = 0;
const check = (label: string, cond: boolean): void => {
  assert.ok(cond, `FAILED: ${label}`);
  passed += 1;
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${label}`);
};

async function main(): Promise<void> {
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });

  const log = (s: string) => console.log(s); // eslint-disable-line no-console

  log('\nAuth + provisioning');
  const reg = await req('POST', '/api/v1/auth/register', {
    body: { email: 'alice@example.com', password: 'correcthorsebattery', name: 'Alice', orgName: 'Acme' },
  });
  check('register returns 201 with tokens', reg.status === 201 && Boolean(reg.json.accessToken));
  const alice = reg.json.accessToken as string;

  const me = await req('GET', '/api/v1/auth/me', { token: alice });
  check('GET /auth/me returns owner role', me.json.user.role === 'owner');
  check('unauthenticated request is rejected (API2)', (await req('GET', '/api/v1/auth/me')).status === 401);

  log('\nProjects + tasks (API1, API3)');
  const proj = await req('POST', '/api/v1/projects', { token: alice, body: { name: 'Website' } });
  check('create project 201', proj.status === 201);
  const projectId = proj.json.project.id as string;
  check('project orgId is server-set, not client-controlled (API1/API3)', proj.json.project.orgId === me.json.user.orgId);

  const task = await req('POST', `/api/v1/projects/${projectId}/tasks`, {
    token: alice,
    body: { title: 'Design homepage', priority: 'high' },
  });
  check('create task 201', task.status === 201 && task.json.task.status === 'todo');

  const massAssign = await req('POST', `/api/v1/projects/${projectId}/tasks`, {
    token: alice,
    body: { title: 'x', orgId: 'attacker-org', createdBy: 'someone-else' },
  });
  check('mass-assignment of orgId/createdBy is rejected (API3)', massAssign.status === 400);

  const bogus = '00000000-0000-4000-8000-000000000000';
  const idorProject = await req('GET', `/api/v1/projects/${bogus}`, { token: alice });
  check('accessing another/nonexistent object returns 404, not data (API1)', idorProject.status === 404);

  log('\nResource consumption (API4)');
  const tooMany = await req('POST', `/api/v1/projects/${projectId}/tasks/bulk`, {
    token: alice,
    body: { tasks: Array.from({ length: 51 }, (_, i) => ({ title: `t${i}` })) },
  });
  check('bulk create over the cap is rejected (API4)', tooMany.status === 400);

  log('\nFunction-level authz + step-up (API5, API6)');
  const upgradeNoStepUp = await req('POST', '/api/v1/billing/upgrade', { token: alice, body: { plan: 'pro' } });
  check('billing upgrade without step-up is forbidden (API6)', upgradeNoStepUp.status === 403);

  const stepUp = await req('POST', '/api/v1/auth/step-up', { token: alice, body: { password: 'correcthorsebattery' } });
  check('step-up re-auth succeeds', stepUp.status === 200 && Boolean(stepUp.json.accessToken));
  const aliceStepped = stepUp.json.accessToken as string;

  const upgradeOk = await req('POST', '/api/v1/billing/upgrade', { token: aliceStepped, body: { plan: 'pro' } });
  check('billing upgrade after step-up succeeds (API6)', upgradeOk.status === 200 && upgradeOk.json.plan === 'pro');

  log('\nSSRF guard (API7)');
  const metadata = await req('POST', '/api/v1/integrations/avatar-from-url', {
    token: alice,
    body: { url: 'http://169.254.169.254/latest/meta-data/' },
  });
  check('cloud metadata IP is blocked (API7)', metadata.status === 400);

  const localhost = await req('POST', '/api/v1/integrations/webhooks', {
    token: alice,
    body: { url: 'http://localhost:3000/hook', event: 'task.created' },
  });
  check('localhost/http webhook is blocked (API7)', localhost.status === 400);

  log('\nMulti-tenant isolation (API1)');
  const bob = await req('POST', '/api/v1/auth/register', {
    body: { email: 'bob@evil.com', password: 'anotherlongpassword', name: 'Bob', orgName: 'Evil' },
  });
  const crossTenant = await req('GET', `/api/v1/projects/${projectId}`, { token: bob.json.accessToken });
  check("another org's user cannot read Alice's project (API1)", crossTenant.status === 404);

  log('\nAccount provisioning + forced password change (roles)');
  const orgId = me.json.user.orgId as string;

  // Bob is an owner (of HIS org) so he passes function-level RBAC, but object-level
  // authz still stops him provisioning accounts inside Alice's org.
  const bobCreate = await req('POST', `/api/v1/orgs/${orgId}/members`, {
    token: bob.json.accessToken,
    body: { name: 'Mallory', email: 'mallory@acme.com', role: 'employee' },
  });
  check('a non-member cannot provision accounts in another org (API1)', bobCreate.status === 404 || bobCreate.status === 403);

  const mkManager = await req('POST', `/api/v1/orgs/${orgId}/members`, {
    token: alice,
    body: { name: 'Mia', email: 'mia@acme.com', role: 'manager' },
  });
  check(
    'owner provisions a manager account with a one-time temp password (201)',
    mkManager.status === 201 && typeof mkManager.json.temporaryPassword === 'string' && mkManager.json.temporaryPassword.length >= 10,
  );

  const mkEmployee = await req('POST', `/api/v1/orgs/${orgId}/members`, {
    token: alice,
    body: { name: 'Eli', email: 'eli@acme.com', role: 'employee' },
  });
  check('owner provisions an employee account (201)', mkEmployee.status === 201);
  const eliTemp = mkEmployee.json.temporaryPassword as string;
  const eliId = mkEmployee.json.member.userId as string;

  const dupOwner = await req('POST', `/api/v1/orgs/${orgId}/members`, {
    token: alice,
    body: { name: 'No', email: 'no@acme.com', role: 'owner' },
  });
  check('provisioning a second owner is rejected (API3 strict enum)', dupOwner.status === 400);

  const eliLogin = await req('POST', '/api/v1/auth/login', { body: { email: 'eli@acme.com', password: eliTemp } });
  check('provisioned account logs in with the temp password', eliLogin.status === 200 && Boolean(eliLogin.json.accessToken));
  let eliTok = eliLogin.json.accessToken as string;

  const eliMe = await req('GET', '/api/v1/auth/me', { token: eliTok });
  check(
    'provisioned account is flagged mustChangePassword with the assigned role',
    eliMe.json.user.mustChangePassword === true && eliMe.json.user.role === 'employee',
  );

  const changed = await req('POST', '/api/v1/auth/change-password', {
    token: eliTok,
    body: { currentPassword: eliTemp, newPassword: 'brandnewlongpassword' },
  });
  check('forced password change returns a fresh session (200)', changed.status === 200 && Boolean(changed.json.accessToken));
  eliTok = changed.json.accessToken as string;
  const eliMe2 = await req('GET', '/api/v1/auth/me', { token: eliTok });
  check('mustChangePassword is cleared after the change', eliMe2.json.user.mustChangePassword === false);

  log('\nProject visibility scoped by membership (API1)');
  const proj2 = await req('POST', '/api/v1/projects', { token: alice, body: { name: 'Secret initiative' } });
  const proj2Id = proj2.json.project.id as string;

  const eliListBefore = await req('GET', '/api/v1/projects?limit=100', { token: eliTok });
  check(
    'an employee does NOT see projects they are not a member of',
    Array.isArray(eliListBefore.json.data) && !eliListBefore.json.data.some((p: any) => p.id === proj2Id),
  );
  const eliGetBefore = await req('GET', `/api/v1/projects/${proj2Id}`, { token: eliTok });
  check('an employee gets 404 for a project they are not on (API1)', eliGetBefore.status === 404);

  const eliCreate = await req('POST', '/api/v1/projects', { token: eliTok, body: { name: 'nope' } });
  check('an employee cannot create projects — manager+ only (API5)', eliCreate.status === 403);

  const addEli = await req('POST', `/api/v1/projects/${proj2Id}/members`, { token: alice, body: { userId: eliId } });
  check('owner/manager adds the employee to the project team (201)', addEli.status === 201);

  const eliListAfter = await req('GET', '/api/v1/projects?limit=100', { token: eliTok });
  check(
    'the employee now sees the project they were added to',
    eliListAfter.json.data.some((p: any) => p.id === proj2Id),
  );
  const eliTask = await req('POST', `/api/v1/projects/${proj2Id}/tasks`, { token: eliTok, body: { title: 'Do the work' } });
  check('the employee can now create a task in their project', eliTask.status === 201);

  log(`\nAll ${passed} checks passed ✅`);
  process.exit(0);
}

main().catch((err: Error) => {
  // eslint-disable-next-line no-console
  console.error('\nSmoke test failed:', err.message);
  process.exit(1);
});
