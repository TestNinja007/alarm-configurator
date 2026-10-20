import pg from 'pg';

/**
 * Where generated audio is kept.
 *
 * An interface with two implementations, because the two kinds of test this
 * service has want different things. Contract tests and unit tests check the
 * HTTP behaviour and run in a CI job with no database at all, so they use the
 * in-memory store. The database layer checks what is really stored, against
 * PostgreSQL. Neither is a stand-in for the other: the memory store makes no
 * claim about persistence, and the pytest layer makes none about the contract.
 */

export interface StoredAudio {
  id: string;
  provider: string;
  voice: string;
  text: string;
  contentType: string;
  bytes: Buffer;
}

export interface AudioStore {
  find(id: string): Promise<StoredAudio | undefined>;
  /** Idempotent: storing an id that already exists leaves the first copy. */
  save(audio: StoredAudio): Promise<void>;
  /** Whether the store can be reached, for the health check. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/* ------------------------------------------------------------ memory ----- */

export class MemoryAudioStore implements AudioStore {
  private readonly items = new Map<string, StoredAudio>();

  async find(id: string): Promise<StoredAudio | undefined> {
    return this.items.get(id);
  }

  async save(audio: StoredAudio): Promise<void> {
    if (!this.items.has(audio.id)) this.items.set(audio.id, audio);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.items.clear();
  }

  /** For tests: how many distinct pieces of audio have been stored. */
  get size(): number {
    return this.items.size;
  }
}

/* ---------------------------------------------------------- postgres ----- */

/**
 * The real store, confined to this service's own schema.
 *
 * `search_path` is set on every connection, so every unqualified table name in
 * this file means the speech schema and nothing else. That is the whole of the
 * isolation from the main API's data - by convention and by test, since both
 * connect as the same role. See "Data: schema per service" in CLAUDE.md.
 */
export class PostgresAudioStore implements AudioStore {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string, schema: string) {
    // Validated rather than interpolated blindly, since it ends up in a
    // connection option.
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
      throw new Error(`The speech schema name must be a plain identifier, not "${schema}".`);
    }
    this.pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5_000,
      options: `-c search_path=${schema}`,
    });
  }

  async find(id: string): Promise<StoredAudio | undefined> {
    const result = await this.pool.query<{
      id: string;
      provider: string;
      voice: string;
      text: string;
      content_type: string;
      bytes: Buffer;
    }>(
      'SELECT id, provider, voice, text, content_type, bytes FROM speech_audio WHERE id = $1',
      [id],
    );
    const row = result.rows[0];
    if (!row) return undefined;

    // Touched so entries nobody plays can be identified and cleared later.
    await this.pool.query('UPDATE speech_audio SET last_used_at = now() WHERE id = $1', [id]);

    return {
      id: row.id,
      provider: row.provider,
      voice: row.voice,
      text: row.text,
      contentType: row.content_type,
      bytes: row.bytes,
    };
  }

  async save(audio: StoredAudio): Promise<void> {
    await this.pool.query(
      `INSERT INTO speech_audio
              (id, provider, voice, text, content_type, bytes, created_at, last_used_at)
            VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [audio.id, audio.provider, audio.voice, audio.text, audio.contentType, audio.bytes],
    );
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
