/**
 * Demo data seeder. Inserts one realistic, self-contained organization
 * (team + projects + tasks + comments + notifications) straight into MongoDB so
 * the UI can be eye-tested with lifelike content.
 *
 * It is ISOLATED: everything lives under a new "Northwind Labs" org, so it never
 * touches your other data (multi-tenant isolation means you only see this org's
 * content once you log in as its owner). Re-running wipes and re-seeds just this
 * org. After seeding, RESTART the backend so it hydrates the new rows.
 *
 *   npm run seed
 */
import crypto from 'crypto';
import { MongoClient } from 'mongodb';
import { config } from '../src/shared/config';
import { hashPassword } from '../src/shared/utils/password';
import { sealSecret } from '../src/shared/utils/secretBox';

const DEMO_PASSWORD = 'Password123!'; // every active demo account shares this
const ORG_NAME = 'Northwind Labs';
const EMAIL_DOMAIN = '@northwind.test';

const uuid = () => crypto.randomUUID();
/** ISO timestamp N minutes ago (for createdAt/updatedAt → nice "x ago" labels). */
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
/** UTC-midnight calendar date, offset in days from today (for start/due dates). */
const day = (offset: number) => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) + offset * 86_400_000).toISOString();
};

type Role = 'employee' | 'manager' | 'admin' | 'owner';
type Status = 'todo' | 'in_progress' | 'blocked' | 'done';
type Priority = 'low' | 'normal' | 'high' | 'critical';

