/**
 * Supabase-js compatible query client backed by local PostgreSQL (pg).
 * Supports the subset of .from().select/insert/update/delete used by RapidRescue.
 */
const { Pool } = require('pg');

let pool = null;
let fkCache = null;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  pool = new Pool({ connectionString: url });
  pool.on('error', (err) => {
    console.error('[pg] pool error:', err.message);
  });
  return pool;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function asError(err) {
  if (!err) return null;
  return {
    message: err.message || String(err),
    code: err.code || undefined,
    details: err.detail || undefined,
    hint: err.hint || undefined,
  };
}

/** Parse PostgREST-style select with nested embeds */
function parseSelect(selectStr) {
  const raw = String(selectStr || '*').trim();
  if (!raw || raw === '*') {
    return { columns: ['*'], embeds: [] };
  }

  const embeds = [];
  const columns = [];
  let i = 0;
  const s = raw.replace(/\s+/g, ' ').trim();

  function readName() {
    let name = '';
    while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) {
      name += s[i];
      i += 1;
    }
    return name;
  }

  function skipSpace() {
    while (i < s.length && /\s/.test(s[i])) i += 1;
  }

  function readEmbedBody() {
    let depth = 1;
    let body = '';
    i += 1; // skip '('
    while (i < s.length && depth > 0) {
      const ch = s[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
      if (depth > 0) body += ch;
      i += 1;
    }
    return body.trim();
  }

  while (i < s.length) {
    skipSpace();
    if (i >= s.length) break;
    if (s[i] === ',') {
      i += 1;
      continue;
    }
    const name = readName();
    if (!name) {
      i += 1;
      continue;
    }
    skipSpace();
    if (s[i] === '(') {
      const body = readEmbedBody();
      embeds.push({ relation: name, ...parseSelect(body || '*') });
    } else {
      columns.push(name);
    }
  }

  if (!columns.length && !embeds.length) columns.push('*');
  if (!columns.length && embeds.length) columns.push('*');
  return { columns, embeds };
}

async function loadForeignKeys(client) {
  if (fkCache) return fkCache;
  const { rows } = await client.query(`
    SELECT
      tc.table_name AS from_table,
      kcu.column_name AS from_column,
      ccu.table_name AS to_table,
      ccu.column_name AS to_column
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
  `);

  // Manual fallbacks for common RapidRescue relations if catalog is incomplete
  const extras = [
    { from_table: 'incidents', from_column: 'user_id', to_table: 'users', to_column: 'user_id' },
    { from_table: 'locations', from_column: 'incident_id', to_table: 'incidents', to_column: 'incident_id' },
    { from_table: 'dispatch', from_column: 'incident_id', to_table: 'incidents', to_column: 'incident_id' },
    { from_table: 'dispatch', from_column: 'responder_id', to_table: 'responders', to_column: 'responder_id' },
  ];

  const all = [...rows];
  for (const ex of extras) {
    const exists = all.some(
      (r) =>
        r.from_table === ex.from_table &&
        r.from_column === ex.from_column &&
        r.to_table === ex.to_table
    );
    if (!exists) all.push(ex);
  }

  fkCache = all;
  return fkCache;
}

function resolveEmbedLink(fks, parentTable, relation) {
  // Child points to parent (one-to-many from parent): locations.incident_id -> incidents
  const asChild = fks.find((fk) => fk.from_table === relation && fk.to_table === parentTable);
  if (asChild) {
    return {
      kind: 'many',
      table: relation,
      parentKey: asChild.to_column,
      childKey: asChild.from_column,
    };
  }
  // Parent points to relation (many-to-one): incidents.user_id -> users
  const asParent = fks.find((fk) => fk.from_table === parentTable && fk.to_table === relation);
  if (asParent) {
    return {
      kind: 'one',
      table: relation,
      parentKey: asParent.from_column,
      childKey: asParent.to_column,
    };
  }
  return null;
}

