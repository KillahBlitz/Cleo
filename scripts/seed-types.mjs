import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || process.env.NUXT_MONGODB_URI;
if (!uri) { console.error('Falta MONGODB_URI.'); process.exit(1); }
const categories = [
  { mode: 'auction', slug: 'hot-wheels', name: 'Hot Wheels', order: 1 },
  { mode: 'auction', slug: 'munecas', name: 'Muñecas', order: 2 },
  { mode: 'auction', slug: 'ropa', name: 'Ropa', order: 3 },
  { mode: 'sale', slug: 'labiales', name: 'Labiales', order: 1 },
];
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  const types = client.db('cleo_db').collection('types');
  await types.createIndex({ mode: 1, slug: 1 }, { unique: true });
  let created = 0;
  for (const category of categories) {
    const result = await types.updateOne(
      { mode: category.mode, slug: category.slug },
      { $setOnInsert: { ...category, active: true, createdAt: new Date(), updatedAt: new Date() } },
      { upsert: true },
    );
    created += result.upsertedCount;
  }
  const saved = await types.find({ $or: categories.map(c => ({ mode: c.mode, slug: c.slug })) }).sort({ order: 1 }).toArray();
  if (saved.length !== categories.length || saved.some(c => !c.active || !c.name)) throw new Error('InvalidCatalog');
  console.log(JSON.stringify({ database: 'cleo_db', collection: 'types', created, categories: saved.map(c => ({ id: c._id.toHexString(), name: c.name, mode: c.mode })), verified: true }));
} catch (error) {
  console.error(`No se pudo cargar/verificar el catálogo (${error.name}).`);
  process.exitCode = 1;
} finally { await client.close(); }