async function main() {
  const client = new MongoClient(config.mongo.uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(config.mongo.db);
  const col = (n: string) => db.collection(n);
  const insert = async (name: string, docs: Array<Record<string, unknown> & { id: string }>) => {
    if (!docs.length) return;
    await col(name).insertMany(docs.map((d) => ({ _id: d.id as unknown as never, ...d })));
  };

  // ── Wipe any previous run of THIS demo org only ────────────────────────────
  const oldOrgs = await col('orgs').find({ name: ORG_NAME }).toArray();
  const oldOrgIds = oldOrgs.map((o) => (o.id as string) ?? String(o._id));
  if (oldOrgIds.length) {
    for (const c of ['memberships', 'projects', 'tasks', 'comments', 'notifications']) {
      await col(c).deleteMany({ orgId: { $in: oldOrgIds } });
    }
    await col('orgs').deleteMany({ id: { $in: oldOrgIds } });
  }
  await col('users').deleteMany({ email: { $regex: `${EMAIL_DOMAIN}$` } });

  const orgId = uuid();
  const now = new Date().toISOString();
  const hash = await hashPassword(DEMO_PASSWORD);

  // ── People ────────────────────────────────────────────────────────────────
  const people: Array<{ key: string; name: string; role: Role; bio?: string; pending?: boolean }> = [
    { key: 'ava', name: 'Ava Chen', role: 'owner', bio: 'Founder & product lead.' },
    { key: 'marcus', name: 'Marcus Reed', role: 'admin', bio: 'Operations & people ops.' },
    { key: 'priya', name: 'Priya Nair', role: 'manager', bio: 'Engineering manager.' },
    { key: 'diego', name: 'Diego Santos', role: 'manager', bio: 'Design & mobile lead.' },
    { key: 'lena', name: 'Lena Novak', role: 'employee', bio: 'Frontend engineer.' },
    { key: 'tom', name: 'Tom Baker', role: 'employee', bio: 'Backend engineer.' },
    { key: 'sara', name: 'Sara Kim', role: 'employee', bio: 'Product designer.' },
    { key: 'owen', name: 'Owen Wright', role: 'employee', pending: true }, // shows "pending setup"
  ];

  const uid: Record<string, string> = {};
  const userDocs: Array<Record<string, unknown> & { id: string }> = [];
  for (let i = 0; i < people.length; i += 1) {
    const p = people[i];
    const id = uuid();
    uid[p.key] = id;
    const createdAt = minsAgo(60 * 24 * (30 - i)); // joined over the last month
    userDocs.push({
      id,
      createdAt,
      updatedAt: createdAt,
      email: `${p.key}${EMAIL_DOMAIN}`,
      passwordHash: hash,
      name: p.name,
      orgId,
      role: p.role,
      mfaEnabled: false,
      bio: p.bio ?? '',
      mustChangePassword: Boolean(p.pending),
      // Pending accounts carry a re-viewable sealed temp password, like the real flow.
      ...(p.pending ? { tempPasswordEnc: sealSecret('Welcome-42xyz') } : {}),
    });
  }

  // ── Org + memberships ──────────────────────────────────────────────────────
  const orgDoc = { id: orgId, createdAt: minsAgo(60 * 24 * 31), updatedAt: now, name: ORG_NAME, ownerId: uid.ava, plan: 'pro', seats: 25 };
  const memberDocs = people.map((p, i) => ({
    id: uuid(),
    createdAt: minsAgo(60 * 24 * (30 - i)),
    updatedAt: now,
    orgId,
    userId: uid[p.key],
    role: p.role,
  }));

  // ── Projects (team = createdBy lead + members) ─────────────────────────────
  const projectDefs = [
    { key: 'web', name: 'Website Redesign', desc: 'Refresh the marketing site with the new brand system.', lead: 'priya', team: ['lena', 'sara', 'tom'], age: 26 },
    { key: 'mobile', name: 'Mobile App v2', desc: 'Rebuild the iOS/Android app on the new API.', lead: 'diego', team: ['owen', 'tom'], age: 20 },
    { key: 'data', name: 'Data Platform Migration', desc: 'Move analytics off the legacy warehouse.', lead: 'priya', team: ['tom', 'lena'], age: 14 },
    { key: 'growth', name: 'Q3 Growth Experiments', desc: 'Onboarding funnel and activation experiments.', lead: 'diego', team: ['sara'], age: 9 },
    { key: 'design', name: 'Internal Design System', desc: 'Shared component library and tokens.', lead: 'priya', team: ['sara', 'lena', 'owen'], age: 5 },
  ];
  const pid: Record<string, string> = {};
  const projectDocs = projectDefs.map((p) => {
    const id = uuid();
    pid[p.key] = id;
    const createdAt = minsAgo(60 * 24 * p.age);
    const memberIds = Array.from(new Set([uid[p.lead], ...p.team.map((t) => uid[t])]));
    return { id, createdAt, updatedAt: createdAt, orgId, name: p.name, description: p.desc, createdBy: uid[p.lead], memberIds };
  });

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const taskDocs: Array<Record<string, unknown> & { id: string }> = [];
  const tid: string[] = [];
  const addTask = (
    project: string,
    title: string,
    status: Status,
    priority: Priority,
    assignee: string | null,
    start: number,
    due: number,
    updatedMinsAgo: number,
    desc?: string,
  ) => {
    const id = uuid();
    tid.push(id);
    taskDocs.push({
      id,
      createdAt: minsAgo(updatedMinsAgo + 60 * 24),
      updatedAt: minsAgo(updatedMinsAgo),
      projectId: pid[project],
      orgId,
      title,
      ...(desc ? { description: desc } : {}),
      status,
      priority,
      ...(assignee ? { assigneeId: uid[assignee] } : {}),
      startDate: day(start),
      dueDate: day(due),
      createdBy: uid[projectDefs.find((p) => p.key === project)!.lead],
    });
    return id;
  };

  // Website Redesign
  addTask('web', 'Finalize homepage hero layout', 'done', 'high', 'sara', -20, -6, 60 * 20);
  addTask('web', 'Build responsive navigation', 'done', 'normal', 'lena', -14, -3, 60 * 30);
  const webApi = addTask('web', 'Wire up contact form to API', 'in_progress', 'high', 'lena', -4, 2, 42, 'Validation + SSRF-safe avatar fetch.');
  addTask('web', 'SEO metadata + sitemap', 'todo', 'normal', 'tom', 1, 6, 60 * 5);
  addTask('web', 'Accessibility audit (WCAG AA)', 'blocked', 'high', 'sara', -1, 3, 60 * 8, 'Blocked on final color tokens from design system.');
  addTask('web', 'Cross-browser QA pass', 'todo', 'low', null, 5, 10, 60 * 26);

  // Mobile App v2
  addTask('mobile', 'Auth flow with refresh rotation', 'in_progress', 'critical', 'tom', -3, 1, 90, 'Matches the web session model.');
  addTask('mobile', 'Push notification service', 'todo', 'high', 'owen', 2, 9, 60 * 12);
  addTask('mobile', 'Offline task caching', 'todo', 'normal', 'owen', 4, 14, 60 * 30);
  addTask('mobile', 'App icon & splash screens', 'done', 'low', 'diego', -12, -8, 60 * 40);
  addTask('mobile', 'Crash reporting integration', 'blocked', 'high', 'tom', -2, 4, 60 * 15, 'Waiting on vendor API keys.');

  // Data Platform Migration
  addTask('data', 'Schema mapping legacy → new', 'done', 'high', 'tom', -10, -2, 60 * 22);
  const dataEtl = addTask('data', 'Build incremental ETL jobs', 'in_progress', 'critical', 'tom', -3, 0, 55, 'Due today.');
  addTask('data', 'Backfill 18 months of events', 'todo', 'high', 'lena', 1, 7, 60 * 6);
  addTask('data', 'Dashboards parity check', 'todo', 'normal', 'lena', 6, 12, 60 * 33);

  // Q3 Growth Experiments
  addTask('growth', 'A/B test onboarding checklist', 'in_progress', 'high', 'sara', -2, 3, 120);
  addTask('growth', 'Activation email sequence', 'todo', 'normal', 'sara', 2, 8, 60 * 9);
  addTask('growth', 'Referral program spec', 'todo', 'low', null, 5, 15, 60 * 48);

  // Internal Design System
  addTask('design', 'Define color + spacing tokens', 'done', 'high', 'sara', -4, -1, 60 * 12);
  const dsButtons = addTask('design', 'Button + input components', 'in_progress', 'high', 'lena', -1, 4, 35);
  addTask('design', 'Document usage in Storybook', 'todo', 'normal', 'owen', 3, 9, 60 * 7);
  addTask('design', 'Dark/light theme audit', 'todo', 'normal', 'lena', 4, 11, 60 * 20);

  // ── Comments ────────────────────────────────────────────────────────────────
  const commentDocs = [
    { id: uuid(), createdAt: minsAgo(50), updatedAt: minsAgo(50), taskId: webApi, orgId, authorId: uid.priya, body: 'Remember to route the avatar fetch through the SSRF guard.' },
    { id: uuid(), createdAt: minsAgo(38), updatedAt: minsAgo(38), taskId: webApi, orgId, authorId: uid.lena, body: 'Done — it rejects internal addresses and non-image responses.' },
    { id: uuid(), createdAt: minsAgo(70), updatedAt: minsAgo(70), taskId: dataEtl, orgId, authorId: uid.tom, body: 'Incremental window is 15 min; backfill runs separately.' },
    { id: uuid(), createdAt: minsAgo(25), updatedAt: minsAgo(25), taskId: dsButtons, orgId, authorId: uid.sara, body: 'Loading + disabled states are in the spec now.' },
  ];

  // ── Notifications (per-user; owner Ava gets a lively feed) ──────────────────
  const notif = (userId: string, type: string, text: string, actorName: string | undefined, read: boolean, m: number, resourceId?: string) => ({
    id: uuid(),
    createdAt: minsAgo(m),
    updatedAt: minsAgo(m),
    userId,
    orgId,
    type,
    ...(actorName ? { actorName } : {}),
    text,
    ...(resourceId ? { resourceType: 'task', resourceId } : {}),
    read,
  });
  const notificationDocs = [
    notif(uid.ava, 'welcome', 'Welcome to Teflow — your workspace is ready.', undefined, true, 60 * 24 * 31),
    notif(uid.ava, 'comment', 'commented on "Wire up contact form to API"', 'Lena Novak', false, 38, webApi),
    notif(uid.ava, 'assigned', 'assigned you "Q3 roadmap review"', 'Marcus Reed', false, 90),
    notif(uid.ava, 'comment', 'commented on "Build incremental ETL jobs"', 'Tom Baker', true, 70, dataEtl),
    notif(uid.lena, 'assigned', 'assigned you "Button + input components"', 'Priya Nair', false, 35, dsButtons),
    notif(uid.tom, 'comment', 'commented on "Build incremental ETL jobs"', 'Priya Nair', false, 65, dataEtl),
    notif(uid.sara, 'assigned', 'assigned you "A/B test onboarding checklist"', 'Diego Santos', false, 120),
  ];

  // ── Write ───────────────────────────────────────────────────────────────────
  await insert('users', userDocs);
  await insert('orgs', [orgDoc]);
  await insert('memberships', memberDocs);
  await insert('projects', projectDocs);
  await insert('tasks', taskDocs);
  await insert('comments', commentDocs);
  await insert('notifications', notificationDocs);

  await client.close();

  /* eslint-disable no-console */
  console.log(`\n✅ Seeded "${ORG_NAME}"`);
  console.log(`   ${userDocs.length} users · ${projectDocs.length} projects · ${taskDocs.length} tasks · ${commentDocs.length} comments · ${notificationDocs.length} notifications\n`);
  console.log('   Log in as the OWNER to see everything:');
  console.log(`     email:    ava${EMAIL_DOMAIN}`);
  console.log(`     password: ${DEMO_PASSWORD}\n`);
  console.log('   Other accounts (same password): marcus (admin), priya/diego (managers), lena/tom/sara (employees).');
  console.log(`   owen${EMAIL_DOMAIN} is a "pending setup" account (temp password: Welcome-42xyz).\n`);
  console.log('   ⚠  RESTART the backend now so it loads the seeded data.\n');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err.message);
  process.exit(1);
});