async function attachEmbeds(client, parentTable, rows, embeds) {
  if (!embeds?.length || !rows?.length) return rows;
  const fks = await loadForeignKeys(client);
  const result = rows.map((r) => ({ ...r }));

  for (const embed of embeds) {
    const link = resolveEmbedLink(fks, parentTable, embed.relation);
    if (!link) {
      for (const row of result) row[embed.relation] = null;
      continue;
    }

    const parentKeys = [...new Set(result.map((r) => r[link.parentKey]).filter((v) => v != null))];
    if (!parentKeys.length) {
      for (const row of result) {
        row[embed.relation] = link.kind === 'many' ? [] : null;
      }
      continue;
    }

    const colSql =
      embed.columns.includes('*') || !embed.columns.length
        ? '*'
        : embed.columns.map(quoteIdent).join(', ');

    // Always include join key for nesting
    const needKey = link.childKey;
    let selectSql = colSql;
    if (colSql !== '*' && !embed.columns.includes(needKey)) {
      selectSql = `${colSql}, ${quoteIdent(needKey)}`;
    }

    let relatedRows;
    try {
      const typed = await client.query(
        `SELECT ${selectSql} FROM ${quoteIdent(link.table)} WHERE ${quoteIdent(link.childKey)} = ANY($1)`,
        [parentKeys]
      );
      relatedRows = typed.rows;
    } catch {
      const fallback = await client.query(
        `SELECT ${selectSql} FROM ${quoteIdent(link.table)} WHERE ${quoteIdent(link.childKey)}::text = ANY($1::text[])`,
        [parentKeys.map(String)]
      );
      relatedRows = fallback.rows;
    }

    const nested = await attachEmbeds(client, link.table, relatedRows, embed.embeds);

    if (link.kind === 'many') {
      const byParent = new Map();
      for (const rel of nested) {
        const key = String(rel[link.childKey]);
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(rel);
      }
      for (const row of result) {
        row[embed.relation] = byParent.get(String(row[link.parentKey])) || [];
      }
    } else {
      const byChild = new Map();
      for (const rel of nested) {
        byChild.set(String(rel[link.childKey]), rel);
      }
      for (const row of result) {
        row[embed.relation] = byChild.get(String(row[link.parentKey])) || null;
      }
    }
  }

  return result;
}

