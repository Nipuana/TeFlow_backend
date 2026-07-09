import crypto from 'crypto';
import { MongoClient, type Db, type Collection as MongoColl } from 'mongodb';
import type { BaseDoc } from '../types';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Persistence ADAPTER — MongoDB with an in-memory mirror.
 *
 * The repository *port* (the `Collection` interface) is synchronous, and the
 * services/repositories all call it synchronously. To back that with MongoDB
 * without rewriting every layer to be async, this adapter keeps an in-memory
 * MIRROR of each collection:
 *
 *   - On boot, `connectMongo()` HYDRATES every mirror from its Mongo collection.
 *   - Reads are served from the mirror (synchronous, consistent within the process).
 *   - Writes update the mirror synchronously AND are WRITTEN THROUGH to Mongo on
 *     a serialized queue, so data survives restarts and shows up in your DB.
 *
 * This preserves the hexagonal seam: the interface is unchanged, so no module
 * code changes — only this file plus the startup hook in server.ts. When Mongo
 * is not connected (e.g. the in-process smoke test that never calls
 * connectMongo), the mirror simply behaves as a pure in-memory store.
 */
export interface Collection<T extends BaseDoc> {
  readonly name: string;
  insert(doc: Record<string, unknown>): T;
  findById(id: string): T | undefined;
  findOne(predicate: (doc: T) => boolean): T | undefined;
  find(predicate?: (doc: T) => boolean): T[];
  update(id: string, patch: Record<string, unknown>): T | undefined;
  delete(id: string): boolean;
  clear(): void;
}

interface Registered {
  name: string;
  store: Map<string, BaseDoc>;
}

// Documents are keyed by our own UUID string, stored as Mongo's `_id`.
type DbDoc = { _id: string } & Record<string, unknown>;

const registry: Registered[] = [];
let client: MongoClient | null = null;
let db: Db | null = null;
let connected = false;
// Serialize write-through so operations persist in order and never overlap.
let writeChain: Promise<unknown> = Promise.resolve();

function persist(name: string, op: (coll: MongoColl<DbDoc>) => Promise<unknown>): void {
  if (!connected || !db) return; // no Mongo (e.g. smoke test) → mirror-only
  const coll = db.collection<DbDoc>(name);
  writeChain = writeChain
    .then(() => op(coll))
    .catch((err: Error) => logger.error('mongo_write_failed', { name, err: err.message }));
}

export function createCollection<T extends BaseDoc>(name: string): Collection<T> {
  const store = new Map<string, T>();
  registry.push({ name, store: store as unknown as Map<string, BaseDoc> });
  const clone = (doc: T | undefined): T | undefined => (doc == null ? doc : (structuredClone(doc) as T));

  return {
    name,

    insert(doc) {
      const id = (doc.id as string) || crypto.randomUUID();
      const now = new Date().toISOString();
      const record = { createdAt: now, updatedAt: now, ...doc, id } as T;
      store.set(id, record);
      persist(name, (c) => c.replaceOne({ _id: id }, { _id: id, ...record } as DbDoc, { upsert: true }));
      return structuredClone(record);
    },

    findById(id) {
      return clone(store.get(id));
    },

    findOne(predicate) {
      for (const doc of store.values()) {
        if (predicate(doc)) return clone(doc);
      }
      return undefined;
    },

    find(predicate) {
      const all = [...store.values()];
      const filtered = predicate ? all.filter(predicate) : all;
      return filtered.map((d) => structuredClone(d));
    },

    update(id, patch) {
      const existing = store.get(id);
      if (!existing) return undefined;
      const updated = { ...existing, ...patch, id, updatedAt: new Date().toISOString() } as T;
      store.set(id, updated);
      persist(name, (c) => c.replaceOne({ _id: id }, { _id: id, ...updated } as DbDoc, { upsert: true }));
      return structuredClone(updated);
    },

    delete(id) {
      const ok = store.delete(id);
      if (ok) persist(name, (c) => c.deleteOne({ _id: id }));
      return ok;
    },

    clear() {
      store.clear();
      persist(name, (c) => c.deleteMany({}));
    },
  };
}

/** Connect to MongoDB and hydrate every registered mirror. Call before listen. */
export async function connectMongo(): Promise<void> {
  client = new MongoClient(config.mongo.uri, { serverSelectionTimeoutMS: 4000 });
  try {
    await client.connect();
    await client.db(config.mongo.db).command({ ping: 1 });
  } catch (err) {
    throw new Error(
      `Cannot reach MongoDB at ${config.mongo.uri}. Is mongod running? (${(err as Error).message})`,
    );
  }
  db = client.db(config.mongo.db);

  let total = 0;
  for (const { name, store } of registry) {
    const docs = await db.collection(name).find({}).toArray();
    for (const doc of docs) {
      const { _id, ...rest } = doc as Record<string, unknown>;
      const obj = { ...rest, id: (rest.id as string) ?? String(_id) } as BaseDoc;
      store.set(obj.id, obj);
      total += 1;
    }
  }
  connected = true;
  logger.info('mongo_connected', { db: config.mongo.db, collections: registry.length, documents: total });
}

/** Flush pending writes and close the connection (graceful shutdown). */
export async function disconnectMongo(): Promise<void> {
  await writeChain.catch(() => undefined);
  if (client) await client.close();
  connected = false;
}
