// Minimal in-memory MongoDB stand-in covering only the operators this project's
// achievement store relies on (findOne, updateOne with $set/$inc/$push/$setOnInsert,
// findOneAndUpdate with upsert + returnDocument, and a simple find().sort().limit().toArray()).

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function matchesFilter(doc, filter = {}) {
  if (filter.$or) return filter.$or.some((part) => matchesFilter(doc, part));
  return Object.entries(filter).every(([key, condition]) => {
    // Like MongoDB, a path through an array ('unlocked.id') matches against
    // that field of every element.
    const actual = key.split('.').reduce((value, part) => (
      Array.isArray(value) && !/^\d+$/.test(part) ? value.map((item) => item?.[part]) : value?.[part]
    ), doc);
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      return Object.entries(condition).every(([op, val]) => {
        if (op === '$ne') return Array.isArray(actual) ? !actual.includes(val) : actual !== val;
        if (op === '$in') return val.includes(actual);
        if (op === '$lt') return actual < val;
        if (op === '$gt') return actual > val;
        if (op === '$gte') return actual >= val;
        if (op === '$lte') return actual <= val;
        if (op === '$exists') return val ? actual !== undefined : actual === undefined;
        return true;
      });
    }
    // Real MongoDB matches a scalar filter value against an array field if
    // the array contains that value (implicit $elemMatch-style equality).
    if (Array.isArray(actual)) return actual.includes(condition);
    return actual === condition;
  });
}

function applyUpdate(doc, update, isInsert = false) {
  const setPath = (key, value) => {
    const parts = key.split('.');
    const last = parts.pop();
    const target = parts.reduce((current, part) => {
      if (!current[part] || typeof current[part] !== 'object') current[part] = {};
      return current[part];
    }, doc);
    target[last] = value;
  };
  if (isInsert && update.$setOnInsert) Object.entries(update.$setOnInsert).forEach(([key, value]) => setPath(key, value));
  if (update.$set) Object.entries(update.$set).forEach(([key, value]) => setPath(key, value));
  if (update.$inc) {
    for (const [key, amount] of Object.entries(update.$inc)) {
      const parts = key.split('.');
      const last = parts.pop();
      const target = parts.reduce((current, part) => {
        if (!current[part] || typeof current[part] !== 'object') current[part] = {};
        return current[part];
      }, doc);
      target[last] = (target[last] || 0) + amount;
    }
  }
  if (update.$unset) {
    for (const key of Object.keys(update.$unset)) {
      const parts = key.split('.');
      const last = parts.pop();
      const target = parts.reduce((current, part) => current?.[part], doc);
      if (target && typeof target === 'object') delete target[last];
    }
  }
  if (update.$push) {
    for (const [key, value] of Object.entries(update.$push)) {
      if (!Array.isArray(doc[key])) doc[key] = [];
      if (value && Array.isArray(value.$each)) doc[key].push(...value.$each);
      else doc[key].push(value);
    }
  }
  return doc;
}

class FakeCursor {
  constructor(docs) { this.docs = docs; }
  sort(spec) {
    const [[key, dir]] = Object.entries(spec);
    this.docs = [...this.docs].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
    return this;
  }
  limit(n) { this.docs = this.docs.slice(0, n); return this; }
  async toArray() { return this.docs.map(clone); }
}

class FakeCollection {
  constructor() { this.docs = []; }

  async findOne(filter = {}) {
    const doc = this.docs.find((d) => matchesFilter(d, filter));
    return doc ? clone(doc) : null;
  }

  find(filter = {}) {
    return new FakeCursor(this.docs.filter((d) => matchesFilter(d, filter)));
  }

  async updateOne(filter, update, options = {}) {
    let doc = this.docs.find((d) => matchesFilter(d, filter));
    if (!doc) {
      if (!options.upsert) return { matchedCount: 0, modifiedCount: 0 };
      doc = { ...filterToDoc(filter) };
      this.docs.push(doc);
      applyUpdate(doc, update, true);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    applyUpdate(doc, update);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(filter, update) {
    const matches = this.docs.filter((doc) => matchesFilter(doc, filter));
    matches.forEach((doc) => applyUpdate(doc, update));
    return { matchedCount: matches.length, modifiedCount: matches.length };
  }

  async findOneAndUpdate(filter, update, options = {}) {
    let doc = this.docs.find((d) => matchesFilter(d, filter));
    const before = doc ? clone(doc) : null;
    if (!doc) {
      if (!options.upsert) return options.includeResultMetadata ? { value: null } : null;
      doc = { ...filterToDoc(filter) };
      this.docs.push(doc);
    }
    applyUpdate(doc, update, !before);
    const after = clone(doc);
    const result = options.returnDocument === 'before' ? before : after;
    return options.includeResultMetadata ? { value: result } : result;
  }

  async insertOne(doc) { this.docs.push({ ...doc }); return { insertedId: doc._id }; }

  async deleteMany(filter = {}) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !matchesFilter(d, filter));
    return { deletedCount: before - this.docs.length };
  }

  async countDocuments(filter = {}) { return this.docs.filter((d) => matchesFilter(d, filter)).length; }
}

function filterToDoc(filter) {
  const doc = {};
  for (const [key, value] of Object.entries(filter)) {
    if (typeof value !== 'object' || value === null) doc[key] = value;
  }
  return doc;
}

class FakeDb {
  constructor() { this.collections = new Map(); }
  collection(name) {
    if (!this.collections.has(name)) this.collections.set(name, new FakeCollection());
    return this.collections.get(name);
  }
}

module.exports = { FakeDb, FakeCollection };