function buildWhere(filters, startIndex = 1) {
  const clauses = [];
  const params = [];
  let idx = startIndex;

  for (const f of filters) {
    if (f.type === 'eq') {
      clauses.push(`${quoteIdent(f.column)} = $${idx++}`);
      params.push(f.value);
    } else if (f.type === 'neq') {
      clauses.push(`${quoteIdent(f.column)} <> $${idx++}`);
      params.push(f.value);
    } else if (f.type === 'in') {
      if (!Array.isArray(f.value) || f.value.length === 0) {
        clauses.push('FALSE');
      } else {
        clauses.push(`${quoteIdent(f.column)} = ANY($${idx++})`);
        params.push(f.value);
      }
    } else if (f.type === 'ilike') {
      clauses.push(`${quoteIdent(f.column)} ILIKE $${idx++}`);
      params.push(f.value);
    }
  }

  return {
    sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
    params,
    nextIndex: idx,
  };
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this._op = 'select';
    this._select = '*';
    this._filters = [];
    this._order = null;
    this._limit = null;
    this._payload = null;
    this._wantSingle = false;
    this._wantMaybeSingle = false;
    this._returnSelect = null;
  }

  select(columns = '*') {
    if (this._op === 'insert' || this._op === 'update') {
      this._returnSelect = columns;
    } else {
      this._op = 'select';
      this._select = columns;
    }
    return this;
  }

  insert(rows) {
    this._op = 'insert';
    this._payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(values) {
    this._op = 'update';
    this._payload = values;
    return this;
  }

  delete() {
    this._op = 'delete';
    return this;
  }

  eq(column, value) {
    this._filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column, value) {
    this._filters.push({ type: 'neq', column, value });
    return this;
  }

  in(column, values) {
    this._filters.push({ type: 'in', column, value: values });
    return this;
  }

  ilike(column, value) {
    this._filters.push({ type: 'ilike', column, value });
    return this;
  }

  order(column, opts = {}) {
    this._order = { column, ascending: opts.ascending !== false };
    return this;
  }

  limit(n) {
    this._limit = Number(n);
    return this;
  }

  single() {
    this._wantSingle = true;
    this._wantMaybeSingle = false;
    return this;
  }

  maybeSingle() {
    this._wantMaybeSingle = true;
    this._wantSingle = false;
    return this;
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  async _execute() {
    const client = await getPool().connect();
    try {
      let data = null;
      let error = null;

      if (this._op === 'select') {
        const parsed = parseSelect(this._select);
        const colSql = parsed.columns.includes('*')
          ? '*'
          : parsed.columns.map(quoteIdent).join(', ');
        const where = buildWhere(this._filters);
        let sql = `SELECT ${colSql} FROM ${quoteIdent(this.table)}${where.sql}`;
        if (this._order) {
          sql += ` ORDER BY ${quoteIdent(this._order.column)} ${this._order.ascending ? 'ASC' : 'DESC'}`;
        }
        if (this._limit != null) sql += ` LIMIT ${Number(this._limit)}`;

        const result = await client.query(sql, where.params);
        data = await attachEmbeds(client, this.table, result.rows, parsed.embeds);
      } else if (this._op === 'insert') {
        const rows = this._payload || [];
        if (!rows.length) {
          data = [];
        } else {
          const keys = Object.keys(rows[0]);
          const cols = keys.map(quoteIdent).join(', ');
          const values = [];
          const placeholders = rows.map((row, rIdx) => {
            const parts = keys.map((k, cIdx) => {
              values.push(row[k]);
              return `$${rIdx * keys.length + cIdx + 1}`;
            });
            return `(${parts.join(', ')})`;
          });

          const returning = this._returnSelect != null ? ' RETURNING *' : '';
          const sql = `INSERT INTO ${quoteIdent(this.table)} (${cols}) VALUES ${placeholders.join(', ')}${returning}`;
          const result = await client.query(sql, values);

          if (this._returnSelect != null) {
            const parsed = parseSelect(this._returnSelect === true ? '*' : this._returnSelect);
            let out = result.rows;
            if (parsed.embeds.length) {
              out = await attachEmbeds(client, this.table, out, parsed.embeds);
            }
            if (!parsed.columns.includes('*') && parsed.columns.length) {
              out = out.map((row) => {
                const next = {};
                for (const c of parsed.columns) next[c] = row[c];
                for (const e of parsed.embeds) next[e.relation] = row[e.relation];
                return next;
              });
            }
            data = out;
          } else {
            data = null;
          }
        }
      } else if (this._op === 'update') {
        const values = this._payload || {};
        const keys = Object.keys(values);
        if (!keys.length) {
          data = null;
        } else {
          const setParts = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`);
          const params = keys.map((k) => values[k]);
          const where = buildWhere(this._filters, params.length + 1);
          const returning = this._returnSelect != null ? ' RETURNING *' : '';
          const sql = `UPDATE ${quoteIdent(this.table)} SET ${setParts.join(', ')}${where.sql}${returning}`;
          const result = await client.query(sql, [...params, ...where.params]);

          if (this._returnSelect != null) {
            const parsed = parseSelect(this._returnSelect === true ? '*' : this._returnSelect);
            let out = result.rows;
            if (parsed.embeds.length) {
              out = await attachEmbeds(client, this.table, out, parsed.embeds);
            }
            data = out;
          } else {
            data = null;
          }
        }
      } else if (this._op === 'delete') {
        const where = buildWhere(this._filters);
        const sql = `DELETE FROM ${quoteIdent(this.table)}${where.sql}`;
        await client.query(sql, where.params);
        data = null;
      }

      if ((this._wantSingle || this._wantMaybeSingle) && Array.isArray(data)) {
        if (data.length === 0) {
          if (this._wantSingle) {
            return {
              data: null,
              error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
            };
          }
          data = null;
        } else if (data.length > 1 && this._wantSingle) {
          return {
            data: null,
            error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
          };
        } else {
          data = data[0];
        }
      }

      return { data, error };
    } catch (err) {
      return { data: null, error: asError(err) };
    } finally {
      client.release();
    }
  }
}

function createPgClient() {
  return {
    from(table) {
      return new QueryBuilder(table);
    },
    async query(sql, params) {
      return getPool().query(sql, params);
    },
    async end() {
      if (pool) {
        await pool.end();
        pool = null;
      }
    },
  };
}

module.exports = { createPgClient, getPool };
